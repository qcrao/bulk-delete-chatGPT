if (typeof window.globalsLoaded === "undefined") {
  console.log("globals.js loaded");

  window.globalsLoaded = true;

const Selectors = {
  conversationsCheckbox: ".conversation-checkbox:checked",
  confirmDeleteButton: "button.btn.btn-danger",
  threeDotButton: '[id^="radix-"]',
  CONVERSATION_SELECTOR: "div.relative > ol > li > div > a",
  TITLE_SELECTOR: ".relative.grow.overflow-hidden.whitespace-nowrap",
};

  const CHECKBOX_CLASS = "conversation-checkbox";

  // Expose variables to the global scope
  window.Selectors = Selectors;
  window.shiftPressed = false;
  window.lastCheckedCheckbox = null;
  window.CHECKBOX_CLASS = CHECKBOX_CLASS;
} else {
  console.log("globals.js already loaded, skipping re-initialization");
}
