function getUserInfo() {
  return new Promise((resolve) => {
    chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, (userInfo) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        resolve(null);
      } else {
        resolve(userInfo);
      }
    });
  });
}

window.getUserInfo = getUserInfo;
