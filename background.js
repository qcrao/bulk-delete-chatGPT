console.log("Background script loaded");

const FALLBACK_USER_INFO_KEY = "BulkDeleteChatGPT_fallbackUserInfo";
let memoryFallbackUserInfo = null;

function getStoredFallbackUserInfo() {
  return new Promise((resolve, reject) => {
    if (!chrome.storage?.local) {
      resolve(memoryFallbackUserInfo);
      return;
    }

    chrome.storage.local.get([FALLBACK_USER_INFO_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(result[FALLBACK_USER_INFO_KEY] || null);
    });
  });
}

function setStoredFallbackUserInfo(userInfo) {
  return new Promise((resolve, reject) => {
    if (!chrome.storage?.local) {
      memoryFallbackUserInfo = userInfo;
      resolve(userInfo);
      return;
    }

    chrome.storage.local.set({ [FALLBACK_USER_INFO_KEY]: userInfo }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(userInfo);
    });
  });
}

async function getFallbackUserInfo() {
  const existingUserInfo = await getStoredFallbackUserInfo();
  if (existingUserInfo?.id) {
    return existingUserInfo;
  }

  const randomId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return setStoredFallbackUserInfo({
    id: `anonymous-${randomId}`,
    email: ""
  });
}

function getChromeProfileUserInfo() {
  return new Promise((resolve) => {
    const identityApi = chrome.identity;
    const getProfileUserInfo = identityApi?.["getProfileUserInfo"];

    if (!getProfileUserInfo) {
      resolve(null);
      return;
    }

    getProfileUserInfo.call(
      identityApi,
      { accountStatus: "ANY" },
      (userInfo) => {
        if (chrome.runtime.lastError) {
          console.warn(chrome.runtime.lastError);
          resolve(null);
          return;
        }

        resolve(userInfo?.id ? userInfo : null);
      }
    );
  });
}

async function getUserInfo() {
  return (await getChromeProfileUserInfo()) || getFallbackUserInfo();
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getUserInfo") {
    getUserInfo()
      .then((userInfo) => sendResponse({ userInfo }))
      .catch((error) => {
        console.error(error);
        sendResponse({ error: error.message });
      });
    return true; // Will respond asynchronously
  }
});

console.log("Background script setup complete");
