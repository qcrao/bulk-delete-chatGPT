const CORE_SCRIPT_FILES = [
  "extensionCore.js",
  "config.js",
  "globals.js",
  "utils.js",
  "domHandler.js",
  "conversationHandler.js",
  "checkboxManager.js"
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
  monthly: { name: "Pro Monthly", price: "$4.90 / month", cents: 490, cta: "Continue · $4.90 / month" },
  yearly: { name: "Pro Yearly", price: "$19.90 / year", cents: 1990, cta: "Continue · $19.90 / year" },
  lifetime: { name: "Lifetime", price: "$39.90 once", cents: 3990, cta: "Continue · $39.90 once" }
};

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
    saveButton.textContent = "Saved";
    setTimeout(() => {
      saveButton.textContent = originalText;
    }, 900);
  };

  function updateDelayPreview() {
    const settings = readSettingsFromForm();

    if (!settings.autoSlowdown) {
      delayPreview.textContent =
        `Fixed ${settings.baseDelayMs} ms between conversations.`;
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
    delayPreview.textContent =
      `First 10: ${settings.baseDelayMs} ms each. Next batch: ${secondBatchDelay} ms each, with ${firstCooldown} ms cooldown between batches.`;
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

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatShortCents(cents) {
  return cents % 100 === 0 ? `$${cents / 100}` : formatCents(cents);
}

function formatDate(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatResetsIn(unixSeconds) {
  const hours = Math.max(1, Math.ceil((unixSeconds * 1000 - Date.now()) / 3600000));
  return hours === 1 ? "in 1 hour" : `in ${hours} hours`;
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
    const children = [createTextSpan("button-text", "Bulk Archive")];
    if (!isPro()) children.push(createTextSpan("button-tag", "PRO"));
    button.replaceChildren(...children);
    return;
  }

  const children = [createTextSpan("button-text", "Bulk Delete")];
  if (state.account && !isPro()) {
    children.push(createTextSpan("button-tag muted-tag", "max 10"));
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
        ? `${usage.deleteRunsLeftToday} free run today · up to ${usage.freeMaxPerRun} chats`
        : `Free run used · resets ${formatResetsIn(usage.resetsAt)}`;
  }

  if (pro) {
    $("proNoteText").textContent =
      entitlement().plan === "lifetime"
        ? "Lifetime · unlimited conversations · no ads"
        : "Pro · unlimited conversations · no ads";
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
  $("accountVersion").textContent = `v${chrome.runtime.getManifest().version}`;

  const statusText = $("planStatusText");
  $("planStatus").classList.toggle("is-warning", ent.status === "past_due" || ent.cancelAtPeriodEnd);
  $("planStatus").hidden = plan === "free";
  statusText.textContent =
    ent.status === "past_due" ? "Payment issue" : ent.cancelAtPeriodEnd ? "Canceling" : "Active";

  $("planName").textContent = plan === "free" ? "Free" : PLAN_INFO[plan].name;
  $("planPrice").textContent = plan === "free" || plan === "lifetime" ? "" : PLAN_INFO[plan].price;

  let detail = "";
  if (plan === "free") {
    detail = `${account.usage.freeDeleteRunsPerDay} bulk delete a day · up to ${account.usage.freeMaxPerRun} chats per run`;
  } else if (plan === "lifetime") {
    detail = ent.source === "legacy"
      ? "Upgraded from your earlier $0.99 purchase. Thank you!"
      : "Paid once. Yours forever.";
  } else if (ent.currentPeriodEnd) {
    detail = ent.cancelAtPeriodEnd
      ? `Ends on ${formatDate(ent.currentPeriodEnd)}`
      : `Renews on ${formatDate(ent.currentPeriodEnd)}`;
  }
  $("planDetail").textContent = detail;

  const subscriber = isSubscriber();
  $("planActions").hidden = !subscriber;
  $("upgradeFromAccount").hidden = plan !== "free";
  $("upgradeNote").hidden = !subscriber;

  if (subscriber) {
    const credit = PLAN_INFO[plan].cents;
    $("goLifetime").textContent = "Go Lifetime";
    $("upgradeNote").textContent =
      `Your current ${PLAN_INFO[plan].price.split(" / ")[0]} payment counts toward Lifetime. ` +
      "Your subscription ends right away, with no further charges.";
    loadLifetimeQuote().then((quote) => {
      if (!quote || currentView() !== "account") return;
      $("goLifetime").textContent = `Go Lifetime · ${formatShortCents(quote.amount)}`;
      if (quote.credit !== credit) {
        $("upgradeNote").textContent = quote.credit > 0
          ? `Your current ${formatCents(quote.credit)} payment counts toward Lifetime. Your subscription ends right away, with no further charges.`
          : "Your subscription ends right away, with no further charges.";
      }
    });
  }
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
    $("lifetimeSub").textContent = `$39.9 minus your ${formatCents(quote.credit)} payment`;
  } else {
    $("lifetimePrice").textContent = "$39.9";
    $("lifetimeSub").textContent = "Pay once, yours forever";
  }
}

function renderCheckoutButton() {
  const plan = state.selectedPlan;
  const quote = isSubscriber() ? state.lifetimeQuote : null;
  $("checkoutButton").textContent =
    plan === "lifetime" && quote
      ? `Upgrade · ${formatCents(quote.amount)} once`
      : PLAN_INFO[plan].cta;
  $("checkoutFine").textContent =
    plan === "lifetime"
      ? isSubscriber()
        ? "One-time payment · Your subscription stops right away · Secure checkout by Stripe"
        : "One-time payment · No renewals · Secure checkout by Stripe"
      : "Renews automatically · Cancel anytime · Secure checkout by Stripe";
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
    if (!state.account) showNotice("Can't reach the server. Check your connection and reopen the extension.");
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
    if (!/cancel|did not approve|closed/i.test(error.message)) {
      errorText.textContent = error.message || "Sign-in failed. Please try again.";
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

  const actionText = buttonId === "bulk-delete" ? "Deleting" : "Archiving";

  if (progress === 100) {
    button.disabled = true;
    setProgressButtonContent(button, "100%", `${actionText} Complete`);
    setTimeout(() => resetOperationButton(buttonId), 500);
  } else {
    button.disabled = true;
    setProgressButtonContent(button, `${progress}%`, `${actionText}...`);
  }
}

function showDailyLimit(resetsAt) {
  $("limitText").textContent = resetsAt
    ? `Your next free run unlocks ${formatResetsIn(resetsAt)}. Go Pro to delete and archive as much as you like, right now.`
    : "Go Pro to delete and archive as much as you like, right now.";
  $("limitSheet").hidden = false;
}

function hideDailyLimit() {
  $("limitSheet").hidden = true;
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
      showNotice("Select conversations first: click Add, then tick the ones you want.");
      return;
    }

    let claim;
    try {
      claim = await sendToBackground("claimUsage", { operation });
    } catch (error) {
      resetOperationButton(buttonId);
      if (error.status === 401) return handleAuthLost();
      if (error.body?.reason === "daily_limit") {
        showDailyLimit(error.body.resetsAt);
        refreshAccount();
        return;
      }
      if (error.body?.reason === "pro_only") {
        refreshAccount();
        openPricing();
        return;
      }
      showNotice("Can't reach the server right now. Please try again.");
      return;
    }

    updateProgressBar(buttonId, 0);
    const delaySettings = await SettingsManager.getSettings();
    await setOperationSettings(tab.id, { ...delaySettings, maxPerRun: claim.maxPerRun ?? null });
    await executeScriptFiles(tab.id, [scriptName]);
  } catch (error) {
    console.error(`Failed to run ${operation}:`, error);
    resetOperationButton(buttonId);
    showNotice("Unable to run this on the current tab. Open chatgpt.com and try again.");
  }
}

function addPageScriptListener(buttonId, scriptName) {
  $(buttonId).addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    hideNotice();
    try {
      await loadCoreScripts(tab.id);
      await executeScriptFiles(tab.id, [scriptName]);
    } catch (error) {
      console.error(`Failed to execute ${scriptName}:`, error);
      showNotice("Unable to run this on the current tab. Open chatgpt.com and try again.");
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
    showNotice(
      `${processedCount} conversation(s) processed, ${skippedCount} failed. ` +
      "Reload the ChatGPT page and check the console for details."
    );
  } else {
    updateProgressBar(request.buttonId, 100);
  }

  if (limitedFrom > 0) {
    showNotice(
      `Free plan: deleted the first ${processedCount} of ${limitedFrom} selected.`,
      { action: { label: "Delete all with Pro", onClick: () => openPricing() } }
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
        ? "You already have Lifetime."
        : code === "already_subscribed"
          ? "You're already subscribed. Use Manage billing to switch plans."
          : "Couldn't start checkout. Please try again.";
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
    $("upgradeNote").textContent = "Couldn't open billing. Please try again.";
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
  $("bulk-delete").addEventListener("click", () => runBulkOperation("delete"));
  $("bulk-archive").addEventListener("click", () => runBulkOperation("archive"));

  document.querySelectorAll(".plan").forEach((planButton) => {
    planButton.addEventListener("click", () => {
      state.selectedPlan = planButton.dataset.plan;
      document.querySelectorAll(".plan").forEach((other) =>
        other.setAttribute("aria-checked", String(other === planButton))
      );
      renderCheckoutButton();
    });
  });
  $("checkoutButton").addEventListener("click", () => handleCheckout());
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
        button.textContent = "Copied";
      } catch (error) {
        console.warn("Copy failed:", error);
        button.textContent = "Select & copy";
      }
      setTimeout(() => (button.textContent = "Copy"), 1500);
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

document.addEventListener("DOMContentLoaded", () => {
  initializeButtons();
  initializeSettings();
  initializeAccount();
});
