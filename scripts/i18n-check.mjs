#!/usr/bin/env node
// Checks the locales/ catalogs and keeps _locales/ (manifest strings) in sync.
//
//   node scripts/i18n-check.mjs           check everything, exit 1 on errors
//   node scripts/i18n-check.mjs --write   also regenerate _locales/
//
// Checks: every ChatGPT language has a catalog with exactly the English keys;
// every message parses; arguments and rich-text tags match English; plurals
// cover every CLDR category the language uses for whole numbers; every key
// used in the code exists; manifest descriptions fit the store limit.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const errors = [];
const warnings = [];

// Load the runtime itself so the checker parses exactly like the extension.
const sandbox = { window: {}, location: { protocol: "file:" }, console, Intl, URL };
vm.runInNewContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8"), sandbox);
const { LOCALES, parse } = sandbox.window.BDI18n;

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const localesDir = path.join(root, "locales");
const english = Object.fromEntries(
  Object.entries(readJson(path.join(localesDir, "en.json"))).map(([k, v]) => [k, v.message])
);
const englishKeys = Object.keys(english);

// __MSG_name__ in the manifests -> catalog key.
const MANIFEST_KEYS = {
  extDescription: "manifest.description",
  extDescriptionFirefox: "manifest.descriptionFirefox",
  actionTitle: "manifest.actionTitle"
};

// Arguments, plural arguments and tags used by a message.
function inspect(message) {
  const args = new Set();
  const plurals = new Map(); // arg -> Set of selectors
  const walk = (nodes) => {
    for (const node of nodes) {
      if (typeof node === "string") continue;
      args.add(node.arg);
      if (node.type === "plural") {
        const selectors = plurals.get(node.arg) || new Set();
        Object.keys(node.options).forEach((s) => selectors.add(s));
        plurals.set(node.arg, selectors);
      }
      if (node.options) Object.values(node.options).forEach(walk);
    }
  };
  walk(parse(message));
  const tags = [...message.matchAll(/<([a-z][a-z0-9]*)>[\s\S]*?<\/\1>/g)].map((m) => m[1]).sort();
  const strayTags = message.replace(/<([a-z][a-z0-9]*)>[\s\S]*?<\/\1>/g, "").match(/<\/?[a-z][^>]*>/g);
  return { args, plurals, tags, strayTags };
}

// CLDR categories a language uses for whole numbers. Categories that only
// show up for huge numbers (e.g. French "many" for 1,000,000) are optional.
function integerCategories(locale) {
  const rules = new Intl.PluralRules(locale);
  const required = new Set();
  for (let n = 0; n <= 1000; n++) required.add(rules.select(n));
  return required;
}

const files = fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"));
for (const file of files) {
  const code = file.replace(/\.json$/, "");
  if (!LOCALES.includes(code)) errors.push(`locales/${file}: not in BDI18n.LOCALES`);
}

const catalogs = {};
for (const code of LOCALES) {
  const file = path.join(localesDir, `${code}.json`);
  if (!fs.existsSync(file)) {
    errors.push(`${code}: missing locales/${code}.json`);
    continue;
  }
  let raw;
  try {
    raw = readJson(file);
  } catch (error) {
    errors.push(`${code}: invalid JSON (${error.message})`);
    continue;
  }
  const messages = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : v?.message])
  );
  catalogs[code] = messages;

  for (const key of englishKeys) {
    if (typeof messages[key] !== "string" || !messages[key].trim()) errors.push(`${code}: missing ${key}`);
  }
  for (const key of Object.keys(messages)) {
    if (!(key in english)) errors.push(`${code}: unknown key ${key}`);
  }

  const required = integerCategories(code);
  for (const key of englishKeys) {
    const message = messages[key];
    if (typeof message !== "string") continue;
    let got;
    let want;
    try {
      got = inspect(message);
      want = inspect(english[key]);
    } catch (error) {
      errors.push(`${code}: ${key}: ${error.message}`);
      continue;
    }
    const missingArgs = [...want.args].filter((a) => !got.args.has(a));
    const extraArgs = [...got.args].filter((a) => !want.args.has(a));
    if (missingArgs.length) errors.push(`${code}: ${key}: missing {${missingArgs.join("}, {")}}`);
    if (extraArgs.length) errors.push(`${code}: ${key}: unknown {${extraArgs.join("}, {")}}`);
    if (got.tags.join() !== want.tags.join()) {
      errors.push(`${code}: ${key}: tags <${got.tags.join("><")}> should be <${want.tags.join("><")}>`);
    }
    if (got.strayTags) errors.push(`${code}: ${key}: unbalanced tag ${got.strayTags.join(" ")}`);
    for (const [arg, selectors] of got.plurals) {
      const missing = [...required].filter((c) => !selectors.has(c));
      if (missing.length) errors.push(`${code}: ${key}: plural {${arg}} lacks ${missing.join(", ")}`);
      const allowed = new Set(new Intl.PluralRules(code).resolvedOptions().pluralCategories);
      const bogus = [...selectors].filter((s) => !s.startsWith("=") && !allowed.has(s));
      if (bogus.length) warnings.push(`${code}: ${key}: plural {${arg}} has unused ${bogus.join(", ")}`);
    }
    if (code !== "en" && message === english[key] && /[a-z]{4,}/.test(message) && !/^\{/.test(message)) {
      warnings.push(`${code}: ${key}: same as English`);
    }
  }
  for (const key of ["manifest.description", "manifest.descriptionFirefox"]) {
    if (messages[key] && messages[key].length > 132) {
      errors.push(`${code}: ${key} is ${messages[key].length} characters (store limit 132)`);
    }
  }
}

