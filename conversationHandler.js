if (typeof window.conversationHandlerLoaded === "undefined") {
  console.log("conversationHandler.js loaded");

  window.conversationHandlerLoaded = true;

  // Conversation operation handler
  const ConversationHandler = {
    getDelaySettings() {
      const delayConfig = UI_CONFIG.OPERATION_DELAY;
      const operationSettings = window.ChatGPTBulkDeleteOperationSettings || {};
      const rawBaseDelay = Number(operationSettings.baseDelayMs);
      const baseDelayMs = Math.min(
        delayConfig.MAX_BASE_DELAY_MS,
        Math.max(
          delayConfig.MIN_BASE_DELAY_MS,
          Number.isFinite(rawBaseDelay)
            ? rawBaseDelay
            : delayConfig.DEFAULT_BASE_DELAY_MS
        )
      );

      return {
        baseDelayMs: Math.round(baseDelayMs),
        autoSlowdown:
          typeof operationSettings.autoSlowdown === "boolean"
            ? operationSettings.autoSlowdown
            : delayConfig.DEFAULT_AUTO_SLOWDOWN
      };
    },

    getIntraBatchDelay(settings, batchIndex) {
      if (!settings.autoSlowdown) {
        return settings.baseDelayMs;
      }

      const delayConfig = UI_CONFIG.OPERATION_DELAY;
      const multiplier = 1 + batchIndex * delayConfig.INTRA_BATCH_GROWTH;
      return Math.min(
        delayConfig.MAX_INTRA_BATCH_DELAY_MS,
        Math.round(settings.baseDelayMs * multiplier)
      );
    },

    getBatchCooldownDelay(settings, completedBatchIndex) {
      if (!settings.autoSlowdown) {
        return settings.baseDelayMs;
      }

      const delayConfig = UI_CONFIG.OPERATION_DELAY;
      const multiplier =
        delayConfig.BATCH_COOLDOWN_BASE_MULTIPLIER +
        completedBatchIndex * delayConfig.BATCH_COOLDOWN_GROWTH_MULTIPLIER;

      return Math.min(
        delayConfig.MAX_BATCH_COOLDOWN_MS,
        Math.round(settings.baseDelayMs * multiplier)
      );
    },

    getDelayAfterConversation(settings, currentIndex, totalCount) {
      if (currentIndex >= totalCount - 1) {
        return 0;
      }

      const delayConfig = UI_CONFIG.OPERATION_DELAY;
      const currentBatchIndex = Math.floor(currentIndex / delayConfig.BATCH_SIZE);
      const nextIndex = currentIndex + 1;
      const startsNextBatch = nextIndex % delayConfig.BATCH_SIZE === 0;

      if (startsNextBatch) {
        return this.getBatchCooldownDelay(settings, currentBatchIndex);
      }

      return this.getIntraBatchDelay(settings, currentBatchIndex);
    },

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
      const delaySettings = this.getDelaySettings();
      console.log(
        `${operation} delay settings:`,
        delaySettings,
        `batch size: ${UI_CONFIG.OPERATION_DELAY.BATCH_SIZE}`
      );

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

        // Throttle between operations to avoid ChatGPT rate limiting.
        // Skip the wait after the final item.
        const delayAfterConversation = this.getDelayAfterConversation(
          delaySettings,
          i,
          selectedConversations.length
        );
        if (delayAfterConversation > 0) {
          await CommonUtils.delay(delayAfterConversation);
        }
      }

      console.log(`${operation} completed: ${processedCount} processed, ${skippedCount} skipped`);
      ChromeUtils.sendComplete(buttonId);
    },

    // Process individual conversation
    async processConversation(operation, checkbox) {
      await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);

      // checkbox.parentElement is now the conversation <a> directly
      // (we no longer wrap children in a custom flex container).
      const conversationElement = checkbox.parentElement;
      const interactiveElement = DOMHandler.findInteractiveElement(conversationElement)
        || conversationElement;

      try {
        // Hover to reveal menu
        console.log(`1. Hovering over conversation...`);
        DOMHandler.dispatchHoverEvent(interactiveElement);
        await CommonUtils.delay(UI_CONFIG.DELAYS.MEDIUM);

        // Find and click three-dot button. Search inside the conversation
        // first; fall back to its parent in case ChatGPT renders the trigger
        // as a sibling element.
        const searchRoot = conversationElement.parentElement || conversationElement;
        const threeDotButton = await CommonUtils.waitForElement(
          UI_CONFIG.SELECTORS.threeDotButton,
          searchRoot,
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
          textOptions = [
            UI_CONFIG.STRINGS.DELETE,
            UI_CONFIG.STRINGS.DELETE_CN,
            UI_CONFIG.STRINGS.DELETE_TW,
            UI_CONFIG.STRINGS.DELETE_JP,
            UI_CONFIG.STRINGS.DELETE_KR,
            UI_CONFIG.STRINGS.DELETE_DE,
            UI_CONFIG.STRINGS.DELETE_FR,
            UI_CONFIG.STRINGS.DELETE_ES,
            UI_CONFIG.STRINGS.DELETE_PT,
            UI_CONFIG.STRINGS.DELETE_IT,
            UI_CONFIG.STRINGS.DELETE_RU
          ];
        } else if (operation === 'ARCHIVE') {
          textOptions = [
            UI_CONFIG.STRINGS.ARCHIVE,
            UI_CONFIG.STRINGS.ARCHIVE_CN,
            UI_CONFIG.STRINGS.ARCHIVE_TW,
            UI_CONFIG.STRINGS.ARCHIVE_JP,
            UI_CONFIG.STRINGS.ARCHIVE_KR,
            UI_CONFIG.STRINGS.ARCHIVE_DE,
            UI_CONFIG.STRINGS.ARCHIVE_FR,
            UI_CONFIG.STRINGS.ARCHIVE_ES,
            UI_CONFIG.STRINGS.ARCHIVE_PT,
            UI_CONFIG.STRINGS.ARCHIVE_IT,
            UI_CONFIG.STRINGS.ARCHIVE_RU
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
