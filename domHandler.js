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
      if (titleElement) {
        return titleElement.textContent.trim();
      }

      const conversationLink = conversationElement.matches(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR)
        ? conversationElement
        : conversationElement.querySelector(
          UI_CONFIG.SELECTORS.PROJECT_CONVERSATION_LINK_SELECTOR
        );
      if (conversationLink) {
        return conversationLink.textContent.trim();
      }

      return conversationElement.textContent.trim() || "this conversation";
    },

    // Find interactive element in conversation
    findInteractiveElement(conversationElement) {
      return conversationElement.querySelector(UI_CONFIG.SELECTORS.INTERACTIVE_ELEMENT_SELECTOR);
    },

    getConversationElementFromCheckbox(checkbox) {
      return checkbox.closest('[data-bulk-delete-conversation-owner="true"]')
        || checkbox.parentElement;
    },

    getConversationLink(conversationElement) {
      if (!conversationElement) {
        return null;
      }

      return conversationElement.matches(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR)
        ? conversationElement
        : conversationElement.querySelector(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR);
    },

    getConversationRoute(conversationElement) {
      const link = this.getConversationLink(conversationElement);
      if (!link) {
        return null;
      }

      try {
        return new URL(link.href, window.location.href).pathname;
      } catch (error) {
        return null;
      }
    },

    isConversationRoutePresent(route) {
      if (!route) {
        return false;
      }

      return Array.from(
        document.querySelectorAll(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR)
      ).some((link) => {
        try {
          return new URL(link.href, window.location.href).pathname === route;
        } catch (error) {
          return false;
        }
      });
    },

    isConversationLink(link) {
      if (!link || !link.matches(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR)) {
        return false;
      }

      try {
        const url = new URL(link.href, window.location.href);
        return url.origin === window.location.origin
          && /\/c\/[^/]+\/?$/.test(url.pathname);
      } catch (error) {
        return false;
      }
    },

    isVisibleConversationLink(link) {
      return link.getClientRects().length > 0;
    },

    findConversationOwner(link) {
      const menuSelector = UI_CONFIG.SELECTORS.CONVERSATION_MENU_BUTTON
        || UI_CONFIG.SELECTORS.threeDotButton;
      let candidate = link;
      let depth = 0;

      while (candidate && candidate !== document.body && depth < 6) {
        const conversationLinks = candidate.querySelectorAll(
          UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR
        );
        if (
          candidate.querySelector(menuSelector)
          && conversationLinks.length === 1
        ) {
          return candidate;
        }

        if (candidate.matches(UI_CONFIG.SELECTORS.PROJECT_CONVERSATION_SELECTOR)) {
          return candidate;
        }

        candidate = candidate.parentElement;
        depth++;
      }

      return link;
    },

    findConversationMenuButton(conversationElement) {
      const selector = UI_CONFIG.SELECTORS.CONVERSATION_MENU_BUTTON
        || UI_CONFIG.SELECTORS.threeDotButton;
      const directButton = conversationElement.querySelector(selector);
      if (directButton) {
        return directButton;
      }

      const conversationRect = conversationElement.getBoundingClientRect();
      let parent = conversationElement.parentElement;
      let depth = 0;

      while (parent && parent !== document.body && depth < 4) {
        const alignedCandidates = Array.from(parent.querySelectorAll(selector))
          .map((button) => {
            const rect = button.getBoundingClientRect();
            const overlapsVertically =
              rect.bottom >= conversationRect.top &&
              rect.top <= conversationRect.bottom;
            const centerDistance = Math.abs(
              (rect.top + rect.bottom) / 2 -
              (conversationRect.top + conversationRect.bottom) / 2
            );

            return { button, overlapsVertically, centerDistance };
          })
          .filter((candidate) => candidate.overlapsVertically)
          .sort((a, b) => a.centerDistance - b.centerDistance);

        if (alignedCandidates[0]) {
          return alignedCandidates[0].button;
        }

        parent = parent.parentElement;
        depth++;
      }

      return null;
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

    dispatchClickSequence(element) {
      const eventTypes = [
        "pointerover",
        "mouseover",
        "mousedown",
        "pointerdown",
        "mouseup",
        "pointerup",
        "click"
      ];

      eventTypes.forEach((type) => {
        element.dispatchEvent(new MouseEvent(type, {
          view: window,
          bubbles: true,
          cancelable: true,
          button: 0
        }));
      });
    },

    dispatchEnterKey(element) {
      element.focus();
      const eventOptions = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      };
      element.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
      element.dispatchEvent(new KeyboardEvent("keyup", eventOptions));
    },

    // Get all conversations from history
    getHistoryConversations() {
      const history = document.querySelector(UI_CONFIG.SELECTORS.HISTORY);
      const scope = history || document;
      return Array.from(
        scope.querySelectorAll(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR)
      ).filter((link) =>
        this.isConversationLink(link) && this.isVisibleConversationLink(link)
      );
    },

    getProjectConversations() {
      return Array.from(
        document.querySelectorAll(UI_CONFIG.SELECTORS.PROJECT_CONVERSATION_SELECTOR)
      ).filter((conversation) =>
        conversation.querySelector(UI_CONFIG.SELECTORS.PROJECT_CONVERSATION_LINK_SELECTOR)
      );
    },

    getAllConversations() {
      const links = Array.from(
        document.querySelectorAll(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR)
      ).filter((link) =>
        this.isConversationLink(link) && this.isVisibleConversationLink(link)
      );
      const seenConversations = new Set();

      return links.reduce((conversations, link) => {
        const conversation = this.findConversationOwner(link);
        if (seenConversations.has(conversation)) {
          return conversations;
        }

        seenConversations.add(conversation);
        conversations.push(conversation);
        return conversations;
      }, []);
    },

    // Toggle conversation link interaction
    toggleConversationInteraction(conversation, disable = true) {
      if (conversation.matches("a")) {
        // Sidebar conversations are anchors themselves. Disabling pointer
        // events on the host anchor also blocks the injected checkbox.
        conversation.style.pointerEvents = "auto";
        conversation.style.cursor = disable ? "pointer" : "";
        return;
      }

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