// Keys referenced by the code.
const sourceFiles = fs.readdirSync(root).filter((f) => /\.(js|html)$/.test(f));
const used = new Set();
for (const file of sourceFiles) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const m of text.matchAll(/\bt\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]/g)) used.add(m[1]);
  for (const m of text.matchAll(/data-i18n(?:-title|-aria-label|-placeholder)?="([^"]+)"/g)) used.add(m[1]);
  // Keys picked at runtime: t(cond ? "a.b" : "a.c") and t(`a.${plan}`).
  if (file.endsWith(".js")) {
    for (const m of text.matchAll(/["']([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9_.]+)["']/g)) {
      if (m[1] in english) used.add(m[1]);
    }
    for (const m of text.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+\.)\$\{/g)) {
      englishKeys.filter((key) => key.startsWith(m[1])).forEach((key) => used.add(key));
    }
  }
}
for (const manifestFile of ["manifest.json", "manifest.firefox.json"]) {
  const text = fs.readFileSync(path.join(root, manifestFile), "utf8");
  for (const m of text.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
    if (!MANIFEST_KEYS[m[1]]) errors.push(`${manifestFile}: unknown __MSG_${m[1]}__`);
  }
}
for (const key of used) {
  if (!(key in english)) errors.push(`code uses unknown key ${key}`);
}
for (const key of englishKeys) {
  if (!used.has(key) && !key.startsWith("manifest.")) warnings.push(`en: ${key} is not used in the code`);
}

// _locales/: manifest strings for the languages Chrome accepts there.
// https://developer.chrome.com/docs/extensions/reference/api/i18n#locales
const CHROME_LOCALES = new Set(
  "ar am bg bn ca cs da de el en en_AU en_GB en_US es es_419 et fa fi fil fr gu he hi hr hu id it ja kn ko lt lv ml mr ms nl no pl pt_BR pt_PT ro ru sk sl sr sv sw ta te th tr uk vi zh_CN zh_TW".split(" ")
);
function chromeLocale(code) {
  const mapped = code === "nb" ? "no" : code.replace("-", "_");
  return CHROME_LOCALES.has(mapped) ? mapped : null;
}
const expected = {};
for (const code of LOCALES) {
  const target = chromeLocale(code);
  if (!target || !catalogs[code]) continue;
  const body = {};
  for (const [name, key] of Object.entries(MANIFEST_KEYS)) {
    body[name] = { message: catalogs[code][key] ?? english[key] };
  }
  expected[target] = JSON.stringify(body, null, 2) + "\n";
}
const underscoreDir = path.join(root, "_locales");
if (write) {
  fs.rmSync(underscoreDir, { recursive: true, force: true });
  for (const [target, content] of Object.entries(expected)) {
    fs.mkdirSync(path.join(underscoreDir, target), { recursive: true });
    fs.writeFileSync(path.join(underscoreDir, target, "messages.json"), content);
  }
  console.log(`Wrote _locales/ for ${Object.keys(expected).length} languages.`);
} else {
  const present = fs.existsSync(underscoreDir) ? fs.readdirSync(underscoreDir) : [];
  for (const target of new Set([...present, ...Object.keys(expected)])) {
    const file = path.join(underscoreDir, target, "messages.json");
    const actual = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (actual !== expected[target]) {
      errors.push(`_locales/${target} is out of date: run node scripts/i18n-check.mjs --write`);
    }
  }
}

for (const warning of warnings) console.warn(`warn  ${warning}`);
for (const error of errors) console.error(`error ${error}`);
console.log(
  `${LOCALES.length} languages, ${englishKeys.length} keys: ${errors.length} errors, ${warnings.length} warnings`
);
process.exit(errors.length ? 1 : 0);
