const CORE_SCRIPT_FILES = [
  "i18n.js",
  "extensionCore.js",
  "config.js",
  "remoteConfig.js",
  "globals.js",
  "utils.js",
  "chatgptApi.js",
  "domHandler.js",
  "conversationHandler.js",
  "confetti.js",
  "checkboxManager.js",
  "conversationPreview.js",
  "selectionBar.js"
];

const DELAY_SETTINGS_CONFIG = {
  storageKey: "BulkDeleteChatGPT_delaySettings",
  defaults: {
    baseDelayMs: 1200,
    autoSlowdown: true
  },
  minBaseDelayMs: 300,
  maxBaseDelayMs: 600000,
  maxIntraBatchDelayMs: 8000,
  maxBatchCooldownMs: 30000,
  batchSize: 10
};

const PLAN_INFO = {
  monthly: { cents: 490 },
  yearly: { cents: 1990 },
  lifetime: { cents: 3990 }
};
const LEGACY_PRICE_CENTS = 99;

const t = (key, params) => BDI18n.t(key, params);

const STORE_URL =
  "https://chromewebstore.google.com/detail/chatgpt-bulk-delete/effkgioceefcfaegehhfafjneeiabdjg?hl=en";

// ---------------------------------------------------------------------------
// Messaging and tab helpers
// ---------------------------------------------------------------------------

class BackgroundError extends Error {
  constructor(response) {
    super(response.error || "Request failed");
    this.status = response.status || 0;
    this.body = response.body || null;
    this.code = response.code || null; // e.g. "signin_canceled"
    this.detail = response.detail || null; // e.g. an OAuth error code
  }
}

function sendToBackground(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from background"));
        return;
      }
      if (response.error) {
        reject(new BackgroundError(response));
        return;
      }
      resolve(response);
    });
  });
}

function executeScriptFiles(tabId, files) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        files: files,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(results);
      }
    );
  });
}

function executeScriptFunction(tabId, func, args = []) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        func: func,
        args: args,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(results);
      }
    );
  });
}

async function loadCoreScripts(tabId) {
  await executeScriptFiles(tabId, CORE_SCRIPT_FILES);
}

async function setOperationSettings(tabId, settings) {
  await executeScriptFunction(
    tabId,
    (value) => {
      window.ChatGPTBulkDeleteOperationSettings = value;
      return true;
    },
    [settings]
  );
}

async function countSelectedConversations(tabId) {
  const [result] = await executeScriptFunction(tabId, () =>
    window.CommonUtils ? window.CommonUtils.getSelectedConversations().length : 0
  );
  return Number(result?.result || 0);
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      resolve(tab);
    });
  });
}

// ---------------------------------------------------------------------------
// Delay settings (unchanged from v6)
// ---------------------------------------------------------------------------

const SettingsManager = {
  sanitize(settings = {}) {
    const rawDelay = Number(settings.baseDelayMs);
    const baseDelayMs = Math.min(
      DELAY_SETTINGS_CONFIG.maxBaseDelayMs,
      Math.max(
        DELAY_SETTINGS_CONFIG.minBaseDelayMs,
        Number.isFinite(rawDelay)
          ? rawDelay
          : DELAY_SETTINGS_CONFIG.defaults.baseDelayMs
      )
    );

    return {
      baseDelayMs: Math.round(baseDelayMs),
      autoSlowdown:
        typeof settings.autoSlowdown === "boolean"
          ? settings.autoSlowdown
          : DELAY_SETTINGS_CONFIG.defaults.autoSlowdown
    };
  },

  async getSettings() {
    const rawSettings = localStorage.getItem(DELAY_SETTINGS_CONFIG.storageKey);
    let parsedSettings = {};
    try {
      parsedSettings = rawSettings ? JSON.parse(rawSettings) : {};
    } catch (error) {
      console.warn("Invalid delay settings found in localStorage:", error);
    }
    return this.sanitize(parsedSettings);
  },

  async saveSettings(settings) {
    const sanitizedSettings = this.sanitize(settings);
    localStorage.setItem(
      DELAY_SETTINGS_CONFIG.storageKey,
      JSON.stringify(sanitizedSettings)
    );
    return sanitizedSettings;
  },

  async resetSettings() {
    return this.saveSettings(DELAY_SETTINGS_CONFIG.defaults);
  }
};

