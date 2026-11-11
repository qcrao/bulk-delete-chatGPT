if (typeof window.remoteConfigLoaded === "undefined") {
  console.log("remoteConfig.js loaded");

  window.remoteConfigLoaded = true;

  // Remote overrides for ChatGPT selectors and menu labels, so a ChatGPT UI
  // change can be fixed by updating data on the server instead of shipping a
  // release. Only whitelisted keys are applied, each value is validated on its
  // own, and anything invalid keeps the bundled default. Values are only ever
  // used as CSS selectors or label text, never executed.

  const MAX_SELECTOR_LENGTH = 500;
  const MAX_STRING_LENGTH = 60;
  const MAX_STRATEGIES = 10;
  const TIMEOUT_RANGE = [200, 60000];
  const STRING_KEY = /^(DELETE|ARCHIVE)(_[A-Z_]+)?$/;

  function isValidSelector(selector) {
    if (typeof selector !== "string" || !selector.trim() || selector.length > MAX_SELECTOR_LENGTH) {
      return false;
    }
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Returns the overrides that pass validation, plus the keys that were dropped.
  function sanitizeUiConfig(raw, defaults) {
    const accepted = { SELECTORS: {}, BUTTON_STRATEGIES: {}, STRINGS: {}, TIMEOUTS: {} };
    const rejected = [];
    if (!raw || typeof raw !== "object") return { accepted, rejected };

    for (const [key, value] of Object.entries(raw.SELECTORS || {})) {
      // conversationsCheckbox is the extension's own class, not ChatGPT's.
      const allowed = key in defaults.SELECTORS && key !== "conversationsCheckbox";
      if (allowed && isValidSelector(value)) accepted.SELECTORS[key] = value;
      else rejected.push(`SELECTORS.${key}`);
    }

    for (const [key, value] of Object.entries(raw.BUTTON_STRATEGIES || {})) {
      const valid =
        key in defaults.BUTTON_STRATEGIES &&
        Array.isArray(value) &&
        value.length > 0 &&
        value.length <= MAX_STRATEGIES &&
        value.every((strategy) => strategy === "text-fallback" || isValidSelector(strategy));
      if (valid) accepted.BUTTON_STRATEGIES[key] = value.slice();
      else rejected.push(`BUTTON_STRATEGIES.${key}`);
    }

    // New keys are allowed: text matching picks up every DELETE_* / ARCHIVE_* label.
    for (const [key, value] of Object.entries(raw.STRINGS || {})) {
      const valid =
        STRING_KEY.test(key) &&
        typeof value === "string" &&
        value.trim() &&
        value.length <= MAX_STRING_LENGTH;
      if (valid) accepted.STRINGS[key] = value.trim();
      else rejected.push(`STRINGS.${key}`);
    }

    for (const [key, value] of Object.entries(raw.TIMEOUTS || {})) {
      if (key in defaults.TIMEOUTS && Number.isFinite(value)) {
        accepted.TIMEOUTS[key] = Math.round(
          Math.min(TIMEOUT_RANGE[1], Math.max(TIMEOUT_RANGE[0], value))
        );
      } else {
        rejected.push(`TIMEOUTS.${key}`);
      }
    }

    for (const key of Object.keys(raw)) {
      if (!(key in accepted)) rejected.push(key);
    }
    return { accepted, rejected };
  }

  const SECTIONS = ["SELECTORS", "BUTTON_STRATEGIES", "STRINGS", "TIMEOUTS"];
  const bundledDefaults = JSON.parse(
    JSON.stringify(Object.fromEntries(SECTIONS.map((section) => [section, window.UI_CONFIG[section]])))
  );

  // Mutates UI_CONFIG in place: other modules (and window.Selectors) hold
  // references to these objects and read them on every use. Starts from the
  // bundled defaults so keys dropped from a newer config don't linger.
  function applyUiConfig(accepted) {
    for (const section of SECTIONS) {
      const target = window.UI_CONFIG[section];
      for (const key of Object.keys(target)) delete target[key];
      Object.assign(target, JSON.parse(JSON.stringify(bundledDefaults[section])), accepted[section]);
    }
  }

  function fetchRemoteConfig() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: "getUiConfig" }, (response) => {
          resolve(chrome.runtime.lastError ? null : response);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  async function refresh() {
    try {
      const response = await fetchRemoteConfig();
      // No answer (offline, background asleep): keep whatever is applied now.
      if (!response) return;
      const version = response.version && response.config ? response.version : null;
      if (version === RemoteConfig.version) return;

      const { accepted, rejected } = sanitizeUiConfig(version ? response.config : null, bundledDefaults);
      applyUiConfig(accepted);
      RemoteConfig.version = version;
      RemoteConfig.rejected = rejected;
      console.log(version ? `Applied remote UI config v${version}` : "Using bundled UI config", accepted);
      if (rejected.length) {
        console.warn("Ignored invalid remote UI config keys:", rejected);
      }
    } catch (error) {
      console.warn("Could not apply remote UI config:", error);
    }
  }

  const RemoteConfig = {
    version: null,
    rejected: [],
    sanitizeUiConfig,
    // Re-checked before every bulk run; the background caches the fetch.
    refresh,
    ready: null
  };
  RemoteConfig.ready = refresh();

  window.RemoteConfig = RemoteConfig;

} else {
  console.log("remoteConfig.js already loaded, skipping re-initialization");
}
