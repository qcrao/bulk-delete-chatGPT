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
  maxBaseDelayMs: 10000,
  batchSize: 10
};

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

function loadGlobalsThenExecute(tabId, secondaryScript, callback) {
  (async () => {
    await loadCoreScripts(tabId);
    await executeScriptFiles(tabId, [secondaryScript]);
    if (callback) callback();
  })().catch((error) => {
    console.error(`Failed to execute ${secondaryScript}:`, error);
    alert("Unable to run this operation on the current tab.");
  });
}

async function setOperationDelaySettings(tabId, delaySettings) {
  await executeScriptFunction(
    tabId,
    (settings) => {
      window.ChatGPTBulkDeleteOperationSettings = settings;
      return true;
    },
    [delaySettings]
  );
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      resolve(tab);
    });
  });
}

function resetOperationButton(buttonId) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.disabled = false;
  button.classList.remove("progress");
  button.style.removeProperty("--progress");
  button.innerHTML = getDefaultButtonContent(buttonId);
}

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

async function executeBulkOperation(tabId, scriptName, buttonId) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.disabled = true;
    button.classList.add("progress");
  }

  try {
    await loadCoreScripts(tabId);
    const delaySettings = await SettingsManager.getSettings();
    await setOperationDelaySettings(tabId, delaySettings);
    await executeScriptFiles(tabId, [scriptName]);
  } catch (error) {
    console.error(`Failed to execute ${buttonId}:`, error);
    resetOperationButton(buttonId);
    alert("Unable to run this operation on the current tab.");
  }
}

function addButtonListener(buttonId, scriptName) {
  document.getElementById(buttonId).addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (!tab) return;

    if (buttonId === "bulk-delete") {
      await executeBulkOperation(tab.id, scriptName, buttonId);
    } else {
      loadGlobalsThenExecute(tab.id, scriptName);
    }
  });
}

function updateProgressBar(buttonId, progress) {
  console.log(`Updating progress bar for ${buttonId}:`, progress);
  const button = document.getElementById(buttonId);
  button.classList.add("progress");
  button.style.setProperty("--progress", `${progress}%`);
  button.setAttribute("data-progress", progress);

  const actionText = buttonId === "bulk-delete" ? "Deleting" : "Archiving";

  if (progress === 100) {
    button.disabled = true;
    button.innerHTML = `
      <span class="progress-text">100%</span>
      <span class="button-text">${actionText} Complete</span>
    `;

    // 显示 100% 一段时间后恢复原始状态
    setTimeout(() => {
      button.disabled = false;
      button.classList.remove("progress");
      button.innerHTML = getDefaultButtonContent(buttonId);
    }, 500); // 1000 毫秒 = 1 秒，您可以根据需要调整这个时间
  } else {
    button.disabled = true;
    button.innerHTML = `
      <span class="progress-text">${progress}%</span>
      <span class="button-text">${actionText}...</span>
    `;
  }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("Received message:", request);
  if (request.action === "updateProgress") {
    updateProgressBar(request.buttonId, request.progress);
  } else if (request.action === "operationComplete") {
    const button = document.getElementById(request.buttonId);
    button.disabled = false;
    button.classList.remove("progress");
    updateProgressBar(request.buttonId, 100);
  }
});

function initializeButtons() {
  addButtonListener("add-checkboxes", "addCheckboxes.js");
  addButtonListener("bulk-delete", "bulkDeleteConversations.js");
  addButtonListener("toggle-checkboxes", "toggleCheckboxes.js");
  addButtonListener("remove-checkboxes", "removeCheckboxes.js");

  const bulkArchiveButton = document.getElementById("bulk-archive");
  bulkArchiveButton.addEventListener("click", handleBulkArchive);

  const closeAdButton = document.getElementById("closeAdButton");
  if (closeAdButton) {
    closeAdButton.addEventListener("click", handleCloseAd);
  }
}