async function initializeSettings() {
  const settingsButton = document.getElementById("settings-button");
  const settingsPanel = document.getElementById("settingsPanel");
  const operationDelayInput = document.getElementById("operationDelayInput");
  const autoSlowdownInput = document.getElementById("autoSlowdownInput");
  const delayPreview = document.getElementById("delayPreview");
  const saveButton = document.getElementById("saveDelaySettings");
  const resetButton = document.getElementById("resetDelaySettings");

  const applySettingsToForm = (settings) => {
    operationDelayInput.value = settings.baseDelayMs;
    autoSlowdownInput.checked = settings.autoSlowdown;
    updateDelayPreview();
  };

  const readSettingsFromForm = () => {
    return SettingsManager.sanitize({
      baseDelayMs: operationDelayInput.value,
      autoSlowdown: autoSlowdownInput.checked
    });
  };

  const showSavedState = () => {
    const originalText = saveButton.textContent;
    saveButton.textContent = t("settings.saved");
    setTimeout(() => {
      saveButton.textContent = originalText;
    }, 900);
  };

  function updateDelayPreview() {
    const settings = readSettingsFromForm();

    if (!settings.autoSlowdown) {
      delayPreview.textContent = t("settings.preview.fixed", { ms: settings.baseDelayMs });
      return;
    }

    const secondBatchDelay = Math.max(
      settings.baseDelayMs,
      Math.min(
        DELAY_SETTINGS_CONFIG.maxIntraBatchDelayMs,
        Math.round(settings.baseDelayMs * 1.25)
      )
    );
    const firstCooldown = Math.max(
      settings.baseDelayMs,
      Math.min(DELAY_SETTINGS_CONFIG.maxBatchCooldownMs, settings.baseDelayMs * 3)
    );
    delayPreview.textContent = t("settings.preview.auto", {
      batch: DELAY_SETTINGS_CONFIG.batchSize,
      first: settings.baseDelayMs,
      second: secondBatchDelay,
      cooldown: firstCooldown
    });
  }

  const closeSettings = () => {
    settingsPanel.hidden = true;
    settingsButton.classList.remove("is-active");
  };

  settingsButton.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
    settingsButton.classList.toggle("is-active", !settingsPanel.hidden);
  });

  document.getElementById("settingsClose").addEventListener("click", closeSettings);

  settingsPanel.addEventListener("click", (event) => {
    if (event.target === settingsPanel) closeSettings();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !settingsPanel.hidden) closeSettings();
  });

  operationDelayInput.addEventListener("input", updateDelayPreview);
  autoSlowdownInput.addEventListener("change", updateDelayPreview);

  saveButton.addEventListener("click", async () => {
    const savedSettings = await SettingsManager.saveSettings(readSettingsFromForm());
    applySettingsToForm(savedSettings);
    showSavedState();
  });

  resetButton.addEventListener("click", async () => {
    const savedSettings = await SettingsManager.resetSettings();
    applySettingsToForm(savedSettings);
  });

  applySettingsToForm(await SettingsManager.getSettings());
}

// ---------------------------------------------------------------------------
// Views and account state
// ---------------------------------------------------------------------------

const state = {
  account: null, // GET /me response
  viewStack: [],
  selectedPlan: "yearly",
  lifetimeQuote: null // { amount, credit } in cents
};

function $(id) {
  return document.getElementById(id);
}

function currentView() {
  return document.body.dataset.view;
}

function showView(name, { push = false } = {}) {
  if (push && currentView() !== name) state.viewStack.push(currentView());
  if (!push) state.viewStack = [];
  document.body.dataset.view = name;
  if (name === "pricing") renderPricing();
  if (name === "account") renderAccount();
}

function goBack() {
  document.body.dataset.view = state.viewStack.pop() || "main";
}

function entitlement() {
  return state.account?.entitlement || { plan: "free", isPro: false };
}

function isPro() {
  return Boolean(entitlement().isPro);
}

function isSubscriber() {
  const plan = entitlement().plan;
  return isPro() && (plan === "monthly" || plan === "yearly");
}

// Prices are in US dollars; BDI18n formats them for the UI language.
function formatCents(cents) {
  return BDI18n.formatUsd(cents);
}

function formatShortCents(cents) {
  return BDI18n.formatUsd(cents, { short: true });
}

function formatDate(unixSeconds) {
  return BDI18n.formatDate(unixSeconds);
}

// "in 3 hours"
function formatResetsIn(unixSeconds) {
  const hours = Math.max(1, Math.ceil((unixSeconds * 1000 - Date.now()) / 3600000));
  return BDI18n.formatHoursFromNow(hours);
}

function renderAvatar(element, user) {
  const label = (user?.name || user?.email || "?").trim();
  element.replaceChildren();
  if (user?.avatarUrl) {
    const img = document.createElement("img");
    img.src = user.avatarUrl;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      element.replaceChildren(document.createTextNode(label.charAt(0).toUpperCase()));
    });
    element.appendChild(img);
  } else {
    element.textContent = label.charAt(0).toUpperCase();
  }
}

function createTextSpan(className, textContent) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = textContent;
  return span;
}

function setDefaultButtonContent(button, buttonId) {
  if (buttonId === "bulk-archive") {
    const children = [createTextSpan("button-text", t("main.bulkArchive"))];
    if (!isPro()) children.push(createTextSpan("button-tag", "PRO"));
    button.replaceChildren(...children);
    return;
  }

  const children = [createTextSpan("button-text", t("main.bulkDelete"))];
  if (state.account && !isPro()) {
    const max = state.account.usage?.freeMaxPerRun ?? 10;
    children.push(createTextSpan("button-tag muted-tag", t("main.maxPerRun", { max })));
  }
  button.replaceChildren(...children);
}

