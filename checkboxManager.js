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
          checkbox.style.cssText = `
            position: absolute;
            left: 6px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 10;
            margin: 0;
            cursor: pointer;
          `;

          // Make sure the conversation can host an absolutely-positioned child
          // and leave room for the checkbox so it doesn't cover the title.
          const computed = window.getComputedStyle(conversation);
          if (computed.position === 'static') {
            conversation.style.position = 'relative';
          }
          if (!conversation.dataset.bulkDeleteOriginalPadding) {
            conversation.dataset.bulkDeleteOriginalPadding = conversation.style.paddingLeft || '';
          }
          conversation.style.paddingLeft = '28px';

          // Append (don't move React's children!) — appending an extra DOM
          // node React doesn't track is safe, but reordering its children is
          // what triggers the removeChild crash.
          conversation.appendChild(checkbox);
          utils.debug(`Checkbox added to conversation ${index}, checked: ${isChecked}`);

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

          // Disable default link behavior
          DOMHandler.toggleConversationInteraction(conversation, true);
          
          // Add click handler for checkbox toggle
          conversation.addEventListener("click", (event) => {
            if (!event.target.classList.contains(CSS_CLASSES.CHECKBOX)) {
              this.handleConversationClick(conversation, event);
            }
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
       * Remove all checkboxes from the page
       */
      removeAllCheckboxes() {
        try {
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