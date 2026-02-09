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
      // Delete button texts
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
      DELETE_NL: "Verwijderen",
      DELETE_PL: "Usuń",
      DELETE_TR: "Sil",
      DELETE_ID: "Hapus",
      DELETE_VI: "Xóa",
      DELETE_TH: "ลบ",
      DELETE_AR: "حذف",
      DELETE_HE: "מחק",
      DELETE_HI: "हटाएं",
      DELETE_SV: "Ta bort",
      DELETE_NO: "Slett",
      DELETE_DA: "Slet",
      DELETE_FI: "Poista",
      DELETE_CS: "Smazat",
      DELETE_UK: "Видалити",
      DELETE_EL: "Διαγραφή",
      // Archive button texts
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
      ARCHIVE_RU: "Архивировать",
      ARCHIVE_NL: "Archiveren",
      ARCHIVE_PL: "Archiwizuj",
      ARCHIVE_TR: "Arşivle",
      ARCHIVE_ID: "Arsipkan",
      ARCHIVE_VI: "Lưu trữ",
      ARCHIVE_TH: "เก็บถาวร",
      ARCHIVE_AR: "أرشفة",
      ARCHIVE_HE: "העבר לארכיון",
      ARCHIVE_HI: "संग्रह करें",
      ARCHIVE_SV: "Arkivera",
      ARCHIVE_NO: "Arkiver",
      ARCHIVE_DA: "Arkivér",
      ARCHIVE_FI: "Arkistoi",
      ARCHIVE_CS: "Archivovat",
      ARCHIVE_UK: "Архівувати",
      ARCHIVE_EL: "Αρχειοθέτηση"
    },
    // Button detection strategies (order of preference)
    BUTTON_STRATEGIES: {
      DELETE: [
        // Strategy 1: Text matching (most reliable)
        'text-fallback',
        // Strategy 2: Look for error/danger styling
        'div[role="menuitem"] .text-token-text-error',
        // Strategy 3: Data attributes
        'div[role="menuitem"][data-testid*="delete"]',
        // Strategy 4: Last menu item (delete is typically last)
        'div[role="menuitem"]:last-child'
      ],
      ARCHIVE: [
        // Strategy 1: Text matching (most reliable)
        'text-fallback',
        // Strategy 2: Data attributes
        'div[role="menuitem"][data-testid*="archive"]',
        // Strategy 3: Second to last menu item
        'div[role="menuitem"]:nth-last-child(2)'
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
    BULK_DELETE_ALL: "auto-bulk-delete",
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