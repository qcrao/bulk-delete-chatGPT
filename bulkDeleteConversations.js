async function bulkDeleteConversations() {
  const selectedConversations = getSelectedConversations();

  if (selectedConversations.length === 0) {
    console.log("No conversations to delete.");
    removeAllCheckboxes();
    return;
  }

  console.log("Selected Conversations:", selectedConversations);

  for (const element of selectedConversations) {
    await deleteConversation(element);
  }
}

function getSelectedConversations() {
  return [...document.querySelectorAll(Selectors.conversationsCheckbox)];
}

function removeAllCheckboxes() {
  const allCheckboxes = document.querySelectorAll(Selectors.conversationsCheckbox);
  allCheckboxes.forEach(checkbox => checkbox.remove());
}

async function deleteConversation(checkbox) {

  const conversationBoxElement = checkbox.parentElement;
  console.log("1. Clicking conversation", conversationBoxElement);
  conversationBoxElement.click();

  await delay(300);
  console.log("2. open delete dialog");
  openDeleteDialog();

  await delay(300);
  const deleteButton = await waitForElement(Selectors.deleteButton);
  deleteButton.click();
  console.log("3. Clicking delete button", deleteButton);
}

async function waitForElement(selector, timeout = 2000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
    const element = document.querySelector(selector);
    if (element) return element;
    await delay(100);
  }
  console.log(`Element ${selector} not found within ${timeout}ms`);
  throw new Error(`Element ${selector} not found within ${timeout}ms`);
}

async function waitForElementToDisappear(selector, timeout = 2000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
    const element = document.querySelector(selector);
    if (!element) return;
    await delay(100);
  }
  throw new Error(`Element ${selector} did not disappear within ${timeout}ms`);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function openDeleteDialog() {
  var event = new KeyboardEvent('keydown', {
    key: 'Delete',
    keyCode: 46, // keyCode for Delete
    ctrlKey: true,
    shiftKey: true
  });
  document.dispatchEvent(event);
}
bulkDeleteConversations();
