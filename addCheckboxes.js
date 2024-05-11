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
        checkPreviousCheckboxes(checkbox);
    }
    event.stopPropagation();
}

function handleCheckboxClick(event) {
    // 阻止事件冒泡
    event.stopPropagation();

    checkPreviousCheckboxes(event.target);
}

function checkPreviousCheckboxes(clickedCheckbox) {
    if (shiftPressed && clickedCheckbox.checked) {
        const allCheckboxes = Array.from(document.querySelectorAll(`.${CHECKBOX_CLASS}`));
        const previousCheckboxes = allCheckboxes.slice(0, allCheckboxes.indexOf(clickedCheckbox));

        let index = previousCheckboxes.length - 1;
        while (index >= 0 && !previousCheckboxes[index].checked) {
            index--;
        }

        // A negative index means no previous checkbox is checked
        if (index >= 0) {
            previousCheckboxes.slice(index).forEach((checkbox) => {
                checkbox.checked = true;    
            });
        }
    }
}

function addShiftKeyEventListeners() {
    console.log('Adding Shift key event listeners...');
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Shift') {
            shiftPressed = true;
        }
    });

    document.addEventListener('keyup', (event) => {
        if (event.key === 'Shift') {
            shiftPressed = false;
        }
    });
}

// 添加复选框到每个对话
function addCheckboxes() {
    console.log('Adding checkboxes to conversations...', Selectors);
    const conversations = document.querySelectorAll(Selectors.CONVERSATION_SELECTOR);

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
        checkbox.addEventListener('click', handleCheckboxClick);
        conversation.insertAdjacentElement('afterbegin', checkbox);

        // 为对话标题添加点击事件
        const titleElement = conversation.querySelector(Selectors.TITLE_SELECTOR);
        if (titleElement) {
            titleElement.style.cursor = 'default';

            // 获取 titleElement 的父元素
            const parentElement = titleElement.parentElement;

            // 定义一个通用的事件处理函数
            const handleTitleClick = (event) => {
                toggleCheckbox(event);
                event.stopPropagation(); // 防止事件冒泡
            };

            // 为 titleElement 添加点击事件
            if (!titleElement.dataset.hasClickListener) {
                titleElement.addEventListener('click', handleTitleClick);
                titleElement.dataset.hasClickListener = 'true';
            }

            // 为 titleElement 的父元素添加点击事件
            if (parentElement && !parentElement.dataset.hasClickListener) {
                parentElement.style.cursor = 'default';
                parentElement.addEventListener('click', handleTitleClick);
                parentElement.dataset.hasClickListener = 'true';
            }
        }
    });

    addShiftKeyEventListeners();
}

// 执行主函数
addCheckboxes();
