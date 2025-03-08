console.log("bulkArchiveConversations.js loaded");

async function bulkArchiveConversations() {
  const selectedConversations = getSelectedConversations();

  if (selectedConversations.length === 0) {
    console.log("No conversations to archive.");
    removeAllCheckboxes();
    return;
  }

  console.log("Selected Conversations:", selectedConversations);

  sendEventAsync("archive", selectedConversations.length);

  for (let i = 0; i < selectedConversations.length; i++) {
    await archiveConversation(selectedConversations[i]);
    const progress = Math.round(((i + 1) / selectedConversations.length) * 100);
    chrome.runtime.sendMessage({
      action: "updateProgress",
      buttonId: "bulk-archive",
      progress: progress,
    });
  }

  chrome.runtime.sendMessage({
    action: "operationComplete",
    buttonId: "bulk-archive",
  });
}

function getSelectedConversations() {
  return [...document.querySelectorAll(Selectors.conversationsCheckbox)];
}

function removeAllCheckboxes() {
  const allCheckboxes = document.querySelectorAll(`.${CHECKBOX_CLASS}`);
  allCheckboxes.forEach((checkbox) => checkbox.remove());
}

async function archiveConversation(checkbox) {
  await delay(100);

  const conversationElement = checkbox.parentElement;
  const hoverEvent = new MouseEvent("mouseover", {
    view: window,
    bubbles: true,
    cancelable: true,
  });

  console.log("1. Hovering over conversation...", conversationElement);

  const interactiveElement = conversationElement.querySelector("[draggable=\"true\"]");
  if (!interactiveElement) {
    console.log("Skipping conversation - no interactive elements found");
    // Show notification to user
    const title =
      conversationElement.querySelector(Selectors.TITLE_SELECTOR)
        ?.textContent || "this conversation";
    alert(`Unable to archive the conversation: "${title}".`);
    return false;
  }

  interactiveElement.dispatchEvent(hoverEvent);
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

  const archiveButton = await waitForArchiveButton();

  if (archiveButton) {
    console.log("3. Clicking archive button...", archiveButton);
    archiveButton.click();
    await delay(500);
  }

  console.log("4. Archiving completed.");
}

async function waitForArchiveButton(parent = document, timeout = 2000) {
  const selector = 'div[role="menuitem"]';
  const textContent = "Archive";
  const textContentSimplifiedChinese = "归档";
  const textContentTraditionalChinese = "封存";

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const elements = parent.querySelectorAll(selector);
    const element = Array.from(elements).find(
      (el) =>
        el.textContent.trim() === textContent ||
        el.textContent.trim() === textContentSimplifiedChinese ||
        el.textContent.trim() === textContentTraditionalChinese
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

bulkArchiveConversations();
