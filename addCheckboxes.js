function toggleCheckbox(event) {
    // 从标题元素获取其前一个兄弟元素，即复选框
    const checkbox = event.currentTarget.parentElement.querySelector('.conversation-checkbox');
    if (checkbox && checkbox.type === 'checkbox') {
        checkbox.checked = !checkbox.checked;
    }
    event.stopPropagation();
}

function preventEventPropagation(event) {
    event.stopPropagation();
}

function addCheckboxes() {
    const conversationSelectors = '.flex.py-3.px-3.items-center.gap-3.relative.rounded-md';
    const titleSelectors = '.flex-1.text-ellipsis.max-h-5.overflow-hidden.break-all.relative';
    const conversations = document.querySelectorAll(conversationSelectors);

    for (const [index, conversation] of conversations.entries()) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'conversation-checkbox';
        checkbox.dataset.index = index;

        conversation.insertAdjacentElement('afterbegin', checkbox);

        const titleElement = conversation.querySelector(titleSelectors);
        if (titleElement) {
            titleElement.style.cursor = 'default';
            titleElement.addEventListener('click', toggleCheckbox);
            checkbox.addEventListener('click', preventEventPropagation);
        }
    }
}

addCheckboxes();
