console.log("Background script loaded");

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getUserInfo") {
    // Check if identity API with getProfileUserInfo is available (not supported in Firefox)
    const identityApi = chrome.identity;
    const getProfileFn = identityApi && identityApi["getProfileUserInfo"];

    if (getProfileFn) {
      // Chrome: use identity API
      getProfileFn.call(identityApi, { accountStatus: "ANY" }, (userInfo) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ userInfo: userInfo });
        }
      });
    } else {
      // Firefox fallback: generate a random ID and store it
      const storageKey = "bulk_delete_user_id";
      chrome.storage.local.get([storageKey], (result) => {
        if (result[storageKey]) {
          sendResponse({ userInfo: { id: result[storageKey], email: "" } });
        } else {
          const newId = "firefox_" + Math.random().toString(36).substring(2, 15);
          chrome.storage.local.set({ [storageKey]: newId }, () => {
            sendResponse({ userInfo: { id: newId, email: "" } });
          });
        }
      });
    }
    return true; // Will respond asynchronously
  }
});

console.log("Background script setup complete");
