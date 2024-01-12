(function() {
    const removeConversationCheckboxes = document.querySelectorAll('.conversation-checkbox');
    removeConversationCheckboxes.forEach(checkbox => {
      checkbox.remove();
    });
    // 在移除所有复选框后刷新页面
    location.reload();
  })();
  