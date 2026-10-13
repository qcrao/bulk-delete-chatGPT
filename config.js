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
    TIMEOUT: 60000
  };

  // UI Configuration
  const UI_CONFIG = {
    DELAYS: {
      SHORT: 100,
      MEDIUM: 200,
      LONG: 300,
      EXTENDED: 500,
      // Throttle between consecutive delete/archive operations to avoid
      // ChatGPT server-side rate limiting (reported by users in store reviews).
      THROTTLE: 500
    },
    OPERATION_DELAY: {
      STORAGE_KEY: "BulkDeleteChatGPT_delaySettings",
      BATCH_SIZE: 10,
      DEFAULT_BASE_DELAY_MS: 1200,
      MIN_BASE_DELAY_MS: 300,
      MAX_BASE_DELAY_MS: 600000,
      DEFAULT_AUTO_SLOWDOWN: true,
      INTRA_BATCH_GROWTH: 0.25,
      BATCH_COOLDOWN_BASE_MULTIPLIER: 3,
      BATCH_COOLDOWN_GROWTH_MULTIPLIER: 1,
      MAX_INTRA_BATCH_DELAY_MS: 8000,
      MAX_BATCH_COOLDOWN_MS: 30000
    },
    TIMEOUTS: {
      ELEMENT_WAIT: 2000,
      ELEMENT_WAIT_SHORT: 1000,
      // The confirm dialog stays open while ChatGPT's delete request is in flight.
      CONFIRM_DIALOG_CLOSE: 10000
    },
    SELECTORS: {
      conversationsCheckbox: ".conversation-checkbox:checked",
      // Newer ChatGPT dialogs use a destructive submit button without a test ID.
      // Exclude hidden dialogs left behind by an interrupted delete operation.
      confirmDeleteButton: 'button[data-testid="delete-conversation-confirm-button"], button.btn.btn-danger, [role="dialog"][data-state="open"]:not([aria-hidden="true"]) form button[type="submit"].text-chart-red',
      threeDotButton: '[id^="radix-"]',
      HISTORY: '[id^="history"]',
      CONVERSATION_SELECTOR: 'a[href*="/c/"]',
      PROJECT_CONVERSATION_SELECTOR: 'main li[class*="group/project-item"]',
      PROJECT_CONVERSATION_LINK_SELECTOR: 'a[href*="/c/"]',
      TITLE_SELECTOR: '[data-testid="conversation-title"], .relative.grow.overflow-hidden.whitespace-nowrap',
      INTERACTIVE_ELEMENT_SELECTOR: '[draggable="true"], [data-sidebar-item="true"]',
      CONVERSATION_MENU_BUTTON: 'button[data-conversation-options-trigger], button[data-testid="conversation-options-button"], button[data-testid$="-options"][aria-haspopup="menu"], button[id^="radix-"][aria-haspopup="menu"]',
      MENU_ITEM: '[role="menuitem"]',
      // Improved selectors for language-independent detection
      DELETE_BUTTON: '[data-testid="delete-chat-menu-item"], [role="menuitem"][data-testid*="delete"], [role="menuitem"].text-danger',
      ARCHIVE_BUTTON: '[data-testid="archive-chat-menu-item"], [role="menuitem"][data-testid*="archive"], [role="menuitem"]:has(+ [role="menuitem"].text-danger)'
    },
    STRINGS: {
      // Menu labels as shown by ChatGPT in each UI language (checked 2026-10-13).
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
      DELETE_VI: "Xoá",
      DELETE_VI_ALT: "Xóa",
      DELETE_TH: "ลบ",
      DELETE_AR: "حذف",
      DELETE_HE: "מחק",
      DELETE_HI: "डिलीट करें",
      DELETE_SV: "Ta bort",
      DELETE_NO: "Slett",
      DELETE_DA: "Slet",
      DELETE_FI: "Poista",
      DELETE_CS: "Smazat",
      DELETE_UK: "Видалити",
      DELETE_EL: "Διαγραφή",
      DELETE_HU: "Törlés",
      DELETE_RO: "Șterge",
      DELETE_SK: "Odstrániť",
      DELETE_SL: "Izbriši",
      DELETE_HR: "Izbriši",
      DELETE_BS: "Izbriši",
      DELETE_SR: "Избриши",
      DELETE_MK: "Избриши",
      DELETE_BG: "Изтриване",
      DELETE_ET: "Kustuta",
      DELETE_LV: "Dzēst",
      DELETE_LT: "Ištrinti",
      DELETE_CA: "Suprimeix",
      DELETE_SQ: "Fshi",
      DELETE_IS: "Eyða",
      DELETE_PT_PT: "Eliminar",
      DELETE_MS: "Padam",
      DELETE_TL: "I-delete",
      DELETE_SW: "Futa",
      DELETE_SO: "Tirtir",
      DELETE_KK: "Жою",
      DELETE_MN: "Устгах",
      DELETE_KA: "წაშლა",
      DELETE_HY: "Ջնջել",
      DELETE_AM: "ይሰርዙ",
      DELETE_FA: "حذف",
      DELETE_UR: "حذف کریں",
      DELETE_BN: "মুছুন",
      DELETE_MR: "हटवा",
      DELETE_PA: "ਮਿਟਾਓ",
      DELETE_GU: "ડિલીટ કરો",
      DELETE_TA: "நீக்குக",
      DELETE_TE: "తొలగించు",
      DELETE_KN: "ಅಳಿಸಿ",
      DELETE_ML: "ഇല്ലാതാക്കുക",
      DELETE_MY: "ဖျက်ရန်",
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
      ARCHIVE_HI: "आर्काइव करें",
      ARCHIVE_SV: "Arkivera",
      ARCHIVE_NO: "Arkiver",
      ARCHIVE_DA: "Arkivér",
      ARCHIVE_FI: "Arkistoi",
      ARCHIVE_CS: "Archivovat",
      ARCHIVE_UK: "Архівувати",
      ARCHIVE_EL: "Αρχειοθέτηση",
      ARCHIVE_HU: "Archiválás",
      ARCHIVE_RO: "Arhivează",
      ARCHIVE_SK: "Archivovať",
      ARCHIVE_SL: "Arhiviraj",
      ARCHIVE_HR: "Arhiviraj",
      ARCHIVE_BS: "Arhiviraj",
      ARCHIVE_SR: "Архивирај",
      ARCHIVE_MK: "Архивирај",
      ARCHIVE_BG: "Архивиране",
      ARCHIVE_ET: "Arhiveeri",
      ARCHIVE_LV: "Arhivēt",
      ARCHIVE_LT: "Archyvuoti",
      ARCHIVE_CA: "Arxiva",
      ARCHIVE_SQ: "Arkivo",
      ARCHIVE_IS: "Setja í geymslu",
      ARCHIVE_PT_PT: "Arquivar",
      ARCHIVE_MS: "Arkibkan",
      ARCHIVE_TL: "I-archive",
      ARCHIVE_SW: "Hifadhi kwenye kumbukumbu",
      ARCHIVE_SO: "Kaydi",
      ARCHIVE_KK: "Мұрағаттау",
      ARCHIVE_MN: "Архивлах",
      ARCHIVE_KA: "დაარქივება",
      ARCHIVE_HY: "Արխիվացնել",
      ARCHIVE_AM: "በማህደር አስቀምጥ",
      ARCHIVE_FA: "بایگانی",
      ARCHIVE_UR: "آرکائیو کریں",
      ARCHIVE_BN: "আর্কাইভ করুন",
      ARCHIVE_MR: "संग्रहित करा",
      ARCHIVE_PA: "ਆਰਕਾਈਵ ਕਰੋ",
      ARCHIVE_GU: "આર્કાઇવ કરો",
      ARCHIVE_TA: "காப்பகப்படுத்து",
      ARCHIVE_TE: "ఆర్కైవ్ చేయండి",
      ARCHIVE_KN: "ಆರ್ಕೈವ್",
      ARCHIVE_ML: "ആർക്കൈവ് ചെയ്യുക",
      ARCHIVE_MY: "မှတ်တမ်းသိမ်းရန်"
    },
    // Button detection strategies (order of preference)
    BUTTON_STRATEGIES: {
      DELETE: [
        // Strategy 1: Stable ChatGPT test ID
        '[data-testid="delete-chat-menu-item"]',
        // Strategy 2: Text matching for localized UIs
        'text-fallback',
        // Strategy 3: Other delete-related test IDs
        '[role="menuitem"][data-testid*="delete"]',
        // Strategy 4: The only destructive (red) item. ChatGPT dropped the
        // test IDs, so this keeps non-English UIs working.
        '[role="menuitem"].text-danger'
      ],
      ARCHIVE: [
        // Strategy 1: Stable ChatGPT test ID
        '[data-testid="archive-chat-menu-item"]',
        // Strategy 2: Text matching for localized UIs
        'text-fallback',
        // Strategy 3: Other archive-related test IDs
        '[role="menuitem"][data-testid*="archive"]',
        // Strategy 4: The item right before Delete
        '[role="menuitem"]:has(+ [role="menuitem"].text-danger)'
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
