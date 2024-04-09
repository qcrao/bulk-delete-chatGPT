function loadGlobalsThenExecute(tabId, secondaryScript) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['globals.js']
  }, () => {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [secondaryScript]
    });
  });
}

function addButtonListener(buttonId, scriptName) {
  document.getElementById(buttonId).addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) {
        loadGlobalsThenExecute(tab.id, scriptName);
      }
    });
  });
}

function initializeButtons() {
  addButtonListener('add-checkboxes', 'addCheckboxes.js');
  addButtonListener('bulk-delete', 'bulkDeleteConversations.js');
  addButtonListener('toggle-checkboxes', 'toggleCheckboxes.js');
  addButtonListener('remove-checkboxes', 'removeCheckboxes.js');
}

function updateCopyrightYear() {
  const currentYear = new Date().getFullYear();
  document.getElementById('copyright').innerHTML =
    `&copy; ${currentYear} <a href="https://github.com/qcrao/bulk-delete-chatGPT" target="_blank">qcrao@GitHub</a>`;
}

initializeButtons();
updateCopyrightYear();
