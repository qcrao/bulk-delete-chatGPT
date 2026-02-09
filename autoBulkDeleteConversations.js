/**
 * ChatGPT Bulk Delete - Delete All Non-Project Chats
 *
 * This script automatically deletes ALL chats that are not in projects.
 * It repeats the process until no more non-project chats remain.
 * Can be cancelled by clicking the button again.
 */

(function() {
  'use strict';

  // Wait for core system to be ready
  if (!window.ChatGPTBulkDelete || !window.ChatGPTBulkDelete.initialized) {
    console.error('[DeleteAllNonProject] Core system not ready, deferring execution');
    setTimeout(arguments.callee, 50);
    return;
  }

  const core = window.ChatGPTBulkDelete;
  const utils = core.utils;

  // Global cancellation flag
  window.DeleteAllNonProjectState = window.DeleteAllNonProjectState || {
    isRunning: false,
    isCancelled: false
  };

  const state = window.DeleteAllNonProjectState;

  // If already running, cancel it
  if (state.isRunning) {
    utils.log('log', 'Cancel requested by user');
    state.isCancelled = true;
    // Reset button immediately
    chrome.runtime.sendMessage({
      action: "resetButton",
      buttonId: BUTTON_IDS.BULK_DELETE_ALL
    });
    return;
  }

  utils.log('log', 'AutoBulkDeleteConversations script loaded');

  /**
   * Get all visible non-project conversations
   */
  function getVisibleConversations() {
    const history = utils.safeQuery(UI_CONFIG.SELECTORS.HISTORY);
    if (!history) {
      return [];
    }
    return Array.from(history.querySelectorAll(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR));
  }

  /**
   * Delete a single conversation by interacting with ChatGPT's UI
   */
  async function deleteConversation(conversationElement) {
    const DOMHandler = core.getModule('DOMHandler');
    const CommonUtils = core.getModule('CommonUtils');
    const ConversationHandler = core.getModule('ConversationHandler');

    const interactiveElement = DOMHandler.findInteractiveElement(conversationElement);
    if (!interactiveElement) {
      const title = DOMHandler.getConversationTitle(conversationElement);
      utils.log('error', `Unable to delete conversation: "${title}"`);
      return false;
    }

    try {
      await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);

      // Hover to reveal menu
      DOMHandler.dispatchHoverEvent(interactiveElement);
      await CommonUtils.delay(UI_CONFIG.DELAYS.MEDIUM);

      // Find and click three-dot button
      const threeDotButton = await CommonUtils.waitForElement(
        UI_CONFIG.SELECTORS.threeDotButton,
        conversationElement.parentElement,
        UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT
      );

      DOMHandler.dispatchPointerDownEvent(threeDotButton);
      await CommonUtils.delay(UI_CONFIG.DELAYS.LONG);

      // Find and click delete button
      const deleteButton = await ConversationHandler.waitForOperationButton('DELETE');
      if (!deleteButton) {
        throw new Error('Delete button not found');
      }
      deleteButton.click();

      // Wait for confirmation and click
      const confirmButton = await CommonUtils.waitForElement(UI_CONFIG.SELECTORS.confirmDeleteButton);
      if (confirmButton) {
        confirmButton.click();
        await CommonUtils.waitForElementToDisappear(UI_CONFIG.SELECTORS.confirmDeleteButton);
      }

      return true;
    } catch (error) {
      utils.log('error', `Could not complete delete process:`, error);
      return false;
    }
  }

  /**
   * Delete all visible conversations in a batch
   */
  async function deleteVisibleConversations() {
    const conversations = getVisibleConversations();

    if (conversations.length === 0) {
      return 0;
    }

    utils.log('log', `Deleting ${conversations.length} conversations`);

    let processedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < conversations.length; i++) {
      if (state.isCancelled) {
        utils.log('log', 'Deletion cancelled mid-batch');
        break;
      }

      const result = await deleteConversation(conversations[i]);
      if (result) {
        processedCount++;
      } else {
        skippedCount++;
      }

      const progress = Math.round(((i + 1) / conversations.length) * 100);
      ChromeUtils.sendProgress(BUTTON_IDS.BULK_DELETE_ALL, progress);
    }

    utils.log('log', `Deletion batch completed: ${processedCount} deleted, ${skippedCount} skipped`);
    return processedCount;
  }

  /**
   * Check if there are any conversations left
   */
  function hasConversationsLeft() {
    const history = utils.safeQuery(UI_CONFIG.SELECTORS.HISTORY);
    if (!history) {
      return false;
    }
    const conversations = history.querySelectorAll(UI_CONFIG.SELECTORS.CONVERSATION_SELECTOR);
    return conversations.length > 0;
  }

  /**
   * Wait for new conversations to load, polling every second
   * Also checks for cancellation
   */
  function waitForNewConversations(maxChecks = 10) {
    return new Promise((resolve) => {
      let checkCount = 0;

      const check = () => {
        // Check for cancellation
        if (state.isCancelled) {
          resolve(false);
          return;
        }

        checkCount++;
        utils.log('log', `Polling for new chats... (${checkCount}/${maxChecks})`);

        if (hasConversationsLeft()) {
          resolve(true);
        } else if (checkCount >= maxChecks) {
          resolve(false);
        } else {
          setTimeout(check, 1000); // Poll every second
        }
      };

      // Start checking after 1 second
      setTimeout(check, 1000);
    });
  }

  /**
   * Check if operation was cancelled
   */
  function checkCancelled() {
    if (state.isCancelled) {
      utils.log('log', 'Operation cancelled by user');
      return true;
    }
    return false;
  }

  /**
   * Update button text via Chrome messaging
   */
  function updateButtonText(text) {
    chrome.runtime.sendMessage({
      action: "updateButtonText",
      buttonId: BUTTON_IDS.BULK_DELETE_ALL,
      text: text
    });
  }

  /**
   * Main function: Delete all non-project chats repeatedly
   */
  async function deleteAllNonProjectChats() {
    return core.executeOperation('deleteAllNonProject', async () => {
      // Set running state
      state.isRunning = true;
      state.isCancelled = false;

      utils.log('log', 'Starting Delete All Non-Project Chats operation');
      updateButtonText('Deleting... (click to cancel)');

      let totalDeleted = 0;
      let iteration = 0;

      try {
        while (true) {
          // Check for cancellation
          if (checkCancelled()) {
            break;
          }

          iteration++;
          utils.log('log', `--- Iteration ${iteration} ---`);

          // Step 1: Find and delete visible conversations
          const conversations = getVisibleConversations();

          if (checkCancelled()) break;

          if (conversations.length === 0) {
            utils.log('log', 'No conversations found, polling for new chats...');

            const hasMore = await waitForNewConversations(10);

            if (!hasMore || checkCancelled()) {
              if (!state.isCancelled) {
                utils.log('log', 'No more conversations after polling. Operation complete!');
              }
              break;
            }

            utils.log('log', 'New conversations detected, continuing...');
            continue;
          }

          // Step 2: Delete all visible conversations
          const deletedCount = await deleteVisibleConversations();
          totalDeleted += deletedCount;

          if (checkCancelled()) break;

          // If no conversations were deleted, stop to avoid infinite loop
          if (deletedCount === 0) {
            utils.log('log', 'No conversations could be deleted. Stopping.');
            break;
          }

          utils.log('log', `Iteration ${iteration} complete. Deleted ${deletedCount} chats. Total: ${totalDeleted}`);

          // After deletion, poll for new chats
          utils.log('log', 'Batch complete, polling for new chats...');
          const hasMore = await waitForNewConversations(10);

          if (!hasMore || checkCancelled()) {
            if (!state.isCancelled) {
              utils.log('log', 'No more conversations after polling. Operation complete!');
            }
            break;
          }

          utils.log('log', 'New conversations detected, starting next batch...');
        }

      } finally {
        // Always reset state
        state.isRunning = false;
        state.isCancelled = false;
      }

      const wasCancelled = state.isCancelled;
      utils.log('log', `=== Operation ${wasCancelled ? 'Cancelled' : 'Complete'} ===`);
      utils.log('log', `Total chats deleted: ${totalDeleted}`);
      utils.log('log', `Iterations: ${iteration}`);

      // Send completion signal
      ChromeUtils.sendComplete(BUTTON_IDS.BULK_DELETE_ALL);

      return { success: !wasCancelled, totalDeleted, iterations: iteration, cancelled: wasCancelled };
    });
  }

  // Execute the operation
  (async () => {
    try {
      await deleteAllNonProjectChats();
    } catch (error) {
      utils.log('error', 'Failed to execute deleteAllNonProjectChats:', error);

      const CommonUtils = core.getModule('CommonUtils');
      if (CommonUtils && CommonUtils.showNotification) {
        CommonUtils.showNotification(`Delete all failed: ${error.message}`, 'error');
      }

      // Send completion signal even on error
      ChromeUtils.sendComplete(BUTTON_IDS.BULK_DELETE_ALL);
    }
  })();

})();
