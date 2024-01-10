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
  return [...document.querySelectorAll(Selectors.conversationsCheckbox)];
}

function removeAllCheckboxes() {
  const allCheckboxes = document.querySelectorAll(Selectors.conversationsCheckbox);
  allCheckboxes.forEach(checkbox => checkbox.remove());
}

async function deleteConversation(checkbox) {
  const conversationElement = checkbox.parentElement;
  await delay(100);
  // console.log("1. Clicking conversation...", conversationElement);
  // conversationElement.click(); 
  // 将 click 替换为悬停

  // 创建一个鼠标悬停事件
  const hoverEvent = new MouseEvent('mouseover', {
    view: window,
    bubbles: true,
    cancelable: true
  });

  console.log("1. Hovering over conversation...", conversationElement);
  // 触发鼠标悬停事件
  conversationElement.dispatchEvent(hoverEvent);  
  await delay(200);

  const pointerDownEvent = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerType: 'mouse'
  });
  const threeDotButton = await waitForElement(Selectors.threeDotButton, conversationElement.parentElement);
  threeDotButton.dispatchEvent(pointerDownEvent);
  await delay(300);
  console.log("2. Clicking three dot button...", threeDotButton);

  const deleteButton = await waitForElement(Selectors.deleteButton);

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

async function waitForElement(selector, parent = document, timeout = 2000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
    const element = parent.querySelector(selector);
    if (element) return element; // 返回找到的元素
    await delay(100);
  }
  console.log(`Element ${selector} not found within ${timeout}ms in the specified parent`);
  throw new Error(`Element ${selector} not found within ${timeout}ms in the specified parent`);
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
