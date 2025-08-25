if (typeof window.domHandlerLoaded === "undefined") {
  console.log("domHandler.js loaded");

  window.domHandlerLoaded = true;

  // DOM manipulation utilities
  const DOMHandler = {
    // Create checkbox with consistent styling
    createCheckbox(index) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = CSS_CLASSES.CHECKBOX;
      checkbox.dataset.index = index;
      checkbox.style.cssText = `
        margin-right: 8px;
        margin-left: 4px;
        position: relative;
        top: 1px;
      `;
      return checkbox;
    },

    // Create flex container for conversation layout
    createFlexContainer() {
      const container = document.createElement("div");
      container.style.cssText = `
        display: flex;
        align-items: center;
        width: 100%;
        padding: 0;
      `;
      return container;
    },

    // Get conversation title safely
    getConversationTitle(conversationElement) {
      const titleElement = conversationElement.querySelector(UI_CONFIG.SELECTORS.TITLE_SELECTOR);
      return titleElement ? titleElement.textContent.trim() : "this conversation";
    },

    // Find interactive element in conversation
    findInteractiveElement(conversationElement) {
      return conversationElement.querySelector(UI_CONFIG.SELECTORS.INTERACTIVE_ELEMENT_SELECTOR);
    },

    // Dispatch hover event
    dispatchHoverEvent(element) {
      const hoverEvent = new MouseEvent("mouseover", {
        view: window,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(hoverEvent);
    },

    // Dispatch pointer down event
    dispatchPointerDownEvent(element) {
      const pointerDownEvent = new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "mouse",
      });
      element.dispatchEvent(pointerDownEvent);
    },

    // Get all conversations from history
    getAllConversations() {
      const history = document.querySelector(UI_CONFIG.SELECTORS.HISTORY);
      if (!history) {
        throw new Error("History container not found");
      }
      return history.querySelectorAll(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR);
    },

    // Toggle conversation link interaction
    toggleConversationInteraction(conversation, disable = true) {
      const link = conversation.querySelector("a");
      if (link) {
        if (disable) {
          link.style.pointerEvents = "none";
          link.style.cursor = "default";
        } else {
          link.style.pointerEvents = "auto";
          link.style.cursor = "pointer";
        }
      }
    }
  };

  // Event handling utilities
  const EventHandler = {
    // Handle checkbox click with shift selection
    handleCheckboxClick(event, checkbox) {
      event.stopPropagation();
      this.handleShiftSelection(checkbox);
      GlobalState.setLastCheckedCheckbox(checkbox);
    },

    // Handle shift key selection
    handleShiftSelection(clickedCheckbox) {
      if (GlobalState.isShiftPressed() && GlobalState.getLastCheckedCheckbox()) {
        const allCheckboxes = Array.from(
          document.querySelectorAll(`.${CSS_CLASSES.CHECKBOX}`)
        );
        const start = allCheckboxes.indexOf(GlobalState.getLastCheckedCheckbox());
        const end = allCheckboxes.indexOf(clickedCheckbox);

        if (start !== -1 && end !== -1) {
          const [lower, upper] = start < end ? [start, end] : [end, start];
          for (let i = lower; i <= upper; i++) {
            allCheckboxes[i].checked = true;
          }
        }
      }
    },

    // Toggle checkbox in conversation
    toggleCheckboxInConversation(conversation, event) {
      event.preventDefault();
      event.stopPropagation();

      const checkbox = conversation.querySelector(`.${CSS_CLASSES.CHECKBOX}`);
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        this.handleShiftSelection(checkbox);
        if (checkbox.checked) {
          GlobalState.setLastCheckedCheckbox(checkbox);
        }
      }
    },

    // Add keyboard event listeners
    addKeyboardListeners() {
      console.log("Adding keyboard event listeners...");
      
      document.addEventListener("keydown", (event) => {
        if (event.key === "Shift") {
          console.log("Shift key pressed");
          GlobalState.setShiftPressed(true);
        }
      });

      document.addEventListener("keyup", (event) => {
        if (event.key === "Shift") {
          console.log("Shift key released");
          GlobalState.setShiftPressed(false);
        }
      });
    }
  };

  // Export to global scope (for backward compatibility)
  window.DOMHandler = DOMHandler;
  window.EventHandler = EventHandler;

  // Register modules with the core system
  if (window.ChatGPTBulkDelete && window.ChatGPTBulkDelete.registerModule) {
    window.ChatGPTBulkDelete.registerModule('DOMHandler', DOMHandler);
    window.ChatGPTBulkDelete.registerModule('EventHandler', EventHandler);
  } else {
    // Fallback: wait for core system to be ready
    const registerModules = () => {
      if (window.ChatGPTBulkDelete && window.ChatGPTBulkDelete.registerModule) {
        window.ChatGPTBulkDelete.registerModule('DOMHandler', DOMHandler);
        window.ChatGPTBulkDelete.registerModule('EventHandler', EventHandler);
      } else {
        setTimeout(registerModules, 50);
      }
    };
    registerModules();
  }

} else {
  console.log("domHandler.js already loaded, skipping re-initialization");
}