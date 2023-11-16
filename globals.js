console.log('globals.js loaded');

let lastChecked = null;

const standardSelectors = {
    // 标准用户的选择器
    conversationsCheckbox: '.conversation-checkbox:checked',
    deleteButton: 'nav div a>div>button:nth-child(2)',
    confirmDeleteButton: 'button.btn.btn-danger',
    // 其他标准用户选择器...
    CONVERSATION_SELECTOR: 'div div span div ol li>a.flex',
    TITLE_SELECTOR: '.flex-1.text-ellipsis.max-h-5.overflow-hidden.break-all.relative',
};

const plusSelectors = {
    // Plus 用户的选择器
    conversationsCheckbox: '.conversation-checkbox:checked',
    deleteButton: '[class*="text-red"]',
    confirmDeleteButton: 'button.btn.btn-danger',
    // 其他 Plus 用户选择器...
    CONVERSATION_SELECTOR: 'div > div > div > div > div > div > nav > div > div > div > span > div > ol > li > div > a',
    TITLE_SELECTOR: '.relative.grow.overflow-hidden.whitespace-nowrap',
};

const CHECKBOX_CLASS = 'conversation-checkbox';

let Selectors;

function isPlusUser() {
    const spans = document.querySelectorAll('span.text-sm');
    return Array.from(spans).some(span => span.textContent.trim() === "Explore");
}

function initializeSelectors() {
    Selectors = isPlusUser() ? plusSelectors : standardSelectors;
}

// 确保在文档加载完毕后初始化 Selectors
document.addEventListener('DOMContentLoaded', initializeSelectors);