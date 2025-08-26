if (typeof window.configLoaded === "undefined") {
  console.log("config.js loaded");

  window.configLoaded = true;

  // API Configuration
  const API_CONFIG = {
    BASE_URL: "https://bulk-delete-chatgpt-worker.qcrao.com",
    ENDPOINTS: {
      SEND_EVENT: "/send-event",
      CHECK_PAYMENT: "/check-payment-status",
      PAY_BULK_ARCHIVE: "/pay-bulk-archive"
    },
    TIMEOUT: 10000
  };

  // UI Configuration
  const UI_CONFIG = {
    DELAYS: {
      SHORT: 100,
      MEDIUM: 200,
      LONG: 300,
      EXTENDED: 500
    },
    TIMEOUTS: {
      ELEMENT_WAIT: 2000,
      ELEMENT_WAIT_SHORT: 1000
    },
    SELECTORS: {
      conversationsCheckbox: ".conversation-checkbox:checked",
      confirmDeleteButton: "button.btn.btn-danger",
      threeDotButton: '[id^="radix-"]',
      HISTORY: '[id^="history"]',
      CONVERSATION_SELECTOR: "a",
      TITLE_SELECTOR: ".relative.grow.overflow-hidden.whitespace-nowrap",
      INTERACTIVE_ELEMENT_SELECTOR: "button",
      MENU_ITEM: 'div[role="menuitem"]',
      // Improved selectors for language-independent detection
      DELETE_BUTTON: 'div[role="menuitem"]:last-child, div[role="menuitem"] .text-token-text-error, div[role="menuitem"][data-testid*="delete"]',
      ARCHIVE_BUTTON: 'div[role="menuitem"]:nth-last-child(2), div[role="menuitem"][data-testid*="archive"]'
    },
    STRINGS: {
      DELETE: "Delete",
      DELETE_CN: "删除",
      DELETE_TW: "刪除",
      DELETE_JP: "削除",
      DELETE_KR: "삭제",
      DELETE_DE: "Löschen",
      DELETE_FR: "Supprimer",
      DELETE_ES: "Eliminar",
      DELETE_PT: "Excluir",
      DELETE_IT: "Elimina",
      DELETE_RU: "Удалить",
      ARCHIVE: "Archive",
      ARCHIVE_CN: "归档",
      ARCHIVE_TW: "封存",
      ARCHIVE_JP: "アーカイブ",
      ARCHIVE_KR: "보관",
      ARCHIVE_DE: "Archivieren",
      ARCHIVE_FR: "Archiver",
      ARCHIVE_ES: "Archivar",
      ARCHIVE_PT: "Arquivar",
      ARCHIVE_IT: "Archivia",
      ARCHIVE_RU: "Архивировать"
    },
    // Button detection strategies (order of preference)
    BUTTON_STRATEGIES: {
      DELETE: [
        // Strategy 1: Look for error/danger styling
        'div[role="menuitem"] .text-token-text-error',
        // Strategy 2: Last menu item (delete is typically last)
        'div[role="menuitem"]:last-child',
        // Strategy 3: Data attributes
        'div[role="menuitem"][data-testid*="delete"]',
        // Strategy 4: Fallback to text matching
        'text-fallback'
      ],
      ARCHIVE: [
        // Strategy 1: Data attributes
        'div[role="menuitem"][data-testid*="archive"]',
        // Strategy 2: Second to last menu item
        'div[role="menuitem"]:nth-last-child(2)',
        // Strategy 3: Fallback to text matching
        'text-fallback'
      ]
    }
  };

  // Storage Configuration
  const STORAGE_CONFIG = {
    KEYS: {
      IS_PAID: "BulkDeleteChatGPT_isPaid"
    }
  };

  // CSS Classes
  const CSS_CLASSES = {
    CHECKBOX: "conversation-checkbox",
    PROGRESS: "progress"
  };

  // Button IDs
  const BUTTON_IDS = {
    BULK_DELETE: "bulk-delete",
    BULK_ARCHIVE: "bulk-archive",
    ADD_CHECKBOXES: "add-checkboxes",
    TOGGLE_CHECKBOXES: "toggle-checkboxes",
    REMOVE_CHECKBOXES: "remove-checkboxes"
  };

  // Events
  const EVENTS = {
    DELETE: "delete",
    ARCHIVE: "archive"
  };

  // Export to global scope
  window.API_CONFIG = API_CONFIG;
  window.UI_CONFIG = UI_CONFIG;
  window.STORAGE_CONFIG = STORAGE_CONFIG;
  window.CSS_CLASSES = CSS_CLASSES;
  window.BUTTON_IDS = BUTTON_IDS;
  window.EVENTS = EVENTS;

  // For backward compatibility
  window.Selectors = UI_CONFIG.SELECTORS;
  window.CHECKBOX_CLASS = CSS_CLASSES.CHECKBOX;

} else {
  console.log("config.js already loaded, skipping re-initialization");
}