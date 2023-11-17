console.log('addCheckboxes.js loaded');

// 查找带有特定选择器的祖先元素
function findAncestorWithCheckbox(el, selector) {
    while ((el = el.parentElement) && !el.querySelector(selector));
    return el;
}

// 切换复选框的选中状态
function toggleCheckbox(event) {
    // 阻止事件的默认行为（例如链接跳转）
    event.preventDefault();
    // 阻止事件冒泡到父元素
    event.stopPropagation();

    const parentElement = findAncestorWithCheckbox(event.currentTarget, `.${CHECKBOX_CLASS}`);
    const checkbox = parentElement ? parentElement.querySelector(`.${CHECKBOX_CLASS}`) : null;
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
    }
    event.stopPropagation();
}

// 阻止事件冒泡
function preventEventPropagation(event) {
    event.stopPropagation();
}

// 添加复选框到每个对话
function addCheckboxes() {
    console.log('Adding checkboxes to conversations...', window.getSelectors(), isPlusUser());
    const conversations = document.querySelectorAll(window.getSelectors().CONVERSATION_SELECTOR);

    conversations.forEach((conversation, index) => {
        let existingCheckbox = conversation.querySelector(`.${CHECKBOX_CLASS}`);

        // 如果复选框已存在，获取其选中状态并移除它
        let isChecked = existingCheckbox ? existingCheckbox.checked : false;
        if (existingCheckbox) {
            existingCheckbox.remove();
        }

        // 创建新的复选框并设置其属性
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = CHECKBOX_CLASS;
        checkbox.dataset.index = index;
        checkbox.checked = isChecked;
        checkbox.addEventListener('click', preventEventPropagation);
        conversation.insertAdjacentElement('afterbegin', checkbox);

        // 为对话标题添加点击事件
        const titleElement = conversation.querySelector(window.getSelectors().TITLE_SELECTOR);
        if (titleElement) {
            titleElement.style.cursor = 'default';
            if (!titleElement.dataset.hasClickListener) { // 检查是否已经添加了监听器
                titleElement.addEventListener('click', toggleCheckbox);
                titleElement.dataset.hasClickListener = 'true'; // 标记已经添加了监听器
            }
        }
    });
}

// 执行主函数
addCheckboxes();
