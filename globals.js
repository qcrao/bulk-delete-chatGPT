if (typeof window.globalsLoaded === "undefined") {
  console.log("globals.js loaded");

  window.globalsLoaded = true;

  const Selectors = {
    // 更新对话选择器以匹配新的 data-testid 属性
    conversationsCheckbox: ".conversation-checkbox:checked",
    confirmDeleteButton: "button.btn.btn-danger",
    threeDotButton: '[id^="radix-"]',
    //Select history div that contains all chats
    HISTORY: '[id^="history"]',
    // 更新为新的对话选择器格式
    // Updated Converstation selector changed to link nodes
    CONVERSATION_SELECTOR: "a",
    // 更新标题选择器，保持相对路径
    TITLE_SELECTOR: ".relative.grow.overflow-hidden.whitespace-nowrap",
    INTERACTIVE_ELEMENT_SELECTOR: "button",
  };

  // Constants
  const CHECKBOX_CLASS = "conversation-checkbox";

  // Expose variables to the global scope
  window.Selectors = Selectors;
  window.shiftPressed = false;
  window.lastCheckedCheckbox = null;
  window.CHECKBOX_CLASS = CHECKBOX_CLASS;
} else {
  console.log("globals.js already loaded, skipping re-initialization");
}