function setProgressButtonContent(button, progressText, buttonText) {
  button.replaceChildren(
    createTextSpan("progress-text", progressText),
    createTextSpan("button-text", buttonText)
  );
}

function renderMain() {
  const account = state.account;
  const pro = isPro();
  const usage = account?.usage;

  $("proBadge").hidden = !pro;
  $("freePlanStrip").hidden = !account || pro;
  $("navAdContainer").hidden = !account || pro;
  $("proNote").hidden = !pro;
  document.body.classList.toggle("is-pro", pro);

  if (account) renderAvatar($("avatar"), account.user);

  if (account && !pro && usage) {
    $("freePlanText").textContent =
      usage.deleteRunsLeftToday > 0
        ? t("main.freePlan.runsLeft", { runs: usage.deleteRunsLeftToday, max: usage.freeMaxPerRun })
        : t("main.freePlan.used", { when: formatResetsIn(usage.resetsAt) });
  }

  if (pro) {
    $("proNoteText").textContent =
      entitlement().plan === "lifetime" ? t("main.proNote.lifetime") : t("main.proNote.pro");
  }

  for (const id of ["bulk-delete", "bulk-archive"]) {
    const button = $(id);
    if (!button.classList.contains("progress")) setDefaultButtonContent(button, id);
  }
}

function renderAccount() {
  const account = state.account;
  if (!account) return;
  const ent = entitlement();
  const plan = isPro() ? ent.plan : "free";

  renderAvatar($("accountAvatar"), account.user);
  $("accountName").textContent = account.user.name || account.user.email;
  $("accountEmail").textContent = account.user.email;
  $("accountSignedIn").textContent = t("account.signedInWith", {
    version: `v${chrome.runtime.getManifest().version}`
  });

  const statusText = $("planStatusText");
  $("planStatus").classList.toggle("is-warning", ent.status === "past_due" || ent.cancelAtPeriodEnd);
  $("planStatus").hidden = plan === "free";
  statusText.textContent =
    ent.status === "past_due"
      ? t("account.status.paymentIssue")
      : ent.cancelAtPeriodEnd
        ? t("account.status.canceling")
        : t("account.status.active");

  $("planName").textContent = t(`account.planName.${plan}`);
  $("planPrice").textContent =
    plan === "free" || plan === "lifetime" ? "" : planPriceLabel(plan);

  let detail = "";
  if (plan === "free") {
    detail = t("account.detail.free", {
      runs: account.usage.freeDeleteRunsPerDay,
      max: account.usage.freeMaxPerRun
    });
  } else if (plan === "lifetime") {
    detail = ent.source === "legacy"
      ? t("account.detail.legacy", { price: formatCents(LEGACY_PRICE_CENTS) })
      : t("account.detail.lifetime");
  } else if (ent.currentPeriodEnd) {
    detail = ent.cancelAtPeriodEnd
      ? t("account.detail.ends", { date: formatDate(ent.currentPeriodEnd) })
      : t("account.detail.renews", { date: formatDate(ent.currentPeriodEnd) });
  }
  $("planDetail").textContent = detail;

  const subscriber = isSubscriber();
  $("planActions").hidden = !subscriber;
  $("upgradeFromAccount").hidden = plan !== "free";
  $("upgradeNote").hidden = !subscriber;

  if (subscriber) {
    const credit = PLAN_INFO[plan].cents;
    $("goLifetime").textContent = t("account.goLifetime");
    $("upgradeNote").textContent = t("account.upgradeNote.credit", { price: formatCents(credit) });
    loadLifetimeQuote().then((quote) => {
      if (!quote || currentView() !== "account") return;
      $("goLifetime").textContent = t("account.goLifetimePrice", { price: formatShortCents(quote.amount) });
      if (quote.credit !== credit) {
        $("upgradeNote").textContent = quote.credit > 0
          ? t("account.upgradeNote.credit", { price: formatCents(quote.credit) })
          : t("account.upgradeNote.noCredit");
      }
    });
  }
}

function planPriceLabel(plan) {
  return t(`account.price.${plan}`, { price: formatCents(PLAN_INFO[plan].cents) });
}

async function loadLifetimeQuote() {
  if (!isSubscriber()) return null;
  try {
    const quote = await sendToBackground("lifetimeQuote");
    state.lifetimeQuote = quote;
    return quote;
  } catch (error) {
    console.warn("Unable to load lifetime quote:", error);
    return null;
  }
}

function renderPricing() {
  const subscriber = isSubscriber();
  if (subscriber) state.selectedPlan = "lifetime";

  document.querySelectorAll(".plan").forEach((planButton) => {
    const plan = planButton.dataset.plan;
    const current = subscriber && plan === entitlement().plan;
    planButton.disabled = subscriber && plan !== "lifetime";
    planButton.classList.toggle("is-current", current);
    planButton.setAttribute("aria-checked", String(plan === state.selectedPlan));
  });

  $("checkoutError").hidden = true;
  renderLifetimeOption();
  renderCheckoutButton();

  if (subscriber) {
    loadLifetimeQuote().then(() => {
      if (currentView() !== "pricing") return;
      renderLifetimeOption();
      renderCheckoutButton();
    });
  }
}

