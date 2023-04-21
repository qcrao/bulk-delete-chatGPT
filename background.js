console.log('Sending checkedIndexes from background:', checkedIndexes);
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  chrome.tabs.sendMessage(tabs[0].id, { type: 'checkedIndexes', checkedIndexes: checkedIndexes });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'setCheckedIndexes') {
      chrome.storage.local.set({ checkedIndexes: request.checkedIndexes });
    } else if (request.type === 'getCheckedIndexes') {
      chrome.storage.local.get(['checkedIndexes'], (result) => {
        sendResponse(result.checkedIndexes || []);
      });
      return true;
    }
  });
  