console.log("bulkDeleteConversations.js loaded");

async function bulkDeleteConversations() {
  try {
    const selectedConversations = CommonUtils.getSelectedConversations();
    await ConversationHandler.performOperation('DELETE', selectedConversations, BUTTON_IDS.BULK_DELETE);
  } catch (error) {
    console.error("Error in bulk delete operation:", error);
    CommonUtils.showNotification(`Bulk delete failed: ${error.message}`, 'error');
    ChromeUtils.sendComplete(BUTTON_IDS.BULK_DELETE);
  }
}

// Start the bulk delete process
bulkDeleteConversations();
