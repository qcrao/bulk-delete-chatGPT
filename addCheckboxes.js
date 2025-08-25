/**
 * ChatGPT Bulk Delete - Add Checkboxes Operation
 * 
 * This script adds checkboxes to all visible conversation items.
 * It uses the CheckboxManager module for the actual implementation.
 */

(function() {
  'use strict';

  // Wait for core system to be ready
  if (!window.ChatGPTBulkDelete || !window.ChatGPTBulkDelete.initialized) {
    console.error('[AddCheckboxes] Core system not ready, deferring execution');
    setTimeout(arguments.callee, 50);
    return;
  }

  const core = window.ChatGPTBulkDelete;
  const utils = core.utils;

  utils.debug('AddCheckboxes script loaded');

  /**
   * Main function to add checkboxes to conversations
   */
  function addCheckboxesToConversations() {
    return core.executeOperation('addCheckboxes', () => {
      utils.log('log', 'Starting checkbox addition operation');
      
      // Check if history container exists
      const history = utils.safeQuery(UI_CONFIG.SELECTORS.HISTORY);
      if (!history) {
        utils.log('log', 'History container not found, unable to add checkboxes');
        return { success: false, reason: 'No history container found' };
      }

      // Get required modules
      const CheckboxManager = core.getModule('CheckboxManager');
      const DOMHandler = core.getModule('DOMHandler');
      const EventHandler = core.getModule('EventHandler');

      if (!CheckboxManager) {
        throw new Error('CheckboxManager module not available');
      }
      if (!DOMHandler) {
        throw new Error('DOMHandler module not available');
      }

      // Get all conversations
      const conversations = DOMHandler.getAllConversations();
      utils.log('log', `Found ${conversations.length} conversations to process`);

      if (conversations.length === 0) {
        return { success: true, processed: 0, message: 'No conversations found' };
      }

      // Process each conversation
      let processedCount = 0;
      let errorCount = 0;

      conversations.forEach((conversation, index) => {
        try {
          // Add checkbox to conversation
          CheckboxManager.addCheckboxToConversation(conversation, index);
          
          // Setup interaction
          CheckboxManager.setupConversationInteraction(conversation);
          
          processedCount++;
          
        } catch (error) {
          errorCount++;
          utils.log('error', `Failed to process conversation ${index}:`, error);
        }
      });

      // Add keyboard event listeners if EventHandler is available
      if (EventHandler && EventHandler.addKeyboardListeners) {
        try {
          EventHandler.addKeyboardListeners();
          utils.debug('Keyboard event listeners added');
        } catch (error) {
          utils.log('error', 'Failed to add keyboard listeners:', error);
        }
      }

      const result = {
        success: errorCount === 0,
        processed: processedCount,
        errors: errorCount,
        total: conversations.length
      };

      if (result.success) {
        utils.log('log', `Successfully added checkboxes to ${processedCount} conversations`);
      } else {
        utils.log('error', `Added checkboxes with errors: ${processedCount} success, ${errorCount} errors`);
      }

      return result;
    });
  }

  // Execute the operation
  try {
    addCheckboxesToConversations();
  } catch (error) {
    utils.log('error', 'Failed to execute addCheckboxes operation:', error);
    
    // Show user notification if possible
    const CommonUtils = core.getModule('CommonUtils');
    if (CommonUtils && CommonUtils.showNotification) {
      CommonUtils.showNotification(`Failed to add checkboxes: ${error.message}`, 'error');
    }
  }

})();