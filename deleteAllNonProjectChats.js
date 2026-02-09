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

  utils.log('log', 'DeleteAllNonProjectChats script loaded');

  /**
   * Add checkboxes to all visible conversations
   */
  function addCheckboxes() {
    return new Promise((resolve) => {
      const history = utils.safeQuery(UI_CONFIG.SELECTORS.HISTORY);
      if (!history) {
        utils.log('log', 'History container not found');
        resolve(0);
        return;
      }

      const CheckboxManager = core.getModule('CheckboxManager');
      const DOMHandler = core.getModule('DOMHandler');
      const EventHandler = core.getModule('EventHandler');

      if (!CheckboxManager || !DOMHandler) {
        utils.log('error', 'Required modules not available');
        resolve(0);
        return;
      }

      const conversations = DOMHandler.getAllConversations();
      utils.log('log', `Found ${conversations.length} conversations`);

      if (conversations.length === 0) {
        resolve(0);
        return;
      }

      let processedCount = 0;
      conversations.forEach((conversation, index) => {
        try {
          CheckboxManager.addCheckboxToConversation(conversation, index);
          CheckboxManager.setupConversationInteraction(conversation);
          processedCount++;
        } catch (error) {
          utils.log('error', `Failed to process conversation ${index}:`, error);
        }
      });

      if (EventHandler && EventHandler.addKeyboardListeners) {
        try {
          EventHandler.addKeyboardListeners();
        } catch (error) {
          // Ignore if already added
        }
      }

      resolve(processedCount);
    });
  }

  /**
   * Select all checkboxes
   */
  function selectAllCheckboxes() {
    const checkboxes = document.querySelectorAll(`.${CSS_CLASSES.CHECKBOX}`);
    let selectedCount = 0;
    checkboxes.forEach(checkbox => {
      if (!checkbox.checked) {
        checkbox.checked = true;
        selectedCount++;
      }
    });
    utils.log('log', `Selected ${selectedCount} checkboxes`);
    return checkboxes.length;
  }

  /**
   * Delete all selected conversations
   */
  async function deleteSelectedConversations() {
    const ConversationHandler = core.getModule('ConversationHandler');
    const CommonUtils = core.getModule('CommonUtils');

    if (!ConversationHandler) {
      throw new Error('ConversationHandler module not available');
    }

    const selectedConversations = CommonUtils.getSelectedConversations();

    if (!selectedConversations || selectedConversations.length === 0) {
      utils.log('log', 'No conversations selected for deletion');
      return 0;
    }

    utils.log('log', `Deleting ${selectedConversations.length} conversations`);

    // Perform deletion without sending progress to popup (we handle our own progress)
    let processedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < selectedConversations.length; i++) {
      // Check for cancellation
      if (state.isCancelled) {
        utils.log('log', 'Deletion cancelled mid-batch');
        break;
      }

      try {
        const result = await ConversationHandler.processConversation('DELETE', selectedConversations[i]);
        if (result) {
          processedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        utils.log('error', `Error processing conversation ${i + 1}:`, error);
        skippedCount++;
      }

      // Update progress
      const progress = Math.round(((i + 1) / selectedConversations.length) * 100);
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

          // Step 1: Add checkboxes
          const conversationCount = await addCheckboxes();

          if (checkCancelled()) break;

          if (conversationCount === 0) {
            utils.log('log', 'No conversations found, polling for new chats...');

            // Poll every second, up to 10 times
            const hasMore = await waitForNewConversations(10);

            if (!hasMore || checkCancelled()) {
              if (!state.isCancelled) {
                utils.log('log', 'No more conversations after polling. Operation complete!');
              }
              break;
            }

            // New conversations loaded, continue loop
            utils.log('log', 'New conversations detected, continuing...');
            continue;
          }

          // Step 2: Select all checkboxes
          selectAllCheckboxes();

          if (checkCancelled()) break;

          // Step 3: Delete selected conversations
          const deletedCount = await deleteSelectedConversations();
          totalDeleted += deletedCount;

          if (checkCancelled()) break;

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

        if (iteration >= maxIterations) {
          utils.log('log', `Reached maximum iterations (${maxIterations}). Stopping.`);
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