async function initializeSettings() {
  const settingsButton = document.getElementById("settings-button");
  const settingsPanel = document.getElementById("settingsPanel");
  const operationDelayInput = document.getElementById("operationDelayInput");
  const autoSlowdownInput = document.getElementById("autoSlowdownInput");
  const delayPreview = document.getElementById("delayPreview");
  const saveButton = document.getElementById("saveDelaySettings");
  const resetButton = document.getElementById("resetDelaySettings");

  if (
    !settingsButton ||
    !settingsPanel ||
    !operationDelayInput ||
    !autoSlowdownInput ||
    !delayPreview ||
    !saveButton ||
    !resetButton
  ) {
    return;
  }

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

    const secondBatchDelay = Math.round(settings.baseDelayMs * 1.25);
    const firstCooldown = settings.baseDelayMs * 3;
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

  const settingsClose = document.getElementById("settingsClose");
  if (settingsClose) {
    settingsClose.addEventListener("click", closeSettings);
  }

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

const MembershipManager = {
  storageKey: "BulkDeleteChatGPT_isPaid",
  
  getLocalStatus() {
    return localStorage.getItem(this.storageKey) === "true";
  },
  
  setLocalStatus(isPaid) {
    localStorage.setItem(this.storageKey, isPaid.toString());
  },
  
  async checkRemoteStatus(userInfo) {
    try {
      const response = await fetch(
        `https://bulk-delete-chatgpt-worker.qcrao.com/check-payment-status?user_id=${encodeURIComponent(userInfo.id)}`
      );
      return await response.json();
    } catch (error) {
      console.error("Error checking remote membership status:", error);
      throw error;
    }
  },
  
  async checkMembershipStatus() {
    const localIsPaid = this.getLocalStatus();
    updatePaidFeatures(localIsPaid);

    try {
      const userInfo = await getUserInfo();
      if (!userInfo) {
        console.error("Unable to get user info");
        return;
      }

      const data = await this.checkRemoteStatus(userInfo);
      this.setLocalStatus(data.isPaid);
      updatePaidFeatures(data.isPaid);
    } catch (error) {
      console.error("Error in membership status check:", error);
    }
  }
};

function updatePaidFeatures(isPaid) {
  updateBulkArchiveButton(isPaid);
  updateAdVisibility(isPaid);
}

function updateBulkArchiveButton(isPaid) {
  const bulkArchiveButton = document.getElementById("bulk-archive");
  if (bulkArchiveButton && !bulkArchiveButton.classList.contains("progress")) {
    bulkArchiveButton.innerHTML = getBulkArchiveButtonContent(isPaid);
  }
}

function getDefaultButtonContent(buttonId) {
  if (buttonId === "bulk-archive") {
    return getBulkArchiveButtonContent(MembershipManager.getLocalStatus());
  }

  return `<span class="button-text">Bulk Delete</span>`;
}

function getBulkArchiveButtonContent(isPaid) {
  const lockIcon = isPaid ? "" : "🔒";
  return `
    <span id="locked" aria-hidden="true">${lockIcon}</span>
    <span class="button-text">Bulk Archive</span>
  `;
}

function updateAdVisibility(isPaid) {
  const navAdContainer = document.getElementById("navAdContainer");

  document.body.classList.toggle("paid-layout", isPaid);

  if (navAdContainer) {
    navAdContainer.hidden = isPaid;
  }
}

function hideNavigationAd() {
  updateAdVisibility(true);
}

async function handleBulkArchive() {
  try {
    const localIsPaid = MembershipManager.getLocalStatus();
    
    if (localIsPaid) {
      executeArchiveOperation();
      return;
    }

    const userInfo = await getUserInfo();
    if (!userInfo) {
      console.error("Unable to get user info");
      alert("Unable to verify user. Please try again later.");
      return;
    }

    const data = await MembershipManager.checkRemoteStatus(userInfo);
    MembershipManager.setLocalStatus(data.isPaid);
    updatePaidFeatures(data.isPaid);

    if (data.isPaid) {
      executeArchiveOperation();
    } else {
      const userConfirmed = await showModal({
        title: "Remove Ads + Bulk Archive",
        description:
          "One-time payment of $0.99 USD unlocks Bulk Archive and removes ads.",
      });
      if (userConfirmed) {
        await handlePayment(userInfo);
      }
    }
  } catch (error) {
    console.error("Error in bulk archive handler:", error);
    alert("An error occurred. Please try again later.");
  }
}

function executeArchiveOperation() {
  getActiveTab().then((tab) => {
    if (tab) {
      executeBulkOperation(
        tab.id,
        "bulkArchiveConversations.js",
        "bulk-archive"
      );
    }
  });
}

async function handleCloseAd(event) {
  event.preventDefault();
  event.stopPropagation();

  const closeAdButton = document.getElementById("closeAdButton");

  try {
    if (MembershipManager.getLocalStatus()) {
      hideNavigationAd();
      return;
    }

    if (closeAdButton) {
      closeAdButton.disabled = true;
    }

    const userInfo = await getUserInfo();
    if (!userInfo) {
      console.error("Unable to get user info");
      alert("Unable to verify user. Please try again later.");
      return;
    }

    const data = await MembershipManager.checkRemoteStatus(userInfo);
    MembershipManager.setLocalStatus(data.isPaid);
    updatePaidFeatures(data.isPaid);

    if (data.isPaid) {
      hideNavigationAd();
      return;
    }

    const userConfirmed = await showModal({
      title: "Remove Ads + Bulk Archive",
      description:
        "One-time payment of $0.99 USD removes ads and automatically unlocks Bulk Archive.",
    });

    if (userConfirmed) {
      await handlePayment(userInfo);
    }
  } catch (error) {
    console.error("Error in close ad handler:", error);
    alert("An error occurred. Please try again later.");
  } finally {
    if (closeAdButton) {
      closeAdButton.disabled = false;
    }
  }
}

async function handlePayment(userInfo) {
  try {
    const payResponse = await fetch(
      `https://bulk-delete-chatgpt-worker.qcrao.com/pay-bulk-archive?user_id=${encodeURIComponent(userInfo.id)}`,
      { method: "POST" }
    );
    const payData = await payResponse.json();
    
    if (payData.paymentUrl) {
      window.open(payData.paymentUrl, "_blank");
    } else {
      alert("Failed to get payment link. Please try again later.");
    }
  } catch (error) {
    console.error("Error handling payment:", error);
    alert("Payment processing failed. Please try again later.");
  }
}

function showModal(options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("customModal");
    const title = document.getElementById("modalTitle");
    const description = document.getElementById("modalDescription");
    const question = document.getElementById("modalQuestion");
    const okButton = document.getElementById("modalOK");
    const cancelButton = document.getElementById("modalCancel");

    title.textContent = options.title || "Remove Ads + Bulk Archive";
    description.textContent =
      options.description ||
      "One-time payment of $0.99 USD removes ads and unlocks Bulk Archive.";
    question.textContent = options.question || "Do you want to continue?";
    modal.style.display = "block";

    const cleanup = () => {
      okButton.removeEventListener("click", handleOK);
      cancelButton.removeEventListener("click", handleCancel);
      window.removeEventListener("click", handleOutsideClick);
    };

    const finish = (confirmed) => {
      modal.style.display = "none";
      cleanup();
      resolve(confirmed);
    };

    const handleOK = () => finish(true);
    const handleCancel = () => finish(false);
    const handleOutsideClick = (event) => {
      if (event.target == modal) finish(false);
    };

    okButton.addEventListener("click", handleOK);
    cancelButton.addEventListener("click", handleCancel);
    window.addEventListener("click", handleOutsideClick);
  });
}

async function loadVersion() {
  try {
    const manifestData = chrome.runtime.getManifest();
    const versionBadge = document.getElementById('version-badge');
    if (versionBadge && manifestData.version) {
      versionBadge.textContent = `v${manifestData.version}`;
      
      // Add click handler to open Chrome Web Store page
      versionBadge.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({
          url: 'https://chromewebstore.google.com/detail/chatgpt-bulk-delete/effkgioceefcfaegehhfafjneeiabdjg?hl=en'
        });
      });
    }
  } catch (error) {
    console.error('Error loading version:', error);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  initializeButtons();
  initializeSettings();
  MembershipManager.checkMembershipStatus();
  loadVersion();
});

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name === "popup") {
    port.onDisconnect.addListener(function () {
      MembershipManager.checkMembershipStatus();
    });
  }
});
