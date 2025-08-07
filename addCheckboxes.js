console.log("addCheckboxes.js loaded");

// Checkbox management module
const CheckboxManager = {
  // Create checkbox with event handling
  createCheckbox(index) {
    const checkbox = DOMHandler.createCheckbox(index);
    checkbox.addEventListener("click", (event) => {
      EventHandler.handleCheckboxClick(event, checkbox);
    });
    return checkbox;
  },

  // Add checkbox to conversation with layout
  addCheckboxToConversation(conversation, index) {
    let existingCheckbox = conversation.querySelector(`.${CSS_CLASSES.CHECKBOX}`);
    
    // Preserve existing checkbox state
    let isChecked = existingCheckbox ? existingCheckbox.checked : false;
    if (existingCheckbox) {
      existingCheckbox.remove();
    }

    // Create new layout structure
    const flexContainer = DOMHandler.createFlexContainer();
    const checkbox = this.createCheckbox(index);
    checkbox.checked = isChecked;
    flexContainer.appendChild(checkbox);

    // Move existing content to container
    while (conversation.firstChild) {
      flexContainer.appendChild(conversation.firstChild);
    }

    conversation.appendChild(flexContainer);
    return checkbox;
  },

  // Setup conversation interaction
  setupConversationInteraction(conversation) {
    // Disable default link behavior
    DOMHandler.toggleConversationInteraction(conversation, true);
    
    // Add click handler for checkbox toggle
    conversation.addEventListener("click", (event) => {
      if (!event.target.classList.contains(CSS_CLASSES.CHECKBOX)) {
        EventHandler.toggleCheckboxInConversation(conversation, event);
      }
    });

    conversation.style.cursor = "pointer";
  }
};

// Main function to add checkboxes
function addCheckboxes() {
  try {
    console.log("Adding checkboxes to conversations...");
    
    const conversations = DOMHandler.getAllConversations();
    console.log(`Found ${conversations.length} conversations`);

    conversations.forEach((conversation, index) => {
      CheckboxManager.addCheckboxToConversation(conversation, index);
      CheckboxManager.setupConversationInteraction(conversation);
    });

    // Add keyboard event listeners
    EventHandler.addKeyboardListeners();
    
    console.log("Checkboxes added successfully");
  } catch (error) {
    console.error("Error adding checkboxes:", error);
    CommonUtils.showNotification(`Error adding checkboxes: ${error.message}`, 'error');
  }
}

// Run the main function
addCheckboxes();
