console.log('bulkDeleteConversations.js loaded');

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
  return [...document.querySelectorAll(window.getSelectors().conversationsCheckbox)];
}

function removeAllCheckboxes() {
  const allCheckboxes = document.querySelectorAll(window.getSelectors().conversationsCheckbox);
  allCheckboxes.forEach(checkbox => checkbox.remove());
}

async function deleteConversation(checkbox) {
  const conversationElement = checkbox.parentElement;

  console.log("1. Clicking conversation...", conversationElement);
  conversationElement.click();
  await delay(300);

  const threeDotButton = conversationElement.parentElement.querySelector(window.getSelectors().threeDotButton);
  await delay(500);

  console.log("2. Clicking three dot button...", conversationElement);
  const pointerDownEvent = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerType: 'mouse'
  });

  threeDotButton.dispatchEvent(pointerDownEvent);

  const deleteButton = await waitForElement(window.getSelectors().deleteButton);

  if (deleteButton) {
    console.log("3. Clicking delete button...", deleteButton);

    deleteButton.click();
    const confirmButton = await waitForElement(window.getSelectors().confirmDeleteButton);

    if (confirmButton) {
      console.log("4. Clicking confirm button...");
      confirmButton.click();

      await waitForElementToDisappear(window.getSelectors().confirmDeleteButton);
    }
  }

  console.log("5. Deletion completed.");
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
