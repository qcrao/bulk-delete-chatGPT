console.log("bulkArchiveConversations.js loaded");

async function bulkArchiveConversations() {
  try {
    const selectedConversations = CommonUtils.getSelectedConversations();
    await ConversationHandler.performOperation('ARCHIVE', selectedConversations, BUTTON_IDS.BULK_ARCHIVE);
  } catch (error) {
    console.error("Error in bulk archive operation:", error);
    CommonUtils.showNotification(`Bulk archive failed: ${error.message}`, 'error');
    ChromeUtils.sendComplete(BUTTON_IDS.BULK_ARCHIVE);
  }
}

bulkArchiveConversations();