function renderLifetimeOption() {
  const quote = isSubscriber() ? state.lifetimeQuote : null;
  if (quote && quote.credit > 0) {
    $("lifetimePrice").textContent = formatShortCents(quote.amount);
    $("lifetimeSub").textContent = t("pricing.lifetime.credit", {
      full: formatShortCents(PLAN_INFO.lifetime.cents),
      credit: formatCents(quote.credit)
    });
  } else {
    $("lifetimePrice").textContent = formatShortCents(PLAN_INFO.lifetime.cents);
    $("lifetimeSub").textContent = t("pricing.lifetime.sub");
  }
}

function renderCheckoutButton() {
  const plan = state.selectedPlan;
  const quote = isSubscriber() ? state.lifetimeQuote : null;
  $("checkoutButton").textContent =
    plan === "lifetime" && quote
      ? t("pricing.checkout.upgrade", { price: formatCents(quote.amount) })
      : t(`pricing.checkout.${plan}`, { price: formatCents(PLAN_INFO[plan].cents) });
  $("checkoutFine").textContent =
    plan === "lifetime"
      ? isSubscriber()
        ? t("pricing.fine.upgrade")
        : t("pricing.fine.oneTime")
      : t("pricing.fine.recurring");
}

function applyAccount(account) {
  state.account = account;
  state.lifetimeQuote = null;
  renderMain();
  if (currentView() === "account") renderAccount();
  if (currentView() === "pricing") renderPricing();
}

function handleAuthLost() {
  state.account = null;
  showView("signin");
}

async function refreshAccount() {
  try {
    const { account } = await sendToBackground("refreshAccount");
    applyAccount(account);
    // A $0.99 purchase was just matched by email: show the welcome screen.
    if (account?.legacyUpgraded && currentView() === "main") showView("legacy");
    return account;
  } catch (error) {
    if (error.status === 401) {
      handleAuthLost();
      return null;
    }
    console.warn("Unable to refresh account:", error);
    if (!state.account) showNotice(t("notice.serverUnreachable"));
    return null;
  }
}

function showNotice(message, { action } = {}) {
  const notice = $("mainNotice");
  notice.replaceChildren(document.createTextNode(message));
  if (action) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link-button";
    link.textContent = action.label;
    link.addEventListener("click", action.onClick);
    notice.append(" ", link);
  }
  notice.hidden = false;
}

function hideNotice() {
  $("mainNotice").hidden = true;
}

