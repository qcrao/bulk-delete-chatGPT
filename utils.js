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
