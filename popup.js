// popup.js
document.getElementById('add_checkboxes').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { message: 'add_checkboxes' });
    });
  });
  
  document.getElementById('delete_selected').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { message: 'delete_selected_conversations' });
    });
  });
  
  