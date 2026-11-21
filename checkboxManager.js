/**
 * ChatGPT Bulk Delete - Checkbox Manager Module
 * 
 * Handles all checkbox-related functionality including:
 * - Checkbox creation and styling
 * - Layout management
 * - Event handling and interaction setup
 */

(function() {
  'use strict';

  // Wait for core system to be ready
  if (!window.ChatGPTBulkDelete) {
    console.error('[CheckboxManager] Core system not found, deferring initialization');
    setTimeout(arguments.callee, 50);
    return;
  }

  const core = window.ChatGPTBulkDelete;
  
  // Module factory function
  function createCheckboxManager(coreSystem) {
    const utils = coreSystem.utils;
    
    return {
      /**
       * Create a checkbox element with proper styling and event handling
       */
      createCheckbox(index) {
        try {
          // Get DOMHandler module
          const DOMHandler = coreSystem.getModule('DOMHandler');
          if (!DOMHandler) {
            throw new Error('DOMHandler module not found');
          }

          const checkbox = DOMHandler.createCheckbox(index);
          
          // Add click event handling
          checkbox.addEventListener("click", (event) => {
            this.handleCheckboxClick(event, checkbox);
          });
          
          utils.debug(`Checkbox created for index: ${index}`);
          return checkbox;
          
        } catch (error) {
          utils.log('error', 'Failed to create checkbox:', error);
          throw error;
        }
      },

      /**
       * Handle checkbox click events
       */
      handleCheckboxClick(event, checkbox) {
        try {
          // Get EventHandler module
          const EventHandler = core.getModule('EventHandler');
          if (EventHandler && EventHandler.handleCheckboxClick) {
            EventHandler.handleCheckboxClick(event, checkbox);
          } else {
            // Fallback: prevent event propagation
            event.stopPropagation();
            utils.debug('Checkbox clicked (no EventHandler found)');
          }
        } catch (error) {
          utils.log('error', 'Error handling checkbox click:', error);
        }
      },

      /**
       * Add checkbox to conversation with proper layout.
       * IMPORTANT: We must not move or wrap ChatGPT's React-managed children.
       * Doing so confuses React's reconciler and causes `removeChild` errors
       * that crash the sidebar (the node React expects in `conversation` is
       * actually somewhere else). Instead, overlay the checkbox via absolute
       * positioning so the React subtree stays untouched.
       */
      addCheckboxToConversation(conversation, index) {
        try {
          if (!conversation) {
            throw new Error('Conversation element is required');
          }

          // Check for existing checkbox and preserve state
          let existingCheckbox = utils.safeQuery(`.${CSS_CLASSES.CHECKBOX}`, conversation);
          let isChecked = existingCheckbox ? existingCheckbox.checked : false;

          if (existingCheckbox) {
            existingCheckbox.remove();
            utils.debug(`Removed existing checkbox for conversation ${index}`);
          }

          const checkbox = this.createCheckbox(index);
          checkbox.checked = isChecked;
          // Track it for auto-add, including when "Add" is clicked again and
          // replaces existing checkboxes.
          if (this._knownCheckboxes) {
            if (existingCheckbox) {
              this._knownCheckboxes.delete(existingCheckbox);
            }
            this._knownCheckboxes.add(checkbox);
          }
          // Lets a bulk run find this conversation again if ChatGPT re-renders
          // the row and detaches the checkbox.
          const domHandler = coreSystem.getModule('DOMHandler');
          const route = domHandler && domHandler.getConversationRoute
            ? domHandler.getConversationRoute(conversation)
            : null;
          if (route) {
            checkbox.dataset.bulkDeleteRoute = route;
          }
          // !important guards against ChatGPT's global resets (e.g.
          // `appearance: none` on inputs), which render the checkbox invisible.
          checkbox.style.cssText = `
            position: absolute !important;
            left: 6px !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            z-index: 10 !important;
            margin: 0 !important;
            width: 16px !important;
            height: 16px !important;
            display: block !important;
            opacity: 1 !important;
            visibility: visible !important;
            appearance: auto !important;
            pointer-events: auto !important;
            cursor: pointer;
          `;

          // Make sure the conversation can host an absolutely-positioned child
          // and leave room for the checkbox so it doesn't cover the title.
          conversation.dataset.bulkDeleteConversationOwner = "true";
          const computed = window.getComputedStyle(conversation);
          if (computed.position === 'static') {
            conversation.style.position = 'relative';
          }
          // Keep the padding from before selection mode ('' included) so a
          // second "Add" doesn't record our own padding as the original.
          if (!('bulkDeleteOriginalPadding' in conversation.dataset)) {
            conversation.dataset.bulkDeleteOriginalPadding = conversation.style.paddingLeft || '';
          }
          conversation.style.paddingLeft = '28px';

          // Append (don't move React's children!) — appending an extra DOM
          // node React doesn't track is safe, but reordering its children is
          // what triggers the removeChild crash.
          conversation.appendChild(checkbox);
          utils.debug(`Checkbox added to conversation ${index}, checked: ${isChecked}`);

          // Read-only preview entry; independent of the checkbox state.
          const preview = coreSystem.getModule('ConversationPreview');
          if (preview && route) {
            const title = domHandler && domHandler.getConversationTitle
              ? domHandler.getConversationTitle(conversation)
              : '';
            preview.addPreviewButton(conversation, route, title);
          }

          return checkbox;

        } catch (error) {
          utils.log('error', `Failed to add checkbox to conversation ${index}:`, error);
          throw error;
        }
      },

      /**
       * Setup conversation interaction behaviors
       */
      setupConversationInteraction(conversation) {
        try {
          if (!conversation) {
            throw new Error('Conversation element is required');
          }

          // Get DOMHandler module
          const DOMHandler = core.getModule('DOMHandler');
          if (!DOMHandler) {
            throw new Error('DOMHandler module not found');
          }

          if (conversation.dataset.bulkDeleteInteractionSetup === "true") {
            utils.debug('Conversation interaction already setup');
            return;
          }
          conversation.dataset.bulkDeleteInteractionSetup = "true";

          // Disable default link behavior
          DOMHandler.toggleConversationInteraction(conversation, true);
          
          // Add click handler for checkbox toggle
          conversation.addEventListener("click", (event) => {
            const clickedElement = event.target && event.target.closest
              ? event.target
              : null;
            if (!clickedElement) {
              return;
            }

            if (clickedElement.classList.contains(CSS_CLASSES.CHECKBOX)) {
              return;
            }

            const preview = core.getModule('ConversationPreview');
            if (preview && preview.isPreviewControl(clickedElement)) {
              return;
            }

            const menuControl = clickedElement.closest(
              `${UI_CONFIG.SELECTORS.CONVERSATION_MENU_BUTTON}, [role="menuitem"]`
            );
            if (menuControl) {
              return;
            }

            this.handleConversationClick(conversation, event);
          });

          // Set cursor style
          conversation.style.cursor = "pointer";
          
          utils.debug('Conversation interaction setup completed');
          
        } catch (error) {
          utils.log('error', 'Failed to setup conversation interaction:', error);
          throw error;
        }
      },

      /**
       * Handle conversation click to toggle checkbox
       */
      handleConversationClick(conversation, event) {
        try {
          // Get EventHandler module
          const EventHandler = core.getModule('EventHandler');
          if (EventHandler && EventHandler.toggleCheckboxInConversation) {
            EventHandler.toggleCheckboxInConversation(conversation, event);
          } else {
            // Fallback: find and toggle checkbox directly
            const checkbox = utils.safeQuery(`.${CSS_CLASSES.CHECKBOX}`, conversation);
            if (checkbox) {
              checkbox.checked = !checkbox.checked;
              utils.debug('Checkbox toggled via conversation click (fallback)');
            }
          }
        } catch (error) {
          utils.log('error', 'Error handling conversation click:', error);
        }
      },

      /**
       * Keep selection mode applied to rows ChatGPT renders later: expanding a
       * project folder, loading more history, or re-rendering an existing row.
       * A row re-rendered while selected gets its checked state back.
       */
      startAutoAdd() {
        if (this._autoAddObserver) {
          return;
        }
        this._autoAddTimer = null;
        this._knownCheckboxes = new Set(this.getAllCheckboxes());
        // route -> time until which a dropped selection may be restored.
        this._pendingRestore = new Map();
        const rowSelector = `a[href*="/c/"], .${CSS_CLASSES.CHECKBOX}`;
        const relevant = (node) => node.nodeType === 1 && (
          node.matches(rowSelector) || node.querySelector(rowSelector)
        );
        this._autoAddObserver = new MutationObserver((mutations) => {
          const touchesRows = mutations.some((mutation) => {
            if (mutation.type === 'attributes') {
              // ChatGPT can reuse a row element for a different chat.
              return mutation.target.matches && mutation.target.matches('a[href*="/c/"]');
            }
            return Array.prototype.some.call(mutation.addedNodes, relevant)
              || Array.prototype.some.call(mutation.removedNodes, relevant);
          });
          if (touchesRows) {
            this.scheduleAutoAdd(200);
          }
        });
        this._autoAddObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['href']
        });
        utils.debug('Auto-add for new conversation rows started');
      },

      scheduleAutoAdd(delay) {
        if (!this._autoAddObserver || this._autoAddTimer) {
          return;
        }
        this._autoAddTimer = setTimeout(() => {
          this._autoAddTimer = null;
          this.addMissingCheckboxes();
        }, delay);
      },

      stopAutoAdd() {
        if (this._autoAddObserver) {
          this._autoAddObserver.disconnect();
          this._autoAddObserver = null;
        }
        if (this._autoAddTimer) {
          clearTimeout(this._autoAddTimer);
          this._autoAddTimer = null;
        }
        this._knownCheckboxes = null;
        this._pendingRestore = null;
      },

      addMissingCheckboxes() {
        // A bulk run works from its own snapshot and re-finds rows by route;
        // don't churn the sidebar under it, but catch up once it's over.
        const running = core.state && core.state.operationsInProgress;
        if (running && (running.has('bulkDelete') || running.has('bulkArchive'))) {
          this.scheduleAutoAdd(1000);
          return 0;
        }
        const DOMHandler = coreSystem.getModule('DOMHandler');
        if (!DOMHandler || !this._knownCheckboxes) {
          return 0;
        }

        // A selection survives a quick re-render, but not a row that stays
        // gone (e.g. a collapsed project folder): a bulk run only sees rows on
        // screen, so a hidden "selected" row would silently be skipped.
        const RESTORE_WINDOW_MS = 3000;
        const now = Date.now();
        const remember = (checkbox) => {
          const route = checkbox.dataset.bulkDeleteRoute;
          if (!route) {
            return;
          }
          if (checkbox.checked) {
            this._pendingRestore.set(route, now + RESTORE_WINDOW_MS);
          } else {
            this._pendingRestore.delete(route);
          }
        };
        for (const checkbox of this._knownCheckboxes) {
          if (!checkbox.isConnected) {
            remember(checkbox);
            this._knownCheckboxes.delete(checkbox);
          }
        }
        for (const [route, until] of this._pendingRestore) {
          if (until < now) {
            this._pendingRestore.delete(route);
          }
        }

        let index = this.getAllCheckboxes().length;
        let added = 0;
        const restored = new Set();
        DOMHandler.getAllConversations().forEach((conversation) => {
          // One odd row must not stop the rest of the pass.
          try {
            const route = DOMHandler.getConversationRoute(conversation);
            const existing = conversation.querySelector(`.${CSS_CLASSES.CHECKBOX}`);
            if (existing) {
              if (existing.dataset.bulkDeleteRoute === route) {
                return;
              }
              // Row element reused for another chat: its checkbox and preview
              // icon still belong to the old one.
              remember(existing);
              this._knownCheckboxes.delete(existing);
              existing.remove();
            }
            const checkbox = this.addCheckboxToConversation(conversation, index++);
            this.setupConversationInteraction(conversation);
            if (route && this._pendingRestore.has(route)) {
              checkbox.checked = true;
              restored.add(route);
            }
            added++;
          } catch (error) {
            utils.log('error', 'Failed to add checkbox to a new row:', error);
          }
        });
        // Every copy of a route rendered in this pass got its state back
        // (sidebar folder + Recents can show the same chat twice).
        restored.forEach((route) => this._pendingRestore.delete(route));

        if (added) {
          utils.debug(`Auto-added checkboxes to ${added} conversation rows`);
        }
        return added;
      },

      /**
       * Remove all checkboxes from the page
       */
      removeAllCheckboxes() {
        try {
          this.stopAutoAdd();
          const preview = coreSystem.getModule('ConversationPreview');
          if (preview) {
            preview.cleanup();
          }
          // Not every exit reloads the page (e.g. a run with nothing selected).
          document.querySelectorAll('[data-bulk-delete-conversation-owner="true"]').forEach((row) => {
            if ('bulkDeleteOriginalPadding' in row.dataset) {
              row.style.paddingLeft = row.dataset.bulkDeleteOriginalPadding;
              delete row.dataset.bulkDeleteOriginalPadding;
            }
          });
          const checkboxes = utils.safeQueryAll(`.${CSS_CLASSES.CHECKBOX}`);
          let removedCount = 0;
          
          checkboxes.forEach(checkbox => {
            try {
              checkbox.remove();
              removedCount++;
            } catch (error) {
              utils.log('error', 'Failed to remove checkbox:', error);
            }
          });
          
          utils.debug(`Removed ${removedCount} checkboxes`);
          return removedCount;
          
        } catch (error) {
          utils.log('error', 'Failed to remove checkboxes:', error);
          throw error;
        }
      },

      /**
       * Get all currently visible checkboxes
       */
      getAllCheckboxes() {
        try {
          return utils.safeQueryAll(`.${CSS_CLASSES.CHECKBOX}`);
        } catch (error) {
          utils.log('error', 'Failed to get checkboxes:', error);
          return [];
        }
      },

      /**
       * Toggle all checkboxes on/off
       */
      toggleAllCheckboxes() {
        try {
          const checkboxes = this.getAllCheckboxes();
          
          if (checkboxes.length === 0) {
            utils.debug('No checkboxes found to toggle');
            return 0;
          }

          let toggledCount = 0;
          checkboxes.forEach(checkbox => {
            try {
              checkbox.checked = !checkbox.checked;
              toggledCount++;
            } catch (error) {
              utils.log('error', 'Failed to toggle checkbox:', error);
            }
          });
          
          utils.debug(`Toggled ${toggledCount} checkboxes`);
          return toggledCount;
          
        } catch (error) {
          utils.log('error', 'Failed to toggle checkboxes:', error);
          throw error;
        }
      }
    };
  }

  // Register the CheckboxManager module
  core.registerModule('CheckboxManager', createCheckboxManager);
  
  core.utils.debug('CheckboxManager module registered');

})();
