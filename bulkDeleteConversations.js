async function bulkDeleteConversations() {
  const conversationCheckboxes = document.querySelectorAll('.conversation-checkbox:checked');
  const checkedIndexes = Array.from(conversationCheckboxes).map(checkbox => parseInt(checkbox.dataset.index));
  if (checkedIndexes.length === 0) {
    console.log("No conversations to delete.");

    // Remove all checkboxes
    const removeConversationCheckboxes = document.querySelectorAll('.conversation-checkbox');
    removeConversationCheckboxes.forEach(checkbox => {
      checkbox.remove();
    });

    return;
  }

  async function waitForElement(selector, timeout = 5000) {
    const startedAt = Date.now();
    let el = null;
    while ((Date.now() - startedAt) < timeout) {
        el = document.querySelector(selector);
        if (el) return el;
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Element ${selector} not found within ${timeout}ms`);
}

  console.log("开始删除...")
  const checkbox = conversationCheckboxes[0];
  const currentIndex = parseInt(checkbox.dataset.index);
  console.log("currentIndex:", currentIndex);
  const conversationElement = checkbox.closest('.flex.py-3.px-3.items-center.gap-3.relative.rounded-md');
  conversationElement.click(); // Click the conversation first
  await new Promise(resolve => setTimeout(resolve, 500)); // Add a delay of 0.5 second

  const deleteButton = document.querySelector('.absolute.flex.right-1.z-10.text-gray-300.visible button:nth-child(3)'); // Updated delete button selector

  if (deleteButton) {
    console.log("点击删除按钮1...")
    deleteButton.click(); // Click the delete button
    console.log("点击删除按钮2...")
    await waitForElement('div[role="dialog"][data-state="open"] button.btn-danger');

    console.log("点击删除按钮3...")
    // const buttonsContainer = document.querySelector('mt-5 flex flex-col gap-3 sm:mt-4 sm:flex-row-reverse');
    const confirmButton = document.querySelector('button.btn.btn-danger');

    if (confirmButton) {
      console.log("点击确认按钮...")
      confirmButton.click();
      // await new Promise(resolve => setTimeout(resolve, 1000)); // Add a delay of 1 second
      // 等待删除按钮消失
      const deleteButtonDisappeared = new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (!document.querySelector('button.btn.btn-danger')) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
      await deleteButtonDisappeared;
    }
  }

  console.log("delete done")

  // 在这里删除当前选中的对话的索引
  console.log("删除当前选中的对话的索引...")
  console.log("checkedIndexes before splice", checkedIndexes);
  const indexToRemove = checkedIndexes.indexOf(currentIndex);
  if (indexToRemove > -1) {
    checkedIndexes.splice(indexToRemove, 1);
  }
  console.log("checkedIndexes after splice", checkedIndexes);

  // 更新剩余对话的索引
  console.log("更新剩余对话的索引...")
  for (let j = 0; j < checkedIndexes.length; j++) {
    if (checkedIndexes[j] > currentIndex) {
      checkedIndexes[j]--;
    }
  }
  console.log("checkedIndexes after update index", checkedIndexes);

  // Wait for 1 second before deleting the next conversation
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 重新添加复选框并设置它们的状态
  console.log("重新添加复选框并设置它们的状态...")
  await addCheckboxesWithState(checkedIndexes);
  
  console.log("递归调用 bulkDeleteConversations...")
  bulkDeleteConversations();
}

async function addCheckboxesWithState(checkedIndexes) {
  // 移除现有的复选框
  const existingCheckboxes = document.querySelectorAll('.conversation-checkbox');
  existingCheckboxes.forEach((checkbox) => {
    checkbox.remove();
  });
  
  // 在这里重新添加复选框
  const conversations = document.querySelectorAll('.flex.py-3.px-3.items-center.gap-3.relative.rounded-md.hover\\:bg-\\[\\#2A2B32\\].cursor-pointer.break-all.hover\\:pr-4.group');
  conversations.forEach((conversation, index) => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'conversation-checkbox';
    checkbox.dataset.index = index;

    if (checkedIndexes.includes(index)) {
      checkbox.checked = true;
    }

    conversation.insertAdjacentElement('afterbegin', checkbox);
  });

  // Update data-index attributes for remaining checkboxes
  const remainingCheckboxes = document.querySelectorAll('.conversation-checkbox');
  for (let i = 0; i < remainingCheckboxes.length; i++) {
    remainingCheckboxes[i].dataset.index = i;
  }

  return Promise.resolve();
}

bulkDeleteConversations();