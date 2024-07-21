console.log("addCheckboxes.js loaded");

// Create a new checkbox element
function createCheckbox(index) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = CHECKBOX_CLASS;
  checkbox.dataset.index = index;
  checkbox.addEventListener("click", preventEventPropagation);
  return checkbox;
}

// Add click event listener to an element
function addClickEventListener(element) {
  const handleTitleClick = (event) => {
    toggleCheckbox(event);
    event.stopPropagation();
  };
  element.addEventListener("click", handleTitleClick);
  element.dataset.hasClickListener = "true";
}

function findAncestorWithCheckbox(el, selector) {
  while ((el = el.parentElement) && !el.querySelector(selector));
  return el;
}

// Toggle the checkbox's checked state
function toggleCheckbox(event) {
  event.preventDefault();
  event.stopPropagation();

  const parentElement = findAncestorWithCheckbox(
    event.currentTarget,
    `.${CHECKBOX_CLASS}`
  );
  const checkbox = parentElement
    ? parentElement.querySelector(`.${CHECKBOX_CLASS}`)
    : null;
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    checkPreviousCheckboxes(checkbox);

    // 更新最后选中的复选框
    if (checkbox.checked) {
      window.lastCheckedCheckbox = checkbox;
    }
  }
}

function handleCheckboxClick(event) {
  event.stopPropagation();

  const clickedCheckbox = event.target;
  checkPreviousCheckboxes(clickedCheckbox);

  // 更新最后选中的复选框
  window.lastCheckedCheckbox = clickedCheckbox;
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

    // 创建新的复选框并设置其属性
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = CHECKBOX_CLASS;
    checkbox.dataset.index = index;
    checkbox.checked = isChecked;
    checkbox.addEventListener("click", handleCheckboxClick);
    conversation.insertAdjacentElement("afterbegin", checkbox);

    // add click event listener to the title element
    const titleElement = conversation.querySelector(Selectors.TITLE_SELECTOR);
    if (titleElement) {
      titleElement.style.cursor = "default";

      // get the parent element of titleElement
      const parentElement = titleElement.parentElement;

      // define a common event handler
      const handleTitleClick = (event) => {
        toggleCheckbox(event);
        event.stopPropagation(); // prevent event propagation
      };

      // add click event listener to titleElement
      if (!titleElement.dataset.hasClickListener) {
        titleElement.addEventListener("click", handleTitleClick);
        titleElement.dataset.hasClickListener = "true";
      }

      // add click event listener to the parent element of titleElement
      if (parentElement && !parentElement.dataset.hasClickListener) {
        parentElement.style.cursor = "default";
        parentElement.addEventListener("click", handleTitleClick);
        parentElement.dataset.hasClickListener = "true";
      }
    }
  });

  addShiftKeyEventListeners();
}

// run the main function
addCheckboxes();