function openPricing(plan) {
  if (plan) state.selectedPlan = plan;
  showView("pricing", { push: true });
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

async function handleSignIn() {
  const button = $("googleSignIn");
  const errorText = $("signInError");
  button.disabled = true;
  errorText.hidden = true;

  try {
    await sendToBackground("signIn");
    const cached = await sendToBackground("getCachedAccount");
    applyAccount(cached.account);
    showView(cached.legacyUpgraded ? "legacy" : "main");
  } catch (error) {
    console.warn("Sign-in failed:", error);
    // Matches Chrome's (English-only) messages for a closed/declined window.
    const canceled = /cancel|did not approve|closed/i.test(error.message || "");
    if (!canceled) {
      errorText.textContent = error.detail
        ? t("signin.error.withCode", { code: error.detail })
        : t("signin.error.failed");
      errorText.hidden = false;
    }
  } finally {
    button.disabled = false;
  }
}

async function handleSignOut() {
  await sendToBackground("signOut").catch((error) => console.warn(error));
  state.account = null;
  showView("signin");
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

function resetOperationButton(buttonId) {
  const button = $(buttonId);
  button.disabled = false;
  button.classList.remove("progress");
  button.style.removeProperty("--progress");
  button.removeAttribute("data-progress");
  setDefaultButtonContent(button, buttonId);
}

function updateProgressBar(buttonId, progress) {
  const button = $(buttonId);
  button.classList.add("progress");
  button.style.setProperty("--progress", `${progress - 100}%`);
  button.setAttribute("data-progress", progress);

  const deleting = buttonId === "bulk-delete";
  const percent = new Intl.NumberFormat(BDI18n.locale, { style: "percent" }).format(progress / 100);

  if (progress === 100) {
    button.disabled = true;
    setProgressButtonContent(button, percent, t(deleting ? "progress.deleteDone" : "progress.archiveDone"));
    setTimeout(() => resetOperationButton(buttonId), 500);
  } else {
    button.disabled = true;
    setProgressButtonContent(button, percent, t(deleting ? "progress.deleting" : "progress.archiving"));
  }
}

function showDailyLimit(resetsAt) {
  $("limitText").textContent = resetsAt
    ? t("limit.textWithTime", { when: formatResetsIn(resetsAt) })
    : t("limit.text");
  $("limitSheet").hidden = false;
}

function hideDailyLimit() {
  $("limitSheet").hidden = true;
}

// While a "warn" notice is active (e.g. a ChatGPT change is being fixed),
// make sure users read it before a run that is likely to fail.
function confirmBulkOperation(operation) {
  const skip =
    activeNoticeLevel !== "warn" ||
    $(operation === "delete" ? "bulk-delete" : "bulk-archive").disabled ||
    (operation === "archive" && !isPro()); // goes straight to pricing
  if (skip) {
    runBulkOperation(operation);
    return;
  }
  $("runWarningText").textContent = activeNoticeText;
  $("runWarning").dataset.operation = operation;
  $("runWarning").hidden = false;
}

function freeMaxPerRun() {
  return state.account?.usage?.freeMaxPerRun ?? 10;
}

// Decides the run from the account fetched when the popup opened, so the
// first conversation doesn't wait on the network. Returns null when the
// server has to decide (free user with no runs left, or no account yet).
function startClaimWithoutWaiting(operation) {
  if (!state.account) return null;
  // The server records nothing for Pro, so there is nothing to claim.
  if (isPro()) return { maxPerRun: null };
  if (operation !== "delete" || !(state.account.usage?.deleteRunsLeftToday > 0)) return null;

  // Still counted against today's free run, just not waited for.
  sendToBackground("claimUsage", { operation })
    .catch((error) => console.warn("Background claimUsage failed:", error))
    .finally(() => refreshAccount());
  return { maxPerRun: freeMaxPerRun() };
}

async function runBulkOperation(operation) {
  const buttonId = operation === "delete" ? "bulk-delete" : "bulk-archive";
  const scriptName =
    operation === "delete" ? "bulkDeleteConversations.js" : "bulkArchiveConversations.js";
  const button = $(buttonId);
  if (button.disabled) return;
  hideNotice();

  if (operation === "archive" && !isPro()) {
    openPricing();
    return;
  }

  const tab = await getActiveTab();
  if (!tab) return;

  button.disabled = true;
  try {
    await loadCoreScripts(tab.id);
    const selectedCount = await countSelectedConversations(tab.id);
    if (selectedCount === 0) {
      resetOperationButton(buttonId);
      showNotice(t("notice.selectFirst"));
      return;
    }

    // Start at once whenever the cached account already allows the run; only
    // a free user with no runs left (per the cache) waits for the server.
    let claim = startClaimWithoutWaiting(operation);
    if (!claim) {
      try {
        claim = await sendToBackground("claimUsage", { operation });
      } catch (error) {
        if (error.status === 401) {
          resetOperationButton(buttonId);
          return handleAuthLost();
        }
        if (error.body?.reason === "daily_limit") {
          resetOperationButton(buttonId);
          showDailyLimit(error.body.resetsAt);
          refreshAccount();
          return;
        }
        if (error.body?.reason === "pro_only") {
          resetOperationButton(buttonId);
          refreshAccount();
          openPricing();
          return;
        }
        // Server unreachable: don't hold the user up, run with the free cap.
        console.warn("claimUsage failed; running with the free cap:", error);
        claim = { maxPerRun: freeMaxPerRun() };
      }
    }

    updateProgressBar(buttonId, 0);
    const delaySettings = await SettingsManager.getSettings();
    await setOperationSettings(tab.id, { ...delaySettings, maxPerRun: claim.maxPerRun ?? null });
    await executeScriptFiles(tab.id, [scriptName]);
  } catch (error) {
    console.error(`Failed to run ${operation}:`, error);
    resetOperationButton(buttonId);
    showNotice(t("notice.wrongTab"));
  }
}

function addPageScriptListener(buttonId, scriptName) {
  $(buttonId).addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    hideNotice();
    try {
      await loadCoreScripts(tab.id);
      if (scriptName === "addCheckboxes.js") {
        // Lets the page warn before the run when a free selection is over
        // the per-run cap. null (Pro, or account not known yet) = no warning.
        const freeMaxPerRun = state.account && !isPro()
          ? state.account.usage?.freeMaxPerRun ?? null
          : null;
        await executeScriptFunction(
          tab.id,
          (value) => {
            window.ChatGPTBulkDeleteSelectionInfo = { freeMaxPerRun: value };
            return true;
          },
          [freeMaxPerRun]
        );
      }
      await executeScriptFiles(tab.id, [scriptName]);
    } catch (error) {
      console.error(`Failed to execute ${scriptName}:`, error);
      showNotice(t("notice.wrongTab"));
    }
  });
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "updateProgress") {
    updateProgressBar(request.buttonId, request.progress);
    return;
  }
  if (request.action !== "operationComplete") return;

  const processedCount = Number(request.processedCount || 0);
  const skippedCount = Number(request.skippedCount || 0);
  const limitedFrom = Number(request.limitedFrom || 0);

  if (skippedCount > 0) {
    resetOperationButton(request.buttonId);
    showNotice(t("notice.partialFailure", { processed: processedCount, failed: skippedCount }));
  } else {
    updateProgressBar(request.buttonId, 100);
  }

  // The failure notice takes priority; it already says to reload the page.
  if (request.pageReload && skippedCount === 0) {
    showNotice(t("notice.refreshing"));
  }

  if (limitedFrom > 0) {
    showNotice(
      t("notice.freeLimited", { processed: processedCount, selected: limitedFrom }),
      { action: { label: t("notice.deleteAllPro"), onClick: () => openPricing() } }
    );
  }

  if (!isPro()) refreshAccount();
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

