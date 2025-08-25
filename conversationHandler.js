if (typeof window.conversationHandlerLoaded === "undefined") {
  console.log("conversationHandler.js loaded");

  window.conversationHandlerLoaded = true;

  // Conversation operation handler
  const ConversationHandler = {
    // Base conversation operation
    async performOperation(operation, selectedConversations, buttonId) {
      if (selectedConversations.length === 0) {
        console.log(`No conversations to ${operation.toLowerCase()}.`);
        CommonUtils.removeAllCheckboxes();
        ChromeUtils.sendComplete(buttonId);
        return;
      }

      console.log(`Selected conversations for ${operation}:`, selectedConversations.length);
      
      // Send analytics event
      await APIUtils.sendEvent(EVENTS[operation.toUpperCase()], selectedConversations.length);

      let processedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < selectedConversations.length; i++) {
        try {
          const result = await this.processConversation(operation, selectedConversations[i]);
          if (result) {
            processedCount++;
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`Error processing conversation ${i + 1}:`, error);
          skippedCount++;
        }

        // Update progress
        const progress = Math.round(((i + 1) / selectedConversations.length) * 100);
        ChromeUtils.sendProgress(buttonId, progress);
      }

      console.log(`${operation} completed: ${processedCount} processed, ${skippedCount} skipped`);
      ChromeUtils.sendComplete(buttonId);
    },

    // Process individual conversation
    async processConversation(operation, checkbox) {
      await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);

      const conversationElement = checkbox.parentElement;
      const interactiveElement = DOMHandler.findInteractiveElement(conversationElement);
      
      if (!interactiveElement) {
        const title = DOMHandler.getConversationTitle(conversationElement);
        const message = `Unable to ${operation.toLowerCase()} the conversation: "${title}".`; 
        CommonUtils.showNotification(message, 'error');
        return false;
      }

      try {
        // Hover to reveal menu
        console.log(`1. Hovering over conversation...`);
        DOMHandler.dispatchHoverEvent(interactiveElement);
        await CommonUtils.delay(UI_CONFIG.DELAYS.MEDIUM);

        // Find and click three-dot button
        const threeDotButton = await CommonUtils.waitForElement(
          UI_CONFIG.SELECTORS.threeDotButton,
          conversationElement.parentElement,
          operation === 'DELETE' ? UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT : UI_CONFIG.TIMEOUTS.ELEMENT_WAIT
        );

        console.log(`2. Clicking three-dot button...`);
        DOMHandler.dispatchPointerDownEvent(threeDotButton);
        await CommonUtils.delay(UI_CONFIG.DELAYS.LONG);

        // Find and click operation button
        const operationButton = await this.waitForOperationButton(operation);
        if (!operationButton) {
          throw new Error(`${operation} button not found`);
        }

        console.log(`3. Clicking ${operation.toLowerCase()} button...`);
        operationButton.click();

        if (operation === 'DELETE') {
          // Wait for confirmation and click
          const confirmButton = await CommonUtils.waitForElement(UI_CONFIG.SELECTORS.confirmDeleteButton);
          if (confirmButton) {
            console.log(`4. Clicking confirm button...`);
            confirmButton.click();
            await CommonUtils.waitForElementToDisappear(UI_CONFIG.SELECTORS.confirmDeleteButton);
          }
        } else {
          await CommonUtils.delay(UI_CONFIG.DELAYS.EXTENDED);
        }

        return true;
      } catch (error) {
        console.log(`Could not complete ${operation.toLowerCase()} process:`, error);
        return false;
      }
    },

    // Wait for operation-specific button using improved strategies
    async waitForOperationButton(operation, parent = document, timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
      try {
        // Try strategy-based approach first (language-independent)
        return await CommonUtils.waitForElementByStrategy(operation, parent, timeout);
      } catch (error) {
        console.warn(`Strategy-based approach failed for ${operation}:`, error);
        
        // Fallback to legacy text-based approach
        const selector = UI_CONFIG.SELECTORS.MENU_ITEM;
        let textOptions;

        if (operation === 'DELETE') {
          textOptions = [UI_CONFIG.STRINGS.DELETE];
        } else if (operation === 'ARCHIVE') {
          textOptions = [
            UI_CONFIG.STRINGS.ARCHIVE,
            UI_CONFIG.STRINGS.ARCHIVE_CN,
            UI_CONFIG.STRINGS.ARCHIVE_TW
          ];
        }

        console.log(`Falling back to text-based approach for ${operation}`);
        return await CommonUtils.waitForElementByText(selector, textOptions, parent, timeout);
      }
    }
  };

  // Export to global scope
  window.ConversationHandler = ConversationHandler;

} else {
  console.log("conversationHandler.js already loaded, skipping re-initialization");
}