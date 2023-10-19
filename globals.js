let lastChecked = null;

const Selectors = {
    conversationsCheckbox: '.conversation-checkbox:checked',
    deleteButton: 'nav div a>div>button:nth-child(2)',
    confirmDeleteButton: 'button.btn.btn-danger',
};
  

// 定义选择器和其他常量
const CONVERSATION_SELECTOR = 'div div span div ol li>a.flex';
const TITLE_SELECTOR = '.flex-1.text-ellipsis.max-h-5.overflow-hidden.break-all.relative';
const CHECKBOX_CLASS = 'conversation-checkbox';