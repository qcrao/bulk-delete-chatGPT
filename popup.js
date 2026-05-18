// Updated script loading with new architecture
function loadGlobalsThenExecute(tabId, secondaryScript, callback) {
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      files: ["extensionCore.js", "config.js", "globals.js", "utils.js", "domHandler.js", "conversationHandler.js", "checkboxManager.js"],
    },
    () => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          files: [secondaryScript],
        },
        callback
      );
    }
  );
}

function addButtonListener(buttonId, scriptName) {
  document.getElementById(buttonId).addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) {
        if (buttonId === "bulk-delete") {
          const bulkDeleteButton = document.getElementById(buttonId);
          bulkDeleteButton.disabled = true;
          bulkDeleteButton.classList.add("progress");

          loadGlobalsThenExecute(tab.id, scriptName);
        } else {
          loadGlobalsThenExecute(tab.id, scriptName);
        }
      }
    });
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

// 在消息监听器中也添加文本重置
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

// Membership management
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
  const footer = document.querySelector(".footer");
  const sponsorLink = document.getElementById("sponsorLink");
  const navAdContainer = document.getElementById("navAdContainer");
  const footerSeparator = document.querySelector(".footer-separator");

  document.body.classList.toggle("paid-layout", isPaid);

  if (footer) {
    footer.hidden = isPaid;
  }

  if (sponsorLink) {
    sponsorLink.hidden = isPaid;
  }

  if (navAdContainer) {
    navAdContainer.hidden = isPaid;
  }

  if (footerSeparator) {
    footerSeparator.hidden = isPaid;
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
        title: "Unlock Bulk Archive",
        description:
          "One-time payment of $0.99 USD unlocks Bulk Archive and removes the popup ad.",
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
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) {
      const bulkArchiveButton = document.getElementById("bulk-archive");
      bulkArchiveButton.disabled = true;
      bulkArchiveButton.classList.add("progress");
      loadGlobalsThenExecute(tab.id, "bulkArchiveConversations.js");
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
      title: "Remove Ads",
      description:
        "One-time payment of $0.99 USD removes the popup ad and automatically unlocks Bulk Archive.",
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

    title.textContent = options.title || "Unlock Premium";
    description.textContent =
      options.description ||
      "One-time payment of $0.99 USD unlocks Bulk Archive and removes the popup ad.";
    question.textContent = options.question || "Do you want to continue?";
    modal.style.display = "block";

    const cleanup = () => {
      okButton.removeEventListener("click", handleOK);
      cancelButton.removeEventListener("click", handleCancel);
      window.removeEventListener("click", handleOutsideClick);
    };

    const handleOK = () => {
      modal.style.display = "none";
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      modal.style.display = "none";
      cleanup();
      resolve(false);
    };

    const handleOutsideClick = (event) => {
      if (event.target == modal) {
        modal.style.display = "none";
        cleanup();
        resolve(false);
      }
    };

    okButton.addEventListener("click", handleOK);
    cancelButton.addEventListener("click", handleCancel);
    window.addEventListener("click", handleOutsideClick);
  });
}

// function updateCopyrightYear() {
//   const currentYear = new Date().getFullYear();
//   document.getElementById(
//     "copyright"
//   ).innerHTML = `&copy; ${currentYear} <a href="https://github.com/qcrao/bulk-delete-chatGPT" target="_blank">qcrao@GitHub</a>`;
// }

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
  MembershipManager.checkMembershipStatus();
  loadVersion();
});

// 每次打开popup时检查会员状态
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name === "popup") {
    port.onDisconnect.addListener(function () {
      MembershipManager.checkMembershipStatus();
    });
  }
});
