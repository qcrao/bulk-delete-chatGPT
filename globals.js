let lastChecked = null;

const Selectors = {
    conversationsCheckbox: '.conversation-checkbox:checked',
    deleteButton: '[role="dialog"] button:nth-child(1)',
};


// 定义选择器和其他常量
const CONVERSATION_SELECTOR = 'div > div > div > div > div > div > nav > div > div > div > span > div > ol > li > div > a'
const TITLE_SELECTOR = '.flex-1.text-ellipsis.max-h-5.overflow-hidden.break-all.relative';
const CHECKBOX_CLASS = 'conversation-checkbox';