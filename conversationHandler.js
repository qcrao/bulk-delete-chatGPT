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
      // The cap only limits auto-slowdown growth; never drop below the
      // user-configured base delay.
      return Math.max(
        settings.baseDelayMs,
        Math.min(
          delayConfig.MAX_INTRA_BATCH_DELAY_MS,
          Math.round(settings.baseDelayMs * multiplier)
        )
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

      return Math.max(
        settings.baseDelayMs,
        Math.min(
          delayConfig.MAX_BATCH_COOLDOWN_MS,
          Math.round(settings.baseDelayMs * multiplier)
        )
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
        const emptyResult = { processedCount: 0, skippedCount: 0, totalCount: 0 };
        ChromeUtils.sendComplete(buttonId, emptyResult);
        return emptyResult;
      }

      // Free plan: the popup passes maxPerRun; only the first N selected are processed.
      const maxPerRun = Number((window.ChatGPTBulkDeleteOperationSettings || {}).maxPerRun);
      let limitedFrom = 0;
      if (Number.isFinite(maxPerRun) && maxPerRun > 0 && selectedConversations.length > maxPerRun) {
        limitedFrom = selectedConversations.length;
        selectedConversations = selectedConversations.slice(0, maxPerRun);
      }

      // Pick up selector fixes published since the page was opened.
      await window.RemoteConfig?.refresh({ fresh: true });

      console.log(`Selected conversations for ${operation}:`, selectedConversations.length);
      ChromeUtils.sendProgress(buttonId, 0);
      
      // Send analytics event
      await APIUtils.sendEvent(EVENTS[operation.toUpperCase()], selectedConversations.length);

      let processedCount = 0;
      let skippedCount = 0;
      const failures = [];
      const delaySettings = this.getDelaySettings();
      console.log(
        `${operation} delay settings:`,
        delaySettings,
        `batch size: ${UI_CONFIG.OPERATION_DELAY.BATCH_SIZE}`
      );

      for (let i = 0; i < selectedConversations.length; i++) {
        try {
          const result = await this.processConversation(operation, selectedConversations[i]);
          if (result.ok) {
            processedCount++;
          } else {
            skippedCount++;
            failures.push({ ...result.failure, index: i + 1 });
          }
        } catch (error) {
          console.error(`Error processing conversation ${i + 1}:`, error);
          skippedCount++;
          failures.push({ stage: error.stage || "unknown", message: error.message, index: i + 1 });
        }

        // Update progress
        // Reserve 100% for a genuinely successful completion signal.
        const progress = Math.min(
          99,
          Math.round(((i + 1) / selectedConversations.length) * 100)
        );
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
      const result = {
        processedCount,
        skippedCount,
        totalCount: selectedConversations.length,
        limitedFrom
      };
      ChromeUtils.sendComplete(buttonId, result);
      if (failures.length > 0) {
        this.reportFailures(operation, result, failures);
      }
      return result;
    },

    // Fire-and-forget: tells us when ChatGPT's UI changed and broke a step.
    // Only UI labels and step names are sent, never conversation titles or ids.
    reportFailures(operation, result, failures) {
      const stageCounts = {};
      for (const failure of failures) {
        stageCounts[failure.stage] = (stageCounts[failure.stage] || 0) + 1;
      }
      const report = {
        operation,
        total: result.totalCount,
        failed: result.skippedCount,
        stageCounts,
        errors: [...new Set(failures.map((failure) => failure.message))].slice(0, 5),
        menuItems: failures.find((failure) => failure.menuItems)?.menuItems || [],
        // Which item failed, how long the step waited and what was on screen,
        // to tell a slow/unopened dialog from one the selectors don't match.
        diagnostics: failures.slice(0, 5).map((failure) => ({
          index: failure.index || null,
          stage: failure.stage,
          waitedMs: failure.waitedMs ?? null,
          menuItemCount: failure.menuItemCount ?? null,
          dialogs: failure.dialogs || []
        })),
        uiLang: document.documentElement.lang || navigator.language || null,
        uiConfigVersion: window.RemoteConfig?.version || null
      };
      try {
        chrome.runtime.sendMessage({ action: "reportFailure", report }, () => {
          void chrome.runtime.lastError;
        });
      } catch (error) {
        console.warn("Could not send failure report:", error);
      }
    },

    // Process individual conversation
    async processConversation(operation, checkbox) {
      // A dialog left open by the previous item would swallow this item's clicks.
      await this.closeLingeringDialogs();
      await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);

      const conversationElement = DOMHandler.getConversationElementFromCheckbox
        ? DOMHandler.getConversationElementFromCheckbox(checkbox)
        : checkbox.parentElement;
      const conversationRoute = DOMHandler.getConversationRoute
        ? DOMHandler.getConversationRoute(conversationElement)
        : null;
      const interactiveElement = DOMHandler.findInteractiveElement(conversationElement)
        || conversationElement;

      let stage = "menu_button";
      let menuItems = null;
      let stageStartedAt = Date.now();
      try {
        // Hover to reveal menu
        console.log(`1. Hovering over conversation...`);
        DOMHandler.dispatchHoverEvent(conversationElement);
        DOMHandler.dispatchHoverEvent(interactiveElement);
        await CommonUtils.delay(UI_CONFIG.DELAYS.MEDIUM);

        const threeDotButton = await this.waitForConversationMenuButton(
          conversationElement,
          operation === 'DELETE' ? UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT : UI_CONFIG.TIMEOUTS.ELEMENT_WAIT
        );

        stage = "operation_button";
        stageStartedAt = Date.now();
        const operationButton = await this.openConversationMenu(
          threeDotButton,
          operation
        );
        if (!operationButton) {
          menuItems = this.logVisibleMenuItems();
          throw new Error(`${operation} button not found`);
        }

        await CommonUtils.delay(UI_CONFIG.DELAYS.MEDIUM);
        console.log(`3. Clicking ${operation.toLowerCase()} button...`);
        if (threeDotButton.id.startsWith("--native-popover-")) {
          operationButton.click();
        } else {
          DOMHandler.dispatchClickSequence(operationButton);
        }

        if (operation === 'DELETE') {
          // ChatGPT can leave the previous dialog's button in the DOM, so only
          // the visible confirm button belongs to this conversation.
          stage = "confirm_dialog";
          stageStartedAt = Date.now();
          const confirmButton = await this.waitForVisibleConfirmButton();
          if (!confirmButton) {
            throw new Error("Delete confirmation dialog did not appear");
          }
          await CommonUtils.delay(UI_CONFIG.DELAYS.MEDIUM);
          console.log(`4. Clicking confirm button...`);
          DOMHandler.dispatchClickSequence(confirmButton);
          stage = "dialog_close";
          stageStartedAt = Date.now();
          const closed = await this.waitForElementHidden(
            confirmButton,
            UI_CONFIG.TIMEOUTS.CONFIRM_DIALOG_CLOSE
          );
          if (!closed) {
            throw new Error("Delete confirmation dialog did not close");
          }
        } else {
          await CommonUtils.delay(UI_CONFIG.DELAYS.EXTENDED);
        }

        stageStartedAt = Date.now();
        if (await this.verifyConversationOperation(operation, conversationRoute)) {
          return { ok: true };
        }
        const snapshot = this.captureFailureSnapshot(stageStartedAt);
        return {
          ok: false,
          failure: conversationRoute
            ? { stage: "not_removed", message: "Conversation still listed after the operation", ...snapshot }
            : { stage: "no_route", message: "Could not read the conversation link to verify the result", ...snapshot }
        };
      } catch (error) {
        // Before verifying and closing dialogs, which change what is on screen.
        const snapshot = this.captureFailureSnapshot(stageStartedAt);
        const succeeded = await this.verifyConversationOperation(operation, conversationRoute);
        await this.closeLingeringDialogs();
        if (succeeded) {
          console.log(
            `${operation} succeeded despite an interrupted DOM interaction:`,
            conversationRoute
          );
          return { ok: true };
        }

        console.log(`Could not complete ${operation.toLowerCase()} process:`, error);
        return { ok: false, failure: { stage, message: error.message, menuItems, ...snapshot } };
      }
    },

    // What the page showed when a step failed. Only structure and button
    // labels of open dialogs, never conversation titles or ids.
    captureFailureSnapshot(stageStartedAt) {
      const snapshot = { waitedMs: Date.now() - stageStartedAt };
      try {
        const clip = (value, max) => String(value || "").trim().slice(0, max) || null;
        snapshot.menuItemCount = Array.from(
          document.querySelectorAll(UI_CONFIG.SELECTORS.MENU_ITEM)
        ).filter((item) => CommonUtils.isElementVisible(item)).length;
        snapshot.dialogs = Array.from(
          document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
        )
          .filter((dialog) => CommonUtils.isElementVisible(dialog))
          .slice(-3)
          .map((dialog) => ({
            role: dialog.getAttribute("role"),
            state: dialog.getAttribute("data-state"),
            testId: clip(dialog.dataset.testid, 60),
            buttons: Array.from(dialog.querySelectorAll("button"))
              .slice(0, 6)
              .map((button) => ({
                text: clip(button.textContent, 30),
                testId: clip(button.dataset.testid, 60),
                type: button.getAttribute("type"),
                cls: clip(button.getAttribute("class"), 160),
                visible: CommonUtils.isElementVisible(button)
              }))
          }));
      } catch (error) {
        console.warn("Could not capture failure snapshot:", error);
      }
      return snapshot;
    },

    findVisibleConfirmButton() {
      const visible = Array.from(
        document.querySelectorAll(UI_CONFIG.SELECTORS.confirmDeleteButton)
      ).filter((button) => CommonUtils.isElementVisible(button));
      // The newest dialog is rendered last.
      return visible[visible.length - 1] || null;
    },

    async waitForVisibleConfirmButton(timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeout) {
        const button = this.findVisibleConfirmButton();
        if (button) return button;
        await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);
      }
      return null;
    },

    async waitForElementHidden(element, timeout) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeout) {
        if (!element.isConnected || !CommonUtils.isElementVisible(element)) {
          return true;
        }
        await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);
      }
      return false;
    },

    // Waits for a still-open confirm dialog to finish, then dismisses it if it
    // stays open (Escape, then its first non-confirm button, i.e. Cancel / X).
    async closeLingeringDialogs() {
      const button = this.findVisibleConfirmButton();
      const dialog = button?.closest('[role="dialog"]');
      if (!dialog) {
        await this.escapeUnrecognizedDialog();
        return;
      }

      if (await this.waitForElementHidden(button, UI_CONFIG.TIMEOUTS.ELEMENT_WAIT)) return;

      console.log("Closing a delete dialog that is still open...");
      DOMHandler.dispatchEscapeKey(dialog);
      if (await this.waitForElementHidden(button, UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT)) return;

      const dismiss = Array.from(dialog.querySelectorAll("button")).find(
        (candidate) => candidate !== button && CommonUtils.isElementVisible(candidate)
      );
      if (dismiss) {
        DOMHandler.dispatchClickSequence(dismiss);
        await this.waitForElementHidden(button, UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT);
      }
    },

    // The confirm selector no longer matches (ChatGPT changed the dialog), so
    // the dialog can't be found through its button. Only press Escape: clicking
    // an unrecognized button could be the destructive one.
    async escapeUnrecognizedDialog() {
      const dialog = Array.from(
        document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
      ).filter((candidate) => CommonUtils.isElementVisible(candidate)).pop();
      if (!dialog) return;

      console.log("Closing an open dialog the extension does not recognize...");
      DOMHandler.dispatchEscapeKey(dialog);
      await this.waitForElementHidden(dialog, UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT);
    },

    async verifyConversationOperation(operation, conversationRoute) {
      if (!conversationRoute) {
        return operation !== "DELETE";
      }

      const startedAt = Date.now();
      while (Date.now() - startedAt < UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
        if (!DOMHandler.isConversationRoutePresent(conversationRoute)) {
          return true;
        }
        await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);
      }

      return false;
    },

    async openConversationMenu(menuButton, operation) {
      console.log(`2. Opening three-dot menu with pointerdown...`);
      DOMHandler.dispatchPointerDownEvent(menuButton);

      let operationButton = await this.waitForOperationButton(
        operation,
        document,
        UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT
      );
      if (operationButton) {
        return operationButton;
      }

      console.log(`2b. Pointerdown did not open menu, retrying with keyboard...`);
      DOMHandler.dispatchEnterKey(menuButton);
      operationButton = await this.waitForOperationButton(
        operation,
        document,
        UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT
      );
      if (operationButton) {
        return operationButton;
      }

      console.log(`2c. Keyboard did not open menu, retrying with click sequence...`);
      DOMHandler.dispatchClickSequence(menuButton);
      await CommonUtils.delay(UI_CONFIG.DELAYS.LONG);
      operationButton = await this.waitForOperationButton(operation);
      return operationButton;
    },

    logVisibleMenuItems() {
      const menuItems = Array.from(
        document.querySelectorAll(UI_CONFIG.SELECTORS.MENU_ITEM)
      ).filter((item) => CommonUtils.isElementVisible(item));

      console.log(
        "Visible menu items after opening conversation menu:",
        menuItems.map((item) => ({
          text: item.textContent.trim(),
          testId: item.dataset.testid || null,
          role: item.getAttribute("role")
        }))
      );
      return menuItems.map((item) => ({
        text: item.textContent.trim().slice(0, 60),
        testId: item.dataset.testid || null,
        role: item.getAttribute("role")
      }));
    },

    async waitForConversationMenuButton(conversationElement, timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeout) {
        const menuButton = DOMHandler.findConversationMenuButton
          ? DOMHandler.findConversationMenuButton(conversationElement)
          : conversationElement.querySelector(UI_CONFIG.SELECTORS.threeDotButton);

        if (menuButton) {
          return menuButton;
        }

        await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);
      }

      throw new Error(`Conversation menu button not found within ${timeout}ms`);
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
