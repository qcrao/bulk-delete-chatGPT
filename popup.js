document.getElementById('add-checkboxes').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['addCheckboxes.js']
    });
  });
});

document.getElementById('bulk-delete').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['bulkDeleteConversations.js']
    });
  });
});

document.getElementById('toggle-checkboxes').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['toggleCheckboxes.js']
    });
  });
});

document.getElementById('remove-checkboxes').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['removeCheckboxes.js']
    });
  });
});


// Update copyright year
const currentYear = new Date().getFullYear();
document.getElementById('copyright').innerHTML =
  '&copy; ' + currentYear + ' <a href="https://github.com/qcrao/bulk-delete-chatGPT" target="_blank">qcrao@GitHub</a>';


