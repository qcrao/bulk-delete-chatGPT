async function bulkDeleteConversations() {
  const selectedConversations = getSelectedConversations();

  if (selectedConversations.length === 0) {
      console.log("No conversations to delete.");
      removeAllCheckboxes();
      return;
  }

  console.log("Selected Conversations:", selectedConversations);

  // 使用 for 循环按顺序删除选中的对话
  for (const element of selectedConversations) {
    await delay(300);
    await deleteConversation(element);
  }
}

function getSelectedConversations() {
  return [...document.querySelectorAll('.conversation-checkbox:checked')];
}

function removeAllCheckboxes() {
  const allCheckboxes = document.querySelectorAll('.conversation-checkbox');
  allCheckboxes.forEach(checkbox => checkbox.remove());
}

async function deleteConversation(checkbox) {
  const conversationElement = await checkbox.closest('.flex.p-3.items-center.gap-3.relative.rounded-md')

  console.log("1. 开始删除", conversationElement);
  conversationElement.click(); // 点击对话

  // debugger

  const deleteButton = await waitForElement("nav div a>div>button:nth-child(2)");

  if (deleteButton) {
      await delay(100);
      console.log("2. 点击删除按钮");

      deleteButton.click(); // 点击删除按钮

      // 等待确认删除对话框的按钮出现
      const confirmButton = await waitForElement('button.btn.btn-danger');

      if (confirmButton) {
          console.log("3. 点击确认按钮");
          confirmButton.click();

          // 等待删除按钮消失
          await waitForElementToDisappear('button.btn.btn-danger');
      }
  }

  console.log("4. 完成删除");
}

// 用于等待某元素出现的函数
async function waitForElement(selector, timeout = 5000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await delay(100);
  }
  console.log('do not found delete confirm button')
  throw new Error(`Element ${selector} not found within ${timeout}ms`);
}

// 用于等待某元素消失的函数
async function waitForElementToDisappear(selector, timeout = 5000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
      const element = document.querySelector(selector);
      if (!element) return;
      await delay(100);
  }
  throw new Error(`Element ${selector} did not disappear within ${timeout}ms`);
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

bulkDeleteConversations();