async function handleCheckout(plan = state.selectedPlan, button = $("checkoutButton")) {
  const errorText = $("checkoutError");
  errorText.hidden = true;
  button.disabled = true;
  try {
    await sendToBackground("checkout", { plan });
  } catch (error) {
    if (error.status === 401) return handleAuthLost();
    const code = error.body?.error;
    errorText.textContent =
      code === "already_lifetime"
        ? t("pricing.error.alreadyLifetime")
        : code === "already_subscribed"
          ? t("pricing.error.alreadySubscribed")
          : t("pricing.error.failed");
    errorText.hidden = false;
    if (code) refreshAccount();
  } finally {
    button.disabled = false;
  }
}

async function handleOpenPortal() {
  const button = $("manageBilling");
  button.disabled = true;
  try {
    await sendToBackground("openPortal");
  } catch (error) {
    if (error.status === 401) return handleAuthLost();
    $("upgradeNote").textContent = t("account.billingError");
    $("upgradeNote").hidden = false;
  } finally {
    button.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function initializeButtons() {
  $("googleSignIn").addEventListener("click", handleSignIn);
  $("signOutButton").addEventListener("click", handleSignOut);
  $("accountButton").addEventListener("click", () => showView("account", { push: true }));
  $("freePlanStrip").addEventListener("click", () => openPricing());
  $("closeAdButton").addEventListener("click", () => openPricing());
  document.querySelectorAll("[data-back]").forEach((button) =>
    button.addEventListener("click", goBack)
  );

  addPageScriptListener("add-checkboxes", "addCheckboxes.js");
  addPageScriptListener("toggle-checkboxes", "toggleCheckboxes.js");
  addPageScriptListener("remove-checkboxes", "removeCheckboxes.js");
  $("bulk-delete").addEventListener("click", () => confirmBulkOperation("delete"));
  $("bulk-archive").addEventListener("click", () => confirmBulkOperation("archive"));
  $("runWarningContinue").addEventListener("click", () => {
    $("runWarning").hidden = true;
    runBulkOperation($("runWarning").dataset.operation);
  });
  $("runWarningDismiss").addEventListener("click", () => {
    $("runWarning").hidden = true;
  });
  $("runWarning").addEventListener("click", (event) => {
    if (event.target === $("runWarning")) $("runWarning").hidden = true;
  });

  document.querySelectorAll(".plan").forEach((planButton) => {
    planButton.addEventListener("click", () => {
      state.selectedPlan = planButton.dataset.plan;
      document.querySelectorAll(".plan").forEach((other) =>
        other.setAttribute("aria-checked", String(other === planButton))
      );
      renderCheckoutButton();
    });
  });
  // Warn about ChatGPT UI changes before taking payment.
  $("checkoutButton").addEventListener("click", () => {
    $("checkoutNotice").hidden = false;
  });
  $("checkoutNoticeContinue").addEventListener("click", () => {
    $("checkoutNotice").hidden = true;
    handleCheckout();
  });
  $("checkoutNoticeDismiss").addEventListener("click", () => {
    $("checkoutNotice").hidden = true;
  });
  $("checkoutNotice").addEventListener("click", (event) => {
    if (event.target === $("checkoutNotice")) $("checkoutNotice").hidden = true;
  });
  $("goLifetime").addEventListener("click", () => openPricing("lifetime"));
  $("upgradeFromAccount").addEventListener("click", () => openPricing());
  $("manageBilling").addEventListener("click", handleOpenPortal);

  $("limitUpgrade").addEventListener("click", () => {
    hideDailyLimit();
    openPricing();
  });
  $("limitDismiss").addEventListener("click", hideDailyLimit);
  $("limitSheet").addEventListener("click", (event) => {
    if (event.target === $("limitSheet")) hideDailyLimit();
  });

  // Instructions start open; remember once the user collapses them.
  const howto = $("howto");
  try {
    if (localStorage.getItem("howtoCollapsed") === "1") howto.open = false;
  } catch {}
  howto.addEventListener("toggle", () => {
    try {
      localStorage.setItem("howtoCollapsed", howto.open ? "0" : "1");
    } catch {}
  });

  document.querySelectorAll(".copy-button[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = t("common.copied");
      } catch (error) {
        console.warn("Copy failed:", error);
        button.textContent = t("common.selectAndCopy");
      }
      setTimeout(() => (button.textContent = t("common.copy")), 1500);
    });
  });

  $("legacyContinue").addEventListener("click", async () => {
    await sendToBackground("dismissLegacyUpgrade").catch(() => {});
    showView("main");
  });

  const versionBadge = $("version-badge");
  versionBadge.textContent = `v${chrome.runtime.getManifest().version}`;
  versionBadge.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: STORE_URL });
  });
}

