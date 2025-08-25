/**
 * ChatGPT Bulk Delete - Remove Checkboxes Operation
 * 
 * This script removes all checkboxes and reloads the page.
 * It uses the CheckboxManager module for the actual implementation.
 */

(function() {
  'use strict';

  // Wait for core system to be ready
  if (!window.ChatGPTBulkDelete || !window.ChatGPTBulkDelete.initialized) {
    console.error('[RemoveCheckboxes] Core system not ready, deferring execution');
    setTimeout(arguments.callee, 50);
    return;
  }

  const core = window.ChatGPTBulkDelete;
  const utils = core.utils;

  utils.debug('RemoveCheckboxes script loaded');

  /**
   * Main function to remove all checkboxes and reload page
   */
  function removeCheckboxesAndReload() {
    return core.executeOperation('removeCheckboxes', () => {
      utils.log('log', 'Starting checkbox removal operation');
      
      // Get CheckboxManager module
      const CheckboxManager = core.getModule('CheckboxManager');
      
      if (!CheckboxManager) {
        throw new Error('CheckboxManager module not available');
      }

      // Use CheckboxManager to remove all checkboxes
      const removedCount = CheckboxManager.removeAllCheckboxes();
      
      utils.log('log', `Removed ${removedCount} checkboxes, reloading page`);
      
      // Reload the page to restore original state
      location.reload();
      
      // This return won't actually execute due to page reload, but included for completeness
      return {
        success: true,
        removedCount: removedCount,
        reloaded: true
      };
    });
  }

  // Execute the operation
  try {
    removeCheckboxesAndReload();
  } catch (error) {
    utils.log('error', 'Failed to execute removeCheckboxes operation:', error);
    
    // Show user notification if possible
    const CommonUtils = core.getModule('CommonUtils');
    if (CommonUtils && CommonUtils.showNotification) {
      CommonUtils.showNotification(`Failed to remove checkboxes: ${error.message}`, 'error');
    }
  }

})();