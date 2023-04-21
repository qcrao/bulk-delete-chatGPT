function addCheckboxes() {
  const conversations = document.querySelectorAll(
    '.flex.flex-col.gap-2.pb-2.text-gray-100.text-sm > .flex.py-3.px-3.items-center.gap-3.relative.rounded-md'
  );

  conversations.forEach((conversation, index) => {
    const existingCheckbox = conversation.querySelector('.conversation-checkbox');
    if (!existingCheckbox) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'conversation-checkbox';
      checkbox.dataset.index = index; // 设置 data-index 属性
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      conversation.insertBefore(checkbox, conversation.firstChild);
    }
  });
}

addCheckboxes();
