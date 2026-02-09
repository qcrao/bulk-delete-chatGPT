# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension called "ChatGPT Bulk Delete" that allows users to bulk delete/archive conversations on ChatGPT pages. It's a Manifest V3 Chrome extension with no build process - the JavaScript files run directly in the browser.

## Architecture

### Core Components

- **manifest.json**: Chrome extension manifest (v3) defining permissions, content scripts, and popup
- **popup.html/popup.js/popup.css**: Extension popup UI with buttons for different operations
- **background.js**: Service worker for Chrome extension background tasks
- **Content Scripts** (injected into ChatGPT pages):
  - `globals.js`: Shared constants and selectors for ChatGPT UI elements
  - `utils.js`: Utility functions including analytics
  - `addCheckboxes.js`: Adds checkboxes to conversation items
  - `bulkDeleteConversations.js`: Handles bulk deletion logic
  - `bulkArchiveConversations.js`: Handles bulk archiving (premium feature)
  - `deleteAllNonProjectChats.js`: Automatically deletes ALL non-project chats (repeats until done)
  - `toggleCheckboxes.js`: Toggle all checkboxes on/off
  - `removeCheckboxes.js`: Removes all added checkboxes

### Key Architecture Patterns

- **Content Script Injection**: Scripts are injected into `chat.openai.com` and `chatgpt.com` pages
- **DOM Manipulation**: Heavy use of DOM selectors to interact with ChatGPT's UI
- **Event-Driven**: Uses Chrome messaging API for popup ↔ content script communication
- **Progressive Enhancement**: Adds UI elements (checkboxes) to existing ChatGPT interface
- **Premium Features**: Bulk archive requires paid membership verification via external API

### Critical UI Selectors (globals.js)

The extension relies on specific CSS selectors to interact with ChatGPT's UI:
- `HISTORY`: History container with chat list
- `CONVERSATION_SELECTOR`: Individual conversation links (`a` tags)
- `TITLE_SELECTOR`: Conversation title elements
- `INTERACTIVE_ELEMENT_SELECTOR`: Hoverable/clickable elements

## Development Workflow

### No Build Process
This extension has no build system - files are loaded directly. Changes to any `.js`, `.html`, or `.css` files require:
1. Making changes to source files
2. Reloading the extension in Chrome (`chrome://extensions/`)
3. Testing on ChatGPT pages

### Testing
- Load extension in Chrome developer mode
- Navigate to `https://chat.openai.com` or `https://chatgpt.com`
- Test functionality with actual ChatGPT conversations
- Monitor browser console for errors/logs

### Deployment
- Update `version` in `manifest.json`
- Package as `.zip` file for Chrome Web Store submission
- No compilation or bundling required

## Key Technical Details

### Chrome Extension Permissions
- `scripting`: To inject content scripts
- `activeTab`: To access current tab content
- `identity`, `identity.email`: For user authentication (premium features)
- Host permission for `bulk-delete-chatgpt-worker.qcrao.com`

### ChatGPT UI Integration
- Uses mouse events (`mouseover`, `pointer down`) to trigger ChatGPT's context menus
- Waits for dynamic elements to appear/disappear using polling with timeouts
- Handles ChatGPT's dynamic UI updates and element recreation

### Premium Feature Architecture
- Local storage caching of membership status
- External API verification at bulk-delete-chatgpt-worker domain
- Payment flow integration for bulk archive feature

## Common Issues & Debugging

### Selector Breakage
ChatGPT frequently updates their UI, breaking selectors in `config.js`. When functionality fails:
1. Inspect ChatGPT page elements in browser dev tools
2. Update selectors in `UI_CONFIG.SELECTORS` in `config.js`
3. Test with extension reload

## Refactored Architecture (Post-2024)

### Modular Structure
- **config.js**: Centralized configuration management (API URLs, selectors, constants)
- **globals.js**: Global state management with proper encapsulation
- **utils.js**: Common utilities (API calls, Chrome messaging, DOM helpers)
- **domHandler.js**: DOM manipulation and event handling utilities
- **conversationHandler.js**: Business logic for delete/archive operations

### Script Loading Order
Scripts load in dependency order via manifest.json:
1. `config.js` - Configuration constants
2. `globals.js` - Global state
3. `utils.js` - Utility functions
4. `domHandler.js` - DOM helpers
5. `conversationHandler.js` - Business logic
6. Operation-specific scripts (`addCheckboxes.js`, etc.)

### Content Script Loading
Scripts now load automatically in proper order via manifest.json. No manual dependency management needed.

## Auto Bulk Delete Feature

### How it works
The "Auto Bulk Delete" button automatically deletes all chats that are NOT in ChatGPT Projects:

1. The extension uses the `[id^="history"]` selector which only matches the regular chat history container
2. Chats inside Projects live in a different DOM structure and are NOT matched by this selector
3. The `deleteAllNonProjectChats.js` script:
   - Adds checkboxes to all visible non-project chats
   - Selects all checkboxes
   - Deletes selected chats one by one
   - Repeats the process until no more non-project chats remain
   - Handles lazy-loading (new chats appearing as old ones are deleted)

### Safety
- Chats in Projects are **never** deleted (they're in a separate DOM container)
- Maximum 100 iterations as safety limit
- Progress is shown in the popup button