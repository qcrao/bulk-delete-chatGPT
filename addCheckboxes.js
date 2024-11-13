console.log("addCheckboxes.js loaded");

// Create a new checkbox element with specific styles
function createCheckbox(index) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = CHECKBOX_CLASS;
  checkbox.dataset.index = index;
  checkbox.style.cssText = `
    margin-right: 8px;
    margin-left: 4px;
    position: relative;
    top: 1px;
  `;
  checkbox.addEventListener("click", handleCheckboxClick);
  return checkbox;
}

function handleCheckboxClick(event) {
  event.stopPropagation();
  const clickedCheckbox = event.target;
  checkPreviousCheckboxes(clickedCheckbox);
  window.lastCheckedCheckbox = clickedCheckbox;
}

function toggleCheckboxInConversation(conversation, event) {
  event.preventDefault();
  event.stopPropagation();

  const checkbox = conversation.querySelector(`.${CHECKBOX_CLASS}`);
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    checkPreviousCheckboxes(checkbox);
    if (checkbox.checked) {
      window.lastCheckedCheckbox = checkbox;
    }
  }
}

function checkPreviousCheckboxes(clickedCheckbox) {
  if (window.shiftPressed && window.lastCheckedCheckbox) {
    const allCheckboxes = Array.from(
      document.querySelectorAll(`.${CHECKBOX_CLASS}`)
    );
    const start = allCheckboxes.indexOf(window.lastCheckedCheckbox);
    const end = allCheckboxes.indexOf(clickedCheckbox);

    const [lower, upper] = start < end ? [start, end] : [end, start];

    for (let i = lower; i <= upper; i++) {
      allCheckboxes[i].checked = true;
    }
  }
}

function addShiftKeyEventListeners() {
  console.log("Adding Shift key event listeners...");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Shift") {
      console.log("Shift key pressed");
      window.shiftPressed = true;
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "Shift") {
      console.log("Shift key released");
      window.shiftPressed = false;
    }
  });
}

// 添加复选框到每个对话
function addCheckboxes() {
  console.log("Adding checkboxes to conversations...", Selectors);
  const conversations = document.querySelectorAll(
    Selectors.CONVERSATION_SELECTOR
  );

  conversations.forEach((conversation, index) => {
    let existingCheckbox = conversation.querySelector(`.${CHECKBOX_CLASS}`);

    // 如果复选框已存在，获取其选中状态并移除它
    let isChecked = existingCheckbox ? existingCheckbox.checked : false;
    if (existingCheckbox) {
      existingCheckbox.remove();
    }

    // 创建一个新的 flexbox 容器
    const flexContainer = document.createElement("div");
    flexContainer.style.cssText = `
      display: flex;
      align-items: center;
      width: 100%;
      padding: 0;
      min-height: inherit;
    `;

    // 创建新的复选框并添加到 flexContainer
    const checkbox = createCheckbox(index);
    checkbox.checked = isChecked;
    flexContainer.appendChild(checkbox);

    // 将原有内容移动到 flexContainer 中
    while (conversation.firstChild) {
      flexContainer.appendChild(conversation.firstChild);
    }

    // 将 flexContainer 添加到对话中
    conversation.appendChild(flexContainer);

    // 禁用对话的默认点击行为
    const link = conversation.querySelector("a");
    if (link) {
      link.style.pointerEvents = "none";
      link.style.cursor = "default";
    }

    // 添加点击事件到当前对话元素
    conversation.addEventListener("click", (event) => {
      // 只有当点击的不是复选框时才触发
      if (!event.target.classList.contains(CHECKBOX_CLASS)) {
        toggleCheckboxInConversation(conversation, event);
      }
    });

    conversation.style.cursor = "pointer";
  });

  addShiftKeyEventListeners();
}

// run the main function
addCheckboxes();
