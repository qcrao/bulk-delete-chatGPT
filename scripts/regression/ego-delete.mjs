// Release regression test: create N throwaway ChatGPT conversations in
// ego-browser, bulk delete them with this repo's extension code, and check the
// result. Run through scripts/regression-delete.sh, which fills in the
// placeholders below and pipes this file to `ego-browser nodejs`.
//
// Safety: the sidebar holds the user's real conversations. The run aborts
// unless the extension's own selection is exactly the conversations created
// here.

const REPO = "__REPO__";
const COUNT = Number("__COUNT__") || 3;
// The first conversation should be gone well before this (v7.12: ~1.5s).
const FIRST_DELETE_BUDGET_MS = 3000;
// The chat box: ChatGPT has dropped the #prompt-textarea id at times.
const COMPOSER = '#prompt-textarea, main form [contenteditable="true"]';

const fs = await import("node:fs/promises");
const localManifest = JSON.parse(await fs.readFile(`${REPO}/manifest.json`, "utf8"));
const localHandler = await fs.readFile(`${REPO}/conversationHandler.js`, "utf8");

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
};

const task = await taskSpace(`bulk delete regression ${new Date().toISOString().slice(0, 16)}`);
const chat = task.page("p1");
console.log({ taskSpaceId: task.spaceId });