async function initializeAccount() {
  let cached;
  try {
    cached = await sendToBackground("getCachedAccount");
  } catch (error) {
    console.error("Unable to read account state:", error);
    showView("signin");
    return;
  }

  if (!cached.signedIn) {
    showView("signin");
    return;
  }

  if (cached.account) {
    applyAccount(cached.account);
    showView(cached.legacyUpgraded ? "legacy" : "main");
    refreshAccount();
    return;
  }

  // Signed in but nothing cached yet: wait for /me before showing anything.
  const account = await refreshAccount();
  if (account) showView(cached.legacyUpgraded || account.legacyUpgraded ? "legacy" : "main");
  else if (state.account === null && currentView() === "loading") showView("main");
}

// ---------------------------------------------------------------------------
// Service notice (notices table on the worker)
// ---------------------------------------------------------------------------

const DISMISSED_NOTICE_KEY = "BulkDeleteChatGPT_dismissedNotice";
// The current notice text, kept even after the banner is dismissed: a "warn"
// notice is shown again before every bulk run.
let activeNoticeText = null;
let activeNoticeLevel = null;

// Notices are keyed by language: the UI language ("zh-CN", then "zh"),
// then the browser language, then English.
function pickNoticeMessage(message) {
  const candidates = [BDI18n.locale, navigator.language || ""];
  for (const lang of candidates) {
    const text = message[lang] || message[lang.split("-")[0]];
    if (text) return text;
  }
  return message.en;
}

async function initializeSiteNotice() {
  const { notice } = await sendToBackground("getNotice").catch(() => ({ notice: null }));
  if (!notice?.id || !notice.message) return;

  const text = pickNoticeMessage(notice.message);
  if (typeof text !== "string" || !text.trim()) return;
  activeNoticeText = text.trim();
  activeNoticeLevel = notice.level === "info" ? "info" : "warn";

  let dismissedId = null;
  try {
    dismissedId = localStorage.getItem(DISMISSED_NOTICE_KEY);
  } catch (error) {}
  if (dismissedId === String(notice.id)) return;

  $("siteNoticeText").textContent = activeNoticeText;
  $("siteNotice").dataset.level = activeNoticeLevel;
  $("siteNotice").hidden = false;
  document.body.classList.add("has-site-notice");
  // Same reading speed (~50px/s) whatever the message length.
  const span = $("siteNoticeText");
  span.style.animationDuration = `${Math.max(8, span.offsetWidth / 50)}s`;

  $("siteNoticeClose").addEventListener("click", () => {
    $("siteNotice").hidden = true;
    document.body.classList.remove("has-site-notice");
    try {
      localStorage.setItem(DISMISSED_NOTICE_KEY, String(notice.id));
    } catch (error) {}
  });
}

// ---------------------------------------------------------------------------
// One-time "what's new" sheet after an update (flag set in background.js)
// ---------------------------------------------------------------------------

const WHATS_NEW_KEY = "BulkDeleteChatGPT_whatsNew";

async function initializeWhatsNew() {
  let pending = null;
  try {
    pending = (await chrome.storage.local.get(WHATS_NEW_KEY))[WHATS_NEW_KEY];
  } catch (error) {
    return;
  }
  if (pending !== "conversation-preview") return;

  $("whatsNew").hidden = false;
  $("whatsNewClose").addEventListener("click", () => {
    $("whatsNew").hidden = true;
    chrome.storage.local.remove(WHATS_NEW_KEY).catch(() => {});
  });
}

// The page's "Upgrade to delete all" button opens the popup on pricing.
const OPEN_PRICING_KEY = "BulkDeleteChatGPT_openPricing";

async function openPricingIfRequested() {
  let requested = false;
  try {
    requested = Boolean((await chrome.storage.local.get(OPEN_PRICING_KEY))[OPEN_PRICING_KEY]);
    if (requested) await chrome.storage.local.remove(OPEN_PRICING_KEY);
  } catch (error) {
    return;
  }
  if (requested && currentView() === "main") openPricing();
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

// <html lang> of the active tab when it's ChatGPT (activeTab grants access
// while the popup is open). Other tabs fall back to the language the content
// script last saw on ChatGPT.
async function readActiveTabLanguage() {
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url || "")) return null;
    const [result] = await Promise.race([
      executeScriptFunction(tab.id, () => document.documentElement.lang),
      new Promise((resolve) => setTimeout(() => resolve([]), 500))
    ]);
    return result?.result || null;
  } catch (error) {
    return null;
  }
}

function renderStaticPrices() {
  document.querySelectorAll("[data-price-usd]").forEach((element) => {
    element.textContent = formatShortCents(Number(element.dataset.priceUsd));
  });
  const savings = 1 - PLAN_INFO.yearly.cents / (PLAN_INFO.monthly.cents * 12);
  $("yearlySave").textContent = t("pricing.save", {
    percent: new Intl.NumberFormat(BDI18n.locale, { style: "percent" }).format(Math.floor(savings * 100) / 100)
  });
}

