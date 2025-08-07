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
- Uses mouse events (`mouseover`, `pointerdown`) to trigger ChatGPT's context menus
- Waits for dynamic elements to appear/disappear using polling with timeouts
- Handles ChatGPT's dynamic UI updates and element recreation

### Premium Feature Architecture
- Local storage caching of membership status
- External API verification at `bulk-delete-chatgpt-worker.qcrao.com`
- Payment flow integration for bulk archive feature

## Common Issues & Debugging

### Selector Breakage
ChatGPT frequently updates their UI, breaking selectors in `globals.js`. When functionality fails:
1. Inspect ChatGPT page elements in browser dev tools
2. Update selectors in `globals.js`
3. Test with extension reload

### Content Script Loading
Scripts must load in order: `globals.js` and `utils.js` first, then operation-specific scripts. The `loadGlobalsThenExecute()` function in `popup.js` ensures proper loading sequence.