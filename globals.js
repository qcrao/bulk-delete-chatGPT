if (typeof window.globalsLoaded === "undefined") {
  console.log("globals.js loaded");

  window.globalsLoaded = true;

  const lastChecked = null;

  const Selectors = {
    conversationsCheckbox: ".conversation-checkbox:checked",
    confirmDeleteButton: "button.btn.btn-danger",
    threeDotButton: '[id^="radix-"]',
    CONVERSATION_SELECTOR:
      "div > div > div > div > div > div > nav > div > div > div > div > ol > li > div > a",
    TITLE_SELECTOR: ".relative.grow.overflow-hidden.whitespace-nowrap",
  };

  const CHECKBOX_CLASS = "conversation-checkbox";

  // Define getUserInfo function
  function getUserInfo() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "getUserInfo" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.userInfo);
        }
      });
    });
  }

  // Expose variables to the global scope
  window.lastChecked = lastChecked;
  window.Selectors = Selectors;
  window.CHECKBOX_CLASS = CHECKBOX_CLASS;
} else {
  console.log("globals.js already loaded, skipping re-initialization");
}
