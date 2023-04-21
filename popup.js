document.getElementById('add-checkboxes').addEventListener('click', () => {
    chrome.tabs.executeScript({ file: 'addCheckboxes.js' });
  });
  
document.getElementById('bulk-delete').addEventListener('click', () => {
  chrome.tabs.executeScript({ file: 'bulkDeleteConversations.js' });
});

document.getElementById('remove-checkboxes').addEventListener('click', () => {
  chrome.tabs.executeScript({ file: 'removeCheckboxes.js' });
});  