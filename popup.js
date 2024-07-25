function loadGlobalsThenExecute(tabId, secondaryScript, callback) {
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      files: ["globals.js", "utils.js"],
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

const storageKey = "BulkDeleteChatGPT_isPaid";
async function checkMembershipStatus() {
  const localIsPaid = localStorage.getItem(storageKey) === "true";

  updateBulkArchiveButton(localIsPaid);

  const userInfo = await getUserInfo();
  if (!userInfo) {
    console.error("Unable to get user info");
    return;
  }

  try {
    const response = await fetch(
      `https://bulk-delete-chatgpt-worker.qcrao.com/check-payment-status?user_id=${encodeURIComponent(
        userInfo.id
      )}`
    );
    const data = await response.json();

    // 更新本地存储和按钮状态
    localStorage.setItem(storageKey, data.isPaid);
    updateBulkArchiveButton(data.isPaid);
  } catch (error) {
    console.error("Error checking membership status:", error);
  }
}

function updateBulkArchiveButton(isPaid) {
  const bulkArchiveButton = document.getElementById("bulk-archive");
  if (isPaid) {
    bulkArchiveButton.querySelector("span").textContent = "";
  } else {
    bulkArchiveButton.querySelector("span").textContent = "🔒";
  }
}

async function handleBulkArchive() {
  const localIsPaid = localStorage.getItem(storageKey) === "true";
  if (localIsPaid) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) {
        const bulkArchiveButton = document.getElementById("bulk-archive");
        bulkArchiveButton.disabled = true;
        bulkArchiveButton.classList.add("progress");
        loadGlobalsThenExecute(tab.id, "bulkArchiveConversations.js");
      }
    });
    return;
  }

  const userInfo = await getUserInfo();
  if (!userInfo) {
    console.error("Unable to get user info");
    alert("Unable to verify user. Please try again later.");
    return;
  }

  const response = await fetch(
    `https://bulk-delete-chatgpt-worker.qcrao.com/check-payment-status?user_id=${encodeURIComponent(
      userInfo.id
    )}`
  );
  const data = await response.json();

  if (data.isPaid) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) {
        const bulkArchiveButton = document.getElementById("bulk-archive");
        bulkArchiveButton.disabled = true;
        bulkArchiveButton.classList.add("progress");

        loadGlobalsThenExecute(tab.id, "bulkArchiveConversations.js");
      }
    });
  } else {
    showModal().then(async (result) => {
      if (result) {
        const payResponse = await fetch(
          `https://bulk-delete-chatgpt-worker.qcrao.com/pay-bulk-archive?user_id=${encodeURIComponent(
            userInfo.id
          )}`,
          { method: "POST" }
        );
        const payData = await payResponse.json();
        console.log("payData", payData);
        if (payData.paymentUrl) {
          window.open(payData.paymentUrl, "_blank");
        } else {
          alert("Failed to get payment link. Please try again later.");
        }
      }
    });
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

function updateCopyrightYear() {
  const currentYear = new Date().getFullYear();
  document.getElementById(
    "copyright"
  ).innerHTML = `&copy; ${currentYear} <a href="https://github.com/qcrao/bulk-delete-chatGPT" target="_blank">qcrao@GitHub</a>`;
}

document.addEventListener("DOMContentLoaded", function () {
  initializeButtons();
  updateCopyrightYear();
  checkMembershipStatus();
});

// 每次打开popup时检查会员状态
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name === "popup") {
    port.onDisconnect.addListener(function () {
      checkMembershipStatus();
    });
  }
});
