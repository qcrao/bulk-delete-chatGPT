console.log("bulkDeleteConversations.js loaded");

console.log("bulkDeleteConversations.js loaded");

async function bulkDeleteConversations() {
  const selectedConversations = getSelectedConversations();

  if (selectedConversations.length === 0) {
    console.log("No conversations to delete.");
    removeAllCheckboxes();
    chrome.runtime.sendMessage({ action: "deleteComplete" });
    return;
  }

  console.log("Selected Conversations:", selectedConversations.length);

  sendEventAsync("delete", selectedConversations.length);

  for (let i = 0; i < selectedConversations.length; i++) {
    await deleteConversation(selectedConversations[i]);
    const progress = Math.round(((i + 1) / selectedConversations.length) * 100);
    chrome.runtime.sendMessage({
      action: "updateProgress",
      progress: progress,
    });
  }

  chrome.runtime.sendMessage({ action: "deleteComplete" });
}

function getSelectedConversations() {
  return [...document.querySelectorAll(Selectors.conversationsCheckbox)];
}

function removeAllCheckboxes() {
  const allCheckboxes = document.querySelectorAll(`.${CHECKBOX_CLASS}`);
  allCheckboxes.forEach((checkbox) => checkbox.remove());
}

async function deleteConversation(checkbox) {
  await delay(100);

  const conversationElement = checkbox.parentElement;
  const hoverEvent = new MouseEvent("mouseover", {
    view: window,
    bubbles: true,
    cancelable: true,
  });

  console.log("1. Hovering over conversation...", conversationElement);
  conversationElement.dispatchEvent(hoverEvent);
  await delay(200);

  const pointerDownEvent = new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    pointerType: "mouse",
  });
  const threeDotButton = await waitForElement(
    Selectors.threeDotButton,
    conversationElement.parentElement
  );
  console.log("2. Clicking three dot button...", threeDotButton);
  threeDotButton.dispatchEvent(pointerDownEvent);
  await delay(300);

  const deleteButton = await waitForDeleteButton();

  if (deleteButton) {
    console.log("3. Clicking delete button...", deleteButton);

    deleteButton.click();

    const confirmButton = await waitForElement(Selectors.confirmDeleteButton);
    if (confirmButton) {
      console.log("4. Clicking confirm button...");
      confirmButton.click();

      await waitForElementToDisappear(Selectors.confirmDeleteButton);
    }
  }

  console.log("5. Deletion completed.");
}

async function waitForDeleteButton(parent = document, timeout = 2000) {
  const selector = 'div[role="menuitem"]';
  const textContent = "Delete";
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const elements = parent.querySelectorAll(selector);
    const element = Array.from(elements).find(
      (el) =>
        el.textContent.trim() === textContent ||
        el.querySelector(".text-token-text-error")
    );
    if (element) return element;
    await delay(100);
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForElement(selector, parent = document, timeout = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const element = parent.querySelector(selector);
    if (element) return element;
    await delay(100);
  }

  throw new Error(
    `Element ${selector} not found within ${timeout}ms in the specified parent`
  );
}

async function waitForElementToDisappear(selector, timeout = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const element = document.querySelector(selector);
    if (!element) return;
    await delay(100);
  }

  throw new Error(`Element ${selector} did not disappear within ${timeout}ms`);
}

bulkDeleteConversations();
