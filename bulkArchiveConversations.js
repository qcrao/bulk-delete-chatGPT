/**
 * ChatGPT Bulk Delete - Bulk Archive Conversations Operation
 * 
 * This script performs bulk archiving of selected conversations.
 * It uses the ConversationHandler module for the actual implementation.
 */

(function() {
  'use strict';

  // Wait for core system to be ready
  if (!window.ChatGPTBulkDelete || !window.ChatGPTBulkDelete.initialized) {
    console.error('[BulkArchive] Core system not ready, deferring execution');
    setTimeout(arguments.callee, 50);
    return;
  }

  const core = window.ChatGPTBulkDelete;
  const utils = core.utils;

  utils.debug('BulkArchiveConversations script loaded');

  /**
   * Main function to perform bulk archiving of conversations
   */
  async function performBulkArchive() {
    return core.executeOperation('bulkArchive', async () => {
      utils.log('log', 'Starting bulk archive operation');
      
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
          utils.log('log', 'No conversations selected for archiving');
          return { success: true, processed: 0, message: 'No conversations selected' };
        }

        utils.log('log', `Archiving ${selectedConversations.length} selected conversations`);
        
        // Perform the archive operation using ConversationHandler
        const result = await ConversationHandler.performOperation(
          'ARCHIVE', 
          selectedConversations, 
          BUTTON_IDS.BULK_ARCHIVE
        );
        
        utils.log('log', 'Bulk archive operation completed');
        return result;
        
      } catch (error) {
        utils.log('error', 'Error in bulk archive operation:', error);
        
        // Send completion signal to popup if ChromeUtils is available
        if (ChromeUtils && ChromeUtils.sendComplete) {
          ChromeUtils.sendComplete(BUTTON_IDS.BULK_ARCHIVE);
        }
        
        throw error;
      }
    });
  }

  // Execute the operation
  (async () => {
    try {
      await performBulkArchive();
    } catch (error) {
      utils.log('error', 'Failed to execute bulk archive operation:', error);
      
      // Show user notification if possible
      const CommonUtils = core.getModule('CommonUtils');
      if (CommonUtils && CommonUtils.showNotification) {
        CommonUtils.showNotification(`Bulk archive failed: ${error.message}`, 'error');
      }
    }
  })();

})();