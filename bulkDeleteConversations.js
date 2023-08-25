async function bulkDeleteConversations() {
  const selectedConversations = getSelectedConversations();

  if (selectedConversations.length === 0) {
      console.log("No conversations to delete.");
      removeAllCheckboxes();
      return;
  }

  console.log("Selected Conversations:", selectedConversations);

  await deleteConversation(selectedConversations[0]);
  const updatedConversations = selectedConversations.map(conversation => conversation - 1);

  delay(1000);
  await addCheckboxesWithState(updatedConversations.slice(1));

  bulkDeleteConversations();
}

function getSelectedConversations() {
  const selectedCheckboxes = document.querySelectorAll('.conversation-checkbox:checked');
  return Array.from(selectedCheckboxes).map(checkbox => parseInt(checkbox.dataset.index));
}

function removeAllCheckboxes() {
  const allCheckboxes = document.querySelectorAll('.conversation-checkbox');
  allCheckboxes.forEach(checkbox => checkbox.remove());
}

async function deleteConversation(conversationIndex) {
  const checkbox = document.querySelector(`.conversation-checkbox[data-index='${conversationIndex}']`);
  const conversationElement = checkbox.closest('.flex.py-3.px-3.items-center.gap-3.relative.rounded-md');

  console.log("开始删除...");
  console.log("currentIndex:", conversationIndex);
  conversationElement.click(); // 点击对话

  const deleteButton = await waitForElement('.absolute.flex.right-1.z-10.text-gray-300.visible button:nth-child(3)');

  if (deleteButton) {
      console.log("点击删除按钮...");
      deleteButton.click(); // 点击删除按钮

      // 等待确认删除对话框的按钮出现
      const confirmButton = await waitForElement('button.btn.btn-danger');

      if (confirmButton) {
          console.log("点击确认按钮...");
          confirmButton.click();

          // 等待删除按钮消失
          await waitForElementToDisappear('button.btn.btn-danger');
      }
  }

  console.log("完成删除。");
}

// 用于等待某元素出现的函数
async function waitForElement(selector, timeout = 5000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await delay(100);
  }
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

async function addCheckboxesWithState(remainingConversations) {
  removeAllCheckboxes();
  
  const conversations = document.querySelectorAll('.flex.py-3.px-3.items-center.gap-3.relative.rounded-md.hover\\:bg-\\[\\#2A2B32\\].cursor-pointer.break-all.hover\\:pr-4.group');
  for (const [index, conversation] of conversations.entries()) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'conversation-checkbox';
      checkbox.dataset.index = index;

      if (remainingConversations.includes(index)) {
          checkbox.checked = true;
      }

      conversation.insertAdjacentElement('afterbegin', checkbox);
  }

  const remainingCheckboxes = document.querySelectorAll('.conversation-checkbox');
  for (let i = 0; i < remainingCheckboxes.length; i++) {
      remainingCheckboxes[i].dataset.index = i;
  }

  return Promise.resolve();
}

bulkDeleteConversations();
