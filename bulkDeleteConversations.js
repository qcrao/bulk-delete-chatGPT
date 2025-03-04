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

  // Send analytics event
  sendEventAsync("delete", selectedConversations.length);

  // Track how many conversations were actually processed
  let processedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < selectedConversations.length; i++) {
    const result = await deleteConversation(selectedConversations[i]);
    if (result) {
      processedCount++;
    } else {
      skippedCount++;
    }

    // Calculate progress based on total attempts
    const progress = Math.round(((i + 1) / selectedConversations.length) * 100);
    chrome.runtime.sendMessage({
      action: "updateProgress",
      buttonId: "bulk-delete",
      progress: progress,
    });
  }

  console.log(
    `Processed ${processedCount} conversations, skipped ${skippedCount} conversations`
  );

  chrome.runtime.sendMessage({
    action: "operationComplete",
    buttonId: "bulk-delete",
  });
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

  console.log("conversationElement", conversationElement);

  // Look for draggable element within the conversation element
  const draggableElement = conversationElement.querySelector("[draggable=\"true\"]");
  if (!draggableElement) {
    console.log("Skipping conversation - no interactive elements found");
    // Show notification to user
    const title =
      conversationElement.querySelector(Selectors.TITLE_SELECTOR)
        ?.textContent || "this conversation";
    alert(`Unable to delete the conversation: "${title}".`);
    return false;
  }

  const hoverEvent = new MouseEvent("mouseover", {
    view: window,
    bubbles: true,
    cancelable: true,
  });

  console.log("1. Hovering over conversation...", conversationElement);
  draggableElement.dispatchEvent(hoverEvent);
  await delay(200);

  // Try to find the three dot button
  try {
    const threeDotButton = await waitForElement(
      Selectors.threeDotButton,
      conversationElement.parentElement,
      1000 // Reduced timeout for non-hoverable items
    );

    console.log("2. Clicking three dot button...", threeDotButton);
    const pointerDownEvent = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
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
        return true;
      }
    }
  } catch (error) {
    console.log("Could not complete deletion process:", error);
    return false;
  }

  return false;
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

// Start the bulk delete process
bulkDeleteConversations();
