/**
 * ChatGPT Bulk Delete - Bulk Delete Conversations Operation
 * 
 * This script performs bulk deletion of selected conversations.
 * It uses the ConversationHandler module for the actual implementation.
 */

(function() {
  'use strict';

  // Wait for core system to be ready
  if (!window.ChatGPTBulkDelete || !window.ChatGPTBulkDelete.initialized) {
    console.error('[BulkDelete] Core system not ready, deferring execution');
    setTimeout(arguments.callee, 50);
    return;
  }

  // Wait for ConversationHandler module to be available
  if (!window.ChatGPTBulkDelete.getModule('ConversationHandler')) {
    console.error('[BulkDelete] ConversationHandler module not ready, deferring execution');
    setTimeout(arguments.callee, 50);
    return;
  }

  const core = window.ChatGPTBulkDelete;
  const utils = core.utils;

  utils.debug('BulkDeleteConversations script loaded');

  /**
   * Main function to perform bulk deletion of conversations
   */
  async function performBulkDelete() {
    return core.executeOperation('bulkDelete', async () => {
      utils.log('log', 'Starting bulk delete operation');
      
      // Get required modules
      const ConversationHandler = core.getModule('ConversationHandler');
      const CommonUtils = core.getModule('CommonUtils');
      const ChromeUtils = core.getModule('ChromeUtils');
      
      if (!ConversationHandler) {
        throw new Error('ConversationHandler module not available');
      }
      if (!CommonUtils) {
        throw new Error('CommonUtils module not available');
      }

      try {
        // Get selected conversations
        const selectedConversations = CommonUtils.getSelectedConversations();
        
        if (!selectedConversations || selectedConversations.length === 0) {
          utils.log('log', 'No conversations selected for deletion');
          return { success: true, processed: 0, message: 'No conversations selected' };
        }

        utils.log('log', `Deleting ${selectedConversations.length} selected conversations`);
        
        // Perform the delete operation using ConversationHandler
        const result = await ConversationHandler.performOperation(
          'DELETE', 
          selectedConversations, 
          BUTTON_IDS.BULK_DELETE
        );
        
        utils.log('log', 'Bulk delete operation completed');
        return result;
        
      } catch (error) {
        utils.log('error', 'Error in bulk delete operation:', error);
        
        // Send completion signal to popup if ChromeUtils is available
        if (ChromeUtils && ChromeUtils.sendComplete) {
          ChromeUtils.sendComplete(BUTTON_IDS.BULK_DELETE);
        }
        
        throw error;
      }
    });
  }

  // Execute the operation
  (async () => {
    try {
      await performBulkDelete();
    } catch (error) {
      utils.log('error', 'Failed to execute bulk delete operation:', error);
      
      // Show user notification if possible
      const CommonUtils = core.getModule('CommonUtils');
      if (CommonUtils && CommonUtils.showNotification) {
        CommonUtils.showNotification(`Bulk delete failed: ${error.message}`, 'error');
      }
    }
  })();

})();