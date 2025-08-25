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

  const buttonText =
    buttonId === "bulk-delete" ? "Bulk Delete" : "Bulk Archive";
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
      button.innerHTML = `<span class="button-text">${buttonText}</span>`;
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
    updateBulkArchiveButton(localIsPaid);

    try {
      const userInfo = await getUserInfo();
      if (!userInfo) {
        console.error("Unable to get user info");
        return;
      }

      const data = await this.checkRemoteStatus(userInfo);
      this.setLocalStatus(data.isPaid);
      updateBulkArchiveButton(data.isPaid);
    } catch (error) {
      console.error("Error in membership status check:", error);
    }
  }
};

function updateBulkArchiveButton(isPaid) {
  const bulkArchiveButton = document.getElementById("bulk-archive");
  if (isPaid) {
    bulkArchiveButton.querySelector("span").textContent = "";
  } else {
    bulkArchiveButton.querySelector("span").textContent = "🔒";
  }
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
    updateBulkArchiveButton(data.isPaid);

    if (data.isPaid) {
      executeArchiveOperation();
    } else {
      const userConfirmed = await showModal();
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

function showModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById("customModal");
    const okButton = document.getElementById("modalOK");
    const cancelButton = document.getElementById("modalCancel");

    modal.style.display = "block";

    okButton.onclick = () => {
      modal.style.display = "none";
      resolve(true);
    };

    cancelButton.onclick = () => {
      modal.style.display = "none";
      resolve(false);
    };

    window.onclick = (event) => {
      if (event.target == modal) {
        modal.style.display = "none";
        resolve(false);
      }
    };
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
      checkMembershipStatus();
    });
  }
});
