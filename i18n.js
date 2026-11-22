/**
 * ChatGPT Bulk Delete - i18n runtime
 *
 * Shared by the popup and the content scripts (no build step, no deps).
 *
 * Language: a manual choice from Settings wins; otherwise the extension
 * follows the language of the ChatGPT page (<html lang>, which ChatGPT sets
 * from Settings > General > App language, reloading the page on change),
 * then the browser language, then English.
 *
 * Catalogs live in locales/<code>.json. en.json is the source of truth
 * ({ key: { message, description } }); translations are flat
 * ({ key: message }). Missing keys fall back to English.
 *
 * Messages use a subset of ICU MessageFormat:
 *   {name}                                   argument (numbers are localized)
 *   {count, plural, one {# chat} other {# chats}}   plural (=N, CLDR categories)
 *   {kind, select, a {...} other {...}}      select
 *   <b>bold</b>, <terms>Terms</terms>        rich-text tags, see apply()
 * Apostrophes are plain text (no ICU quoting).
 */
(function () {
  "use strict";

  if (window.BDI18n) return;

  const OVERRIDE_KEY = "BulkDeleteChatGPT_localeOverride";
  const PAGE_LANG_KEY = "BulkDeleteChatGPT_pageLang";
  const FALLBACK = "en";

  // Every language in ChatGPT's App language menu (read from the menu's
  // data-value codes on 2026-11-22), as catalog codes.
  const LOCALES = [
    "en", "am", "ar", "bg", "bn", "bs", "ca", "cs", "da", "de", "el", "es", "es-419",
    "et", "fa", "fi", "fil", "fr", "fr-CA", "gu", "hi", "hi-Latn", "hr", "hu", "hy",
    "id", "is", "it", "ja", "ka", "kk", "kn", "ko", "lt", "lv", "mk", "ml", "mn", "mr",
    "ms", "my", "nb", "nl", "pa", "pl", "pt-BR", "pt-PT", "ro", "ru", "sk", "sl", "so",
    "sq", "sr", "sv", "sw", "ta", "te", "th", "tr", "uk", "ur", "vi", "zh-CN", "zh-HK",
    "zh-TW"
  ];
  const RTL = new Set(["ar", "fa", "ur"]);
  const LOCALE_BY_LOWER = new Map(LOCALES.map((code) => [code.toLowerCase(), code]));
  const LANGUAGE_ALIASES = { tl: "fil", no: "nb", nn: "nb", in: "id", iw: "he" };

  // BCP 47 tag (any case, "_" or "-") -> catalog code, or null.
  function resolveLocale(tag) {
    if (!tag || typeof tag !== "string") return null;
    let locale;
    try {
      locale = new Intl.Locale(Intl.getCanonicalLocales(tag.trim().replace(/_/g, "-"))[0]);
    } catch (error) {
      return null;
    }
    const language = LANGUAGE_ALIASES[locale.language] || locale.language;
    const { script, region } = locale;

    switch (language) {
      case "zh":
        if (region === "HK" || region === "MO") return "zh-HK";
        if (script === "Hant" || region === "TW") return "zh-TW";
        return "zh-CN";
      case "es":
        return !region || region === "ES" ? "es" : "es-419";
      case "pt":
        return region === "PT" ? "pt-PT" : "pt-BR";
      case "fr":
        return region === "CA" ? "fr-CA" : "fr";
      case "hi":
        return script === "Latn" ? "hi-Latn" : "hi";
      default:
        return LOCALE_BY_LOWER.get(language) || null;
    }
  }

  function isRtl(code) {
    return RTL.has(code);
  }

  // Native name of a catalog language, e.g. "Deutsch", "日本語".
  // Each language's own name (endonym), as ChatGPT's language menu shows it.
  // A fixed table: Intl.DisplayNames lacks data for some languages in Chrome.
  const NATIVE_NAMES = {
      "en": "English",
      "am": "አማርኛ",
      "ar": "العربية",
      "bg": "Български",
      "bn": "বাংলা",
      "bs": "Bosanski",
      "ca": "Català",
      "cs": "Čeština",
      "da": "Dansk",
      "de": "Deutsch",
      "el": "Ελληνικά",
      "es": "Español (España)",
      "es-419": "Español (Latinoamérica)",
      "et": "Eesti",
      "fa": "فارسی",
      "fi": "Suomi",
      "fil": "Filipino",
      "fr": "Français (France)",
      "fr-CA": "Français (Canada)",
      "gu": "ગુજરાતી",
      "hi": "हिन्दी",
      "hi-Latn": "Hinglish",
      "hr": "Hrvatski",
      "hu": "Magyar",
      "hy": "Հայերեն",
      "id": "Bahasa Indonesia",
      "is": "Íslenska",
      "it": "Italiano",
      "ja": "日本語",
      "ka": "ქართული",
      "kk": "Қазақ тілі",
      "kn": "ಕನ್ನಡ",
      "ko": "한국어",
      "lt": "Lietuvių",
      "lv": "Latviešu",
      "mk": "Македонски",
      "ml": "മലയാളം",
      "mn": "Монгол",
      "mr": "मराठी",
      "ms": "Bahasa Melayu",
      "my": "မြန်မာ",
      "nb": "Norsk bokmål",
      "nl": "Nederlands",
      "pa": "ਪੰਜਾਬੀ",
      "pl": "Polski",
      "pt-BR": "Português (Brasil)",
      "pt-PT": "Português (Portugal)",
      "ro": "Română",
      "ru": "Русский",
      "sk": "Slovenčina",
      "sl": "Slovenščina",
      "so": "Soomaali",
      "sq": "Shqip",
      "sr": "Српски",
      "sv": "Svenska",
      "sw": "Kiswahili",
      "ta": "தமிழ்",
      "te": "తెలుగు",
      "th": "ไทย",
      "tr": "Türkçe",
      "uk": "Українська",
      "ur": "اردو",
      "vi": "Tiếng Việt",
      "zh-CN": "简体中文",
      "zh-HK": "繁體中文（香港）",
      "zh-TW": "繁體中文（台灣）"
  };

  function nativeName(code) {
    return NATIVE_NAMES[code] || code;
  }

  // -------------------------------------------------------------------------
  // ICU subset
  // -------------------------------------------------------------------------

  const parsedCache = new Map();

  // Parses a message into nodes: strings, { arg }, { arg, type, options }, "#".
  function parse(message) {
    let cached = parsedCache.get(message);
    if (cached) return cached;
    let pos = 0;

    function parseNodes(insidePlural, untilBrace) {
      const nodes = [];
      let text = "";
      while (pos < message.length) {
        const ch = message[pos];
        if (ch === "{") {
          if (text) nodes.push(text), (text = "");
          pos++;
          nodes.push(parseArgument(insidePlural));
        } else if (ch === "}" && untilBrace) {
          break;
        } else if (ch === "#" && insidePlural) {
          if (text) nodes.push(text), (text = "");
          nodes.push("#");
          pos++;
        } else {
          text += ch;
          pos++;
        }
      }
      if (text) nodes.push(text);
      return nodes;
    }

    function readUntil(stops) {
      const start = pos;
      while (pos < message.length && !stops.includes(message[pos])) pos++;
      return message.slice(start, pos).trim();
    }

    function expect(ch) {
      if (message[pos] !== ch) {
        throw new SyntaxError(`Expected "${ch}" at ${pos} in: ${message}`);
      }
      pos++;
    }

    function parseArgument(insidePlural) {
      const arg = readUntil(",}");
      if (!arg) throw new SyntaxError(`Empty argument at ${pos} in: ${message}`);
      if (message[pos] === "}") {
        pos++;
        return { arg };
      }
      expect(",");
      const type = readUntil(",}");
      if (type !== "plural" && type !== "select") {
        throw new SyntaxError(`Unsupported type "${type}" in: ${message}`);
      }
      expect(",");
      const options = {};
      for (;;) {
        while (/\s/.test(message[pos])) pos++;
        if (message[pos] === "}") {
          pos++;
          break;
        }
        const selector = readUntil("{}");
        if (!selector || /\s/.test(selector)) {
          throw new SyntaxError(`Bad selector "${selector}" in: ${message}`);
        }
        expect("{");
        options[selector] = parseNodes(type === "plural" || insidePlural, true);
        expect("}");
      }
      if (!options.other) throw new SyntaxError(`Missing "other" in: ${message}`);
      return { arg, type, options };
    }

    cached = parseNodes(false, false);
    if (pos < message.length) throw new SyntaxError(`Unexpected "}" in: ${message}`);
    parsedCache.set(message, cached);
    return cached;
  }

  const numberFormats = new Map();
  const pluralRules = new Map();

  function formatNumber(value, locale = state.locale) {
    let format = numberFormats.get(locale);
    if (!format) {
      format = new Intl.NumberFormat(locale);
      numberFormats.set(locale, format);
    }
    return format.format(value);
  }

  function pluralCategory(value, locale) {
    let rules = pluralRules.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      pluralRules.set(locale, rules);
    }
    return rules.select(value);
  }

  function render(nodes, params, locale, pluralValue) {
    let out = "";
    for (const node of nodes) {
      if (typeof node === "string") {
        out += node === "#" && pluralValue !== undefined ? formatNumber(pluralValue, locale) : node;
        continue;
      }
      const value = lookupParam(params, node.arg);
      if (!node.type) {
        out += typeof value === "number" ? formatNumber(value, locale) : value == null ? "" : String(value);
      } else if (node.type === "plural") {
        const n = Number(value) || 0;
        const branch = node.options[`=${n}`] || node.options[pluralCategory(n, locale)] || node.options.other;
        out += render(branch, params, locale, n);
      } else {
        out += render(node.options[String(value)] || node.options.other, params, locale, pluralValue);
      }
    }
    return out;
  }

  // Values every message may use without passing them, e.g. {add} is the
  // label of the "Add" button, so instructions always match the button.
  const GLOBAL_PARAMS = {
    add: () => t("main.add"),
    manageBilling: () => t("account.manageBilling"),
    openFull: () => t("preview.open"),
    supportEmail: () => "support@qcrao.com"
  };

  function lookupParam(params, name) {
    if (params && Object.prototype.hasOwnProperty.call(params, name)) return params[name];
    return GLOBAL_PARAMS[name] ? GLOBAL_PARAMS[name]() : undefined;
  }

  // -------------------------------------------------------------------------
  // Catalogs
  // -------------------------------------------------------------------------

  const state = {
    locale: FALLBACK,
    messages: {},
    english: {},
    listeners: new Set(),
    ready: null
  };

  const isExtensionPage = /^(chrome|moz)-extension:$/.test(location.protocol);

  function flatten(catalog) {
    const out = {};
    for (const [key, value] of Object.entries(catalog || {})) {
      out[key] = typeof value === "string" ? value : value && value.message;
    }
    return out;
  }

  async function fetchCatalog(code) {
    if (isExtensionPage) {
      const response = await fetch(chrome.runtime.getURL(`locales/${code}.json`));
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${code}`);
      return flatten(await response.json());
    }
    // Content scripts can't read extension files without exposing them to
    // the page (web_accessible_resources); the background reads them instead.
    const response = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: "getLocaleCatalog", locale: code }, (reply) => {
          void chrome.runtime.lastError;
          resolve(reply);
        });
      } catch (error) {
        resolve(null);
      }
    });
    if (!response || !response.catalog) throw new Error(`No catalog for ${code}`);
    return flatten(response.catalog);
  }

  function t(key, params) {
    const message = state.messages[key] ?? state.english[key];
    if (message == null) {
      console.warn(`[i18n] Missing message: ${key}`);
      return key;
    }
    try {
      return render(parse(message), params, state.locale);
    } catch (error) {
      console.warn(`[i18n] Bad message ${state.locale}/${key}:`, error);
      const english = state.english[key];
      return english && english !== message ? render(parse(english), params, FALLBACK) : key;
    }
  }

  async function storageGet(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      return {};
    }
  }

  async function getOverride() {
    const value = (await storageGet(OVERRIDE_KEY))[OVERRIDE_KEY];
    return LOCALE_BY_LOWER.get(String(value || "").toLowerCase()) || null;
  }

  // On ChatGPT: remember the page language so the popup can follow it even
  // when it's opened on another tab.
  async function readPageLanguage() {
    if (isExtensionPage) return null;
    const lang = document.documentElement.lang || "";
    if (resolveLocale(lang)) {
      const stored = (await storageGet(PAGE_LANG_KEY))[PAGE_LANG_KEY];
      if (stored !== lang) chrome.storage.local.set({ [PAGE_LANG_KEY]: lang }).catch(() => {});
    }
    return lang;
  }

  // pageLang: the popup passes the active ChatGPT tab's <html lang>.
  async function detectLocale(pageLang) {
    const override = await getOverride();
    if (override) return override;
    return detectAutoLocale(pageLang);
  }

  // The language used when there is no manual choice ("Same as ChatGPT").
  async function detectAutoLocale(pageLang) {
    const fromPage = resolveLocale(pageLang) || resolveLocale(await readPageLanguage());
    if (fromPage) return fromPage;
    const stored = resolveLocale((await storageGet(PAGE_LANG_KEY))[PAGE_LANG_KEY]);
    if (stored) return stored;
    const ui = chrome.i18n && chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : "";
    return resolveLocale(ui) || resolveLocale(navigator.language) || FALLBACK;
  }

  async function load(locale) {
    if (!Object.keys(state.english).length) {
      state.english = await fetchCatalog(FALLBACK);
    }
    let messages = state.english;
    if (locale !== FALLBACK) {
      try {
        messages = await fetchCatalog(locale);
      } catch (error) {
        console.warn(`[i18n] Could not load ${locale}, using English:`, error);
        locale = FALLBACK;
      }
    }
    state.locale = locale;
    state.messages = messages;
  }

  async function init({ pageLang } = {}) {
    try {
      await load(await detectLocale(pageLang));
    } catch (error) {
      console.warn("[i18n] Init failed:", error);
    }
    if (!isExtensionPage && !Object.keys(state.english).length) scheduleRetry();
    return state.locale;
  }

  // A content script whose catalog request failed (service worker asleep or
  // restarting) would otherwise show raw keys until the next language change.
  let retries = 0;
  function scheduleRetry() {
    if (retries >= 5) return;
    retries++;
    setTimeout(() => reload(undefined, { force: true }), 1000 * retries);
  }

  // Reloads run one after another, so the last request always wins. Listeners
  // hear about a change once, when the strings they last saw are replaced.
  let reloadSeq = 0;
  let announced = null; // { locale, hadStrings } listeners last saw
  let pendingForce = false;
  function reload(pageLang, { force = false } = {}) {
    const seq = ++reloadSeq;
    pendingForce = pendingForce || force;
    const run = Promise.resolve(state.ready)
      .catch(() => {})
      .then(() => {
        if (!announced) announced = { locale: state.locale, hadStrings: Object.keys(state.english).length > 0 };
        return init({ pageLang });
      });
    state.ready = run;
    return run.then(() => {
      if (seq !== reloadSeq) return; // a newer reload owns the result
      const hasStrings = Object.keys(state.english).length > 0;
      const changed = state.locale !== announced.locale || (hasStrings && !announced.hadStrings) || (pendingForce && hasStrings);
      pendingForce = false;
      announced = { locale: state.locale, hadStrings: hasStrings };
      if (!changed) return;
      state.listeners.forEach((listener) => {
        try {
          listener(state.locale);
        } catch (error) {
          console.warn("[i18n] Listener failed:", error);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  const TAG_PATTERN = /<([a-z][a-z0-9]*)>([\s\S]*?)<\/\1>/g;

  // Fills `element` with `text`, turning <tag>...</tag> into elements.
  // A child marked data-i18n-slot="tag" in the original markup is the
  // template for that tag (keeps href, class...); <b> defaults to <strong>.
  // Only textContent is ever set: translations can't inject markup.
  function setRichText(element, text) {
    if (!element._bdSlots) {
      element._bdSlots = {};
      element.querySelectorAll("[data-i18n-slot]").forEach((slot) => {
        element._bdSlots[slot.dataset.i18nSlot] = slot.cloneNode(false);
      });
    }
    if (!text.includes("<")) {
      element.textContent = text;
      return;
    }
    const nodes = [];
    let last = 0;
    for (const match of text.matchAll(TAG_PATTERN)) {
      if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
      const template = element._bdSlots[match[1]];
      const child = template
        ? template.cloneNode(false)
        : document.createElement(match[1] === "b" ? "strong" : "span");
      child.textContent = match[2];
      nodes.push(child);
      last = match.index + match[0].length;
    }
    if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
    element.replaceChildren(...nodes);
  }

  // data-i18n-args: JSON params; {"usd": cents} values become prices.
  function elementParams(element) {
    if (!element.dataset.i18nArgs) return undefined;
    try {
      const raw = JSON.parse(element.dataset.i18nArgs);
      for (const [name, value] of Object.entries(raw)) {
        if (value && typeof value === "object" && "usd" in value) raw[name] = formatUsd(value.usd);
      }
      return raw;
    } catch (error) {
      console.warn("[i18n] Bad data-i18n-args:", element);
      return undefined;
    }
  }

  const ATTRIBUTE_BINDINGS = [
    ["i18nTitle", "title"],
    ["i18nAriaLabel", "aria-label"],
    ["i18nPlaceholder", "placeholder"]
  ];

  // Translates data-i18n (content), data-i18n-title, data-i18n-aria-label
  // and data-i18n-placeholder under root.
  function apply(root = document) {
    const elements = root.querySelectorAll(
      "[data-i18n], [data-i18n-title], [data-i18n-aria-label], [data-i18n-placeholder]"
    );
    elements.forEach((element) => {
      const params = elementParams(element);
      if (element.dataset.i18n) setRichText(element, t(element.dataset.i18n, params));
      for (const [dataKey, attribute] of ATTRIBUTE_BINDINGS) {
        if (element.dataset[dataKey]) element.setAttribute(attribute, t(element.dataset[dataKey], params));
      }
    });
    // Never touch ChatGPT's own <html> from a content script.
    if (root === document && isExtensionPage) {
      document.documentElement.lang = state.locale;
      document.documentElement.dir = isRtl(state.locale) ? "rtl" : "ltr";
    }
  }

  // Marks extension UI injected into ChatGPT with our language/direction.
  function markElement(element) {
    element.lang = state.locale;
    element.dir = isRtl(state.locale) ? "rtl" : "ltr";
  }

  // -------------------------------------------------------------------------
  // Formatting
  // -------------------------------------------------------------------------

  // Prices are charged in US dollars everywhere; only the format changes.
  function formatUsd(cents, { short = false } = {}) {
    const whole = cents % 100 === 0;
    return new Intl.NumberFormat(state.locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: short && whole ? 0 : 2,
      maximumFractionDigits: short && whole ? 0 : 2
    }).format(cents / 100);
  }

  function formatDate(unixSeconds) {
    return new Date(unixSeconds * 1000).toLocaleDateString(state.locale, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  // "in 3 hours"
  function formatHoursFromNow(hours) {
    try {
      return new Intl.RelativeTimeFormat(state.locale, { numeric: "always" }).format(hours, "hour");
    } catch (error) {
      return new Intl.RelativeTimeFormat(FALLBACK, { numeric: "always" }).format(hours, "hour");
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const BDI18n = {
    LOCALES,
    OVERRIDE_KEY,
    PAGE_LANG_KEY,
    get locale() {
      return state.locale;
    },
    get dir() {
      return isRtl(state.locale) ? "rtl" : "ltr";
    },
    get ready() {
      return state.ready;
    },
    t,
    apply,
    markElement,
    resolveLocale,
    nativeName,
    isRtl,
    parse,
    formatNumber,
    formatUsd,
    formatDate,
    formatHoursFromNow,
    init,
    reload,
    detectAutoLocale,
    async getOverride() {
      return getOverride();
    },
    async setOverride(code) {
      if (code && LOCALE_BY_LOWER.has(code.toLowerCase())) {
        await chrome.storage.local.set({ [OVERRIDE_KEY]: LOCALE_BY_LOWER.get(code.toLowerCase()) });
      } else {
        await chrome.storage.local.remove(OVERRIDE_KEY);
      }
    },
    onChange(listener) {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    }
  };

  window.BDI18n = BDI18n;

  // Content scripts start loading right away and follow later changes: the
  // override from Settings, or <html lang> (ChatGPT normally reloads the page
  // when its language changes, but don't rely on it).
  if (!isExtensionPage && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
    state.ready = init();
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && OVERRIDE_KEY in changes) reload();
      });
    } catch (error) {}
    new MutationObserver(() => reload()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"]
    });
  } else {
    state.ready = Promise.resolve(FALLBACK);
  }
})();