// ChatGPT's home page now and then takes long to answer; retry the navigation.
async function openHome() {
  for (let attempt = 1; ; attempt++) {
    try {
      await chat.goto("https://chatgpt.com/", { timeout: 45000, waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
      console.log(`chatgpt.com did not load (attempt ${attempt}), retrying...`);
    }
  }
}

// 1. Find the unpacked extension that serves this repo's files.
//    (A store copy of the extension may be installed next to it.) Candidates
//    come from the content-script worlds on chatgpt.com: an idle MV3 service
//    worker is not listed as a target, but content scripts are always there.
await openHome();
await chat.waitForTimeout(2000);
await chat.cdp("egoAutomated.disable");
await chat.events();
await chat.cdp("Runtime.enable");
await chat.waitForTimeout(500);
const extIds = [...new Set(
  (await chat.events())
    .filter((e) => e.method === "Runtime.executionContextCreated")
    .map((e) => e.params.context.origin || "")
    .filter((origin) => origin.startsWith("chrome-extension://"))
    .map((origin) => origin.split("/")[2])
)];
await chat.cdp("Runtime.disable");
const probe = await task.newPage();
let extId = null;
for (const id of extIds) {
  try {
    await probe.goto(`chrome-extension://${id}/conversationHandler.js`, { timeout: 5000 });
    const text = await probe.evaluate(() => document.body.innerText);
    if (text.trim() === localHandler.trim()) { extId = id; break; }
  } catch {}
}
if (!extId) {
  console.log("ABORT: no installed extension serves this repo's conversationHandler.js.");
  console.log("Load the repo as an unpacked extension in ego-browser (chrome://extensions → Load unpacked).");
  await task.finish({ keep: [] });
  process.exit(1);
}
console.log({ extId, version: localManifest.version });

// 2. Reload it so the running code is what is on disk. The reload closes
//    the extension page, so the probe tab goes away with it.
await probe.goto(`chrome-extension://${extId}/popup.html`, { timeout: 5000 });
await probe.evaluate(() => { setTimeout(() => chrome.runtime.reload(), 100); return true; });
await chat.waitForTimeout(2500);

// 3. Create the test conversations.
const routes = [];
for (let n = 1; n <= COUNT; n++) {
  await openHome();
  await chat.waitForTimeout(2500);
  if (n === 1) {
    const loggedIn = await chat.evaluate(() => !document.querySelector('[data-testid="login-button"]'));
    if (!loggedIn) {
      console.log("ABORT: ChatGPT is not signed in in ego-browser. Sign in, then run again.");
      await task.handOff();
      process.exit(1);
    }
  }
  // The home page can open in "Work" mode, which has no chat composer:
  // keep switching to "Chat" until the composer shows up.
  await chat.waitForFunction((composer) => {
    const group = document.querySelector('[role="group"][aria-label="Composer mode"]');
    const button = group && [...group.querySelectorAll("button")].find((b) => b.textContent.trim() === "Chat");
    if (button && !window.__bdcChatAt) {
      button.click();
      window.__bdcChatAt = Date.now();
    }
    return Boolean(document.querySelector(composer))
      && (!button || Date.now() - window.__bdcChatAt > 1000);
  }, COMPOSER, { timeout: 30000 });
  const composerSelector = await chat.evaluate(
    () => (document.querySelector("#prompt-textarea") ? "#prompt-textarea" : 'main form [contenteditable="true"]')
  );
  await chat.click(composerSelector, { label: "focus prompt box" });
  await chat.keyboard.insertText(`BDC regression test ${n}/${COUNT}, reply with just: ok`);
  await chat.keyboard.press("Enter");
  // ChatGPT first shows a temporary /c/local-chatgpt:… URL; wait for the real id.
  await chat.waitForURL(/\/c\/[0-9a-f]{8}-[0-9a-f]{4}-/, { timeout: 60000 });
  await chat.waitForFunction(
    () => !!document.querySelector(`nav a[href="${location.pathname}"]`),
    undefined,
    { timeout: 30000 }
  );
  await chat.waitForTimeout(4000);
  routes.push(await chat.evaluate(() => location.pathname));
}
console.log({ routes });

// 4. Back on the home page, get into the extension's content-script world.
await openHome();
await chat.waitForFunction(
  (rs) => rs.every((r) => document.querySelector(`nav a[href="${r}"]`)),
  routes,
  { timeout: 20000 }
);
await chat.cdp("egoAutomated.disable");
await chat.events();
await chat.cdp("Runtime.enable");
await chat.waitForTimeout(500);
const ctx = (await chat.events())
  .filter((e) => e.method === "Runtime.executionContextCreated")
  .map((e) => e.params.context)
  .find((c) => c.origin === `chrome-extension://${extId}` && c.auxData?.isDefault === false);
if (!ctx) {
  console.log("ABORT: the extension's content scripts are not running on chatgpt.com.");
  process.exit(1);
}
const inExtension = (expression) =>
  chat.cdp("Runtime.evaluate", { contextId: ctx.id, expression, returnByValue: true, awaitPromise: true });

// 5. Add checkboxes and select only the test conversations.
await inExtension(await fs.readFile(`${REPO}/addCheckboxes.js`, "utf8"));
await chat.waitForSelector(".conversation-checkbox", { timeout: 10000 });
await chat.waitForTimeout(800);
await chat.evaluate((rs) => {
  const boxes = [...document.querySelectorAll(".conversation-checkbox")];
  boxes.forEach((b) => { if (b.checked) b.click(); });
  boxes.filter((b) => rs.includes(b.dataset.bulkDeleteRoute)).forEach((b) => b.click());
}, routes);
const selected = JSON.parse((await inExtension(
  "JSON.stringify(CommonUtils.getSelectedConversations().map((c) => c.dataset.bulkDeleteRoute))"
)).result.value);
if (selected.length !== routes.length || !selected.every((r) => routes.includes(r))) {
  console.log("ABORT: selection is not exactly the test conversations; nothing was deleted.", { selected });
  process.exit(1);
}

// 6. Timeline of what ChatGPT shows, recorded in the page.
await chat.evaluate((rs) => {
  window.__bdc = { t0: Date.now(), marks: [] };
  const seen = new Set();
  const mark = (k) => { if (!seen.has(k)) { seen.add(k); window.__bdc.marks.push([Date.now() - window.__bdc.t0, k]); } };
  const visible = (el) => el && el.getClientRects().length > 0;
  let menuOpen = false, dialogOpen = false, menus = 0, dialogs = 0;
  new MutationObserver(() => {
    const m = [...document.querySelectorAll('[role="menu"]')].some(visible);
    if (m && !menuOpen) mark(`menu ${++menus} open`);
    menuOpen = m;
    const d = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some(visible);
    if (d && !dialogOpen) mark(`confirm ${++dialogs} open`);
    if (!d && dialogOpen) mark(`confirm ${dialogs} closed`);
    dialogOpen = d;
    rs.forEach((r, i) => { if (!document.querySelector(`nav a[href="${r}"]`)) mark(`test chat ${i + 1} gone`); });
    if (document.querySelector("canvas[data-bulk-delete-confetti]")) mark("confetti shown");
  }).observe(document.body, { subtree: true, childList: true, attributes: true });
}, routes);

// 7. Run the delete the way the popup does (default delay settings, Pro = no cap).
await inExtension("window.ChatGPTBulkDeleteOperationSettings = { baseDelayMs: 1200, autoSlowdown: true, maxPerRun: null }; true");
await chat.events();
const t0 = Date.now();
await chat.cdp("Runtime.evaluate", {
  contextId: ctx.id,
  expression: await fs.readFile(`${REPO}/bulkDeleteConversations.js`, "utf8")
});
let allGone = true;
try {
  await chat.waitForFunction(
    (rs) => rs.every((r) => !document.querySelector(`nav a[href="${r}"]`)),
    routes,
    { timeout: 20000 * COUNT }
  );
} catch {
  allGone = false;
}
const totalMs = Date.now() - t0;
await chat.waitForTimeout(1500);

const marks = await chat.evaluate(() => window.__bdc.marks);
const logs = (await chat.events())
  .filter((e) => e.method === "Runtime.consoleAPICalled" && e.params.executionContextId === ctx.id)
  .map((e) => `+${Math.round(e.params.timestamp - t0)}ms ${e.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 120)}`)
  .filter((line) => !line.includes("[DEBUG]"));

console.log("\n--- timeline (ms since delete started) ---");
marks.forEach(([ms, label]) => console.log(`${String(ms).padStart(6)}  ${label}`));
console.log("\n--- extension log ---");
console.log(logs.join("\n"));

// 8. Checks.
console.log("\n--- checks ---");
check(allGone, `all ${COUNT} test chats left the sidebar (${totalMs}ms)`);
const firstGone = marks.find(([, label]) => label.endsWith(" gone"));
check(
  Boolean(firstGone) && firstGone[0] <= FIRST_DELETE_BUDGET_MS,
  `first chat gone within ${FIRST_DELETE_BUDGET_MS}ms (${firstGone ? firstGone[0] : "never"}ms)`
);
check(
  logs.some((line) => line.includes(`DELETE completed: ${COUNT} processed, 0 skipped`)),
  `extension reports ${COUNT} processed, 0 skipped`
);
check(marks.some(([, label]) => label === "confetti shown"), "confetti shown after everything was deleted");
const opens = logs.filter((line) => line.includes("Opening three-dot menu")).length;
const firstTryOpens = logs.filter((line) => line.includes("2a. Opening three-dot menu")).length;
check(
  opens === COUNT && firstTryOpens === COUNT,
  `every menu opened on the first try (${firstTryOpens}/${COUNT}, ${opens} attempts)`
);
const server = await chat.evaluate(async (ids) => {
  const session = await (await fetch("/api/auth/session")).json();
  const out = [];
  // The last delete can take a few seconds to show up on the server: poll.
  for (const id of ids) {
    const deadline = Date.now() + 15000;
    let entry;
    while (true) {
      const r = await fetch(`/backend-api/conversation/${id}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
      let body = null;
      try { body = await r.json(); } catch {}
      entry = { id, status: r.status, code: body?.detail?.code ?? null, visible: body?.is_visible };
      if (entry.code === "conversation_deleted" || entry.visible === false || Date.now() > deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    out.push(entry);
  }
  return out;
}, routes.map((r) => r.split("/c/")[1]));
server.forEach((s) =>
  check(s.code === "conversation_deleted" || s.visible === false, `server: ${s.id.slice(0, 8)} deleted (${s.status} ${s.code ?? ""})`)
);

console.log(`\nRESULT: ${failures.length ? `FAIL (${failures.length})` : "PASS"}`);
if (failures.length) {
  console.log(`Task space ${task.spaceId} left open for inspection.`);
  process.exit(1);
}
await task.finish({ keep: [] });