// Language menu, opened from the footer chip or the Settings row. A custom
// list (not a native <select>) so it stays inside the popup: about 70 entries
// would otherwise fill the whole screen. Order: "Same as ChatGPT", the user's
// own languages (ChatGPT page, browser) and English, then the rest.
async function initializeLanguageSelect(pageLang) {
  const override = await BDI18n.getOverride();
  const autoLocale = await BDI18n.detectAutoLocale(pageLang);
  const suggested = [];
  for (const tag of [override, autoLocale, chrome.i18n?.getUILanguage?.(), ...(navigator.languages || []), "en"]) {
    const code = BDI18n.resolveLocale(tag);
    if (code && !suggested.includes(code)) suggested.push(code);
  }
  const collator = new Intl.Collator(BDI18n.locale);
  const rest = BDI18n.LOCALES
    .filter((code) => !suggested.includes(code))
    .sort((a, b) => collator.compare(BDI18n.nativeName(a), BDI18n.nativeName(b)));
  const current = override || "auto";

  const menu = $("languageMenu");
  const item = (value, label, lang) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "language-menu-item";
    button.setAttribute("role", "option");
    button.dataset.value = value;
    button.setAttribute("aria-selected", String(value === current));
    if (lang) {
      button.lang = lang;
      button.dir = BDI18n.isRtl(lang) ? "rtl" : "ltr";
    }
    button.textContent = label;
    return button;
  };
  const separator = document.createElement("div");
  separator.className = "language-menu-separator";
  separator.setAttribute("role", "separator");
  menu.replaceChildren(
    item("auto", `${t("settings.languageAuto")} · ${BDI18n.nativeName(autoLocale)}`),
    ...suggested.map((code) => item(code, BDI18n.nativeName(code), code)),
    separator,
    ...rest.map((code) => item(code, BDI18n.nativeName(code), code))
  );

  const items = () => [...menu.querySelectorAll(".language-menu-item")];
  let trigger = null;

  const close = (refocus) => {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    if (refocus) trigger?.focus();
    trigger = null;
  };

  const open = (button) => {
    trigger = button;
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    // Above or below the trigger, whichever has more room; never off-screen.
    const rect = button.getBoundingClientRect();
    const margin = 8;
    const viewport = document.documentElement.clientHeight;
    const above = rect.top - margin;
    const below = viewport - rect.bottom - margin;
    const height = Math.min(320, Math.max(above, below) - 4);
    menu.style.maxHeight = `${height}px`;
    const width = Math.min(240, document.documentElement.clientWidth - 2 * margin);
    menu.style.width = `${width}px`;
    const rtl = document.documentElement.dir === "rtl";
    const anchor = rtl ? rect.right - width : rect.left;
    menu.style.left = `${Math.max(margin, Math.min(anchor, document.documentElement.clientWidth - width - margin))}px`;
    if (above > below) {
      menu.style.top = "";
      menu.style.bottom = `${viewport - rect.top + 4}px`;
    } else {
      menu.style.bottom = "";
      menu.style.top = `${rect.bottom + 4}px`;
    }
    const selected = items().find((el) => el.dataset.value === current) || items()[0];
    selected.scrollIntoView({ block: "center" });
    selected.focus({ preventScroll: true });
  };

  const choose = async (value) => {
    close(false);
    if (value === current) return;
    await BDI18n.setOverride(value === "auto" ? null : value);
    location.reload();
  };

  menu.addEventListener("click", (event) => {
    const target = event.target.closest(".language-menu-item");
    if (target) choose(target.dataset.value);
  });
  menu.addEventListener("keydown", (event) => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    const move = (next) => {
      event.preventDefault();
      list[Math.max(0, Math.min(list.length - 1, next))].focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") close(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !menu.contains(event.target) && !trigger?.contains(event.target)) close(false);
  });
  window.addEventListener("blur", () => close(false));

  for (const button of [$("languageButton"), $("languageSettingButton")]) {
    if (!button) continue;
    button.addEventListener("click", () => (menu.hidden || trigger !== button ? open(button) : close(false)));
  }

  const chipCode = $("langChipCode");
  if (chipCode) chipCode.textContent = BDI18n.locale.split("-")[0].toUpperCase();
  const settingName = $("languageSettingName");
  if (settingName) {
    settingName.textContent = current === "auto" ? t("settings.languageAuto") : BDI18n.nativeName(current);
  }
}

async function initializeLanguage() {
  const pageLang = await readActiveTabLanguage();
  await BDI18n.init({ pageLang });
  BDI18n.apply();
  renderStaticPrices();
  await initializeLanguageSelect(pageLang);
}

document.addEventListener("DOMContentLoaded", async () => {
  // Strings first: the loading view stays up until the UI is translated.
  // A failure here must not leave the popup stuck on the spinner.
  await initializeLanguage().catch((error) => console.warn("Language setup failed:", error));
  initializeWhatsNew();
  initializeSiteNotice();
  initializeButtons();
  initializeSettings();
  initializeAccount().then(openPricingIfRequested);
});
