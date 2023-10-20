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
  const conversationElement = await checkbox.closest('.flex.p-3.items-center.gap-3.relative.rounded-md');

  console.log("1. Clicking conversation", conversationElement);
  conversationElement.click();
  await delay(300);

  const deleteButton = await waitForElement(Selectors.deleteButton);

  if (deleteButton) {
    console.log("2. Clicking delete button", deleteButton);

    deleteButton.click();
    const confirmButton = await waitForElement(Selectors.confirmDeleteButton);

    if (confirmButton) {
      console.log("3. Clicking confirm button");
      confirmButton.click();

      await waitForElementToDisappear(Selectors.confirmDeleteButton);
    }
  }

  console.log("4. Deletion completed");
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

bulkDeleteConversations();
