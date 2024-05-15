console.log('addCheckboxes.js loaded');

// Add checkboxes to each conversation
function addCheckboxes() {
    console.log('Adding checkboxes to conversations...', Selectors);
    const conversations = document.querySelectorAll(Selectors.CONVERSATION_SELECTOR);

    conversations.forEach((conversation, index) => {
        let checkbox = conversation.querySelector(`.${CHECKBOX_CLASS}`);

        // If the checkbox does not exist, create and insert it
        if (!checkbox) {
            checkbox = createCheckbox(index);
            conversation.insertAdjacentElement('afterbegin', checkbox);
        }

        // Add click event to the conversation title
        const titleElement = conversation.querySelector(Selectors.TITLE_SELECTOR);
        if (titleElement) {
            titleElement.style.cursor = 'default';

            // Add click event listener if not already added
            if (!titleElement.dataset.hasClickListener) {
                addClickEventListener(titleElement);
            }

            // Add click event listener to the parent element if not already added
            const parentElement = titleElement.parentElement;
            if (parentElement && !parentElement.dataset.hasClickListener) {
                parentElement.style.cursor = 'default';
                addClickEventListener(parentElement);
            }
        }
    });
}

// Create a new checkbox element
function createCheckbox(index) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = CHECKBOX_CLASS;
    checkbox.dataset.index = index;
    checkbox.addEventListener('click', preventEventPropagation);
    return checkbox;
}

// Add click event listener to an element
function addClickEventListener(element) {
    const handleTitleClick = (event) => {
        toggleCheckbox(event);
        event.stopPropagation();
    };
    element.addEventListener('click', handleTitleClick);
    element.dataset.hasClickListener = 'true';
}

function findAncestorWithCheckbox(el, selector) {
    while ((el = el.parentElement) && !el.querySelector(selector));
    return el;
}

// Toggle the checkbox's checked state
function toggleCheckbox(event) {
    event.preventDefault();
    event.stopPropagation();

    const parentElement = findAncestorWithCheckbox(event.currentTarget, `.${CHECKBOX_CLASS}`);
    const checkbox = parentElement ? parentElement.querySelector(`.${CHECKBOX_CLASS}`) : null;
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
    }
}

function preventEventPropagation(event) {
    event.stopPropagation();
}

addCheckboxes();
