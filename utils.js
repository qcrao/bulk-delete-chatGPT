if (typeof window.utilsLoaded === "undefined") {
  console.log("utils.js loaded");

  window.utilsLoaded = true;

  // Common utility functions
  const CommonUtils = {
    // Delay utility
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Generate timestamp
    generateTimestamp() {
      return new Date().toISOString().replace("T", " ").substr(0, 19);
    },

    // Safe element query with timeout
    async waitForElement(selector, parent = document, timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeout) {
        const element = parent.querySelector(selector);
        if (element) return element;
        await this.delay(UI_CONFIG.DELAYS.SHORT);
      }
      throw new Error(`Element ${selector} not found within ${timeout}ms`);
    },

    // Wait for element to disappear
    async waitForElementToDisappear(selector, timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeout) {
        const element = document.querySelector(selector);
        if (!element) return;
        await this.delay(UI_CONFIG.DELAYS.SHORT);
      }
      throw new Error(`Element ${selector} did not disappear within ${timeout}ms`);
    },

    // Find element by text content (legacy method)
    async waitForElementByText(selector, textOptions, parent = document, timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
      const startedAt = Date.now();
      const texts = Array.isArray(textOptions) ? textOptions : [textOptions];
      
      while (Date.now() - startedAt < timeout) {
        const elements = parent.querySelectorAll(selector);
        const element = Array.from(elements).find(el => 
          texts.some(text => 
            el.textContent.trim() === text || 
            (text === UI_CONFIG.STRINGS.DELETE && el.querySelector(".text-token-text-error"))
          )
        );
        if (element) return element;
        await this.delay(UI_CONFIG.DELAYS.SHORT);
      }
      return null;
    },

    // Find element using multiple strategies (language-independent)
    async waitForElementByStrategy(operation, parent = document, timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
      const strategies = UI_CONFIG.BUTTON_STRATEGIES[operation.toUpperCase()];
      if (!strategies) {
        throw new Error(`No strategies defined for operation: ${operation}`);
      }

      const startedAt = Date.now();
      
      while (Date.now() - startedAt < timeout) {
        for (const strategy of strategies) {
          if (strategy === 'text-fallback') {
            // Fallback to text matching with multiple languages
            let textOptions;
            if (operation === 'DELETE') {
              textOptions = [
                UI_CONFIG.STRINGS.DELETE,
                UI_CONFIG.STRINGS.DELETE_CN,
                UI_CONFIG.STRINGS.DELETE_TW,
                UI_CONFIG.STRINGS.DELETE_JP,
                UI_CONFIG.STRINGS.DELETE_KR,
                UI_CONFIG.STRINGS.DELETE_DE,
                UI_CONFIG.STRINGS.DELETE_FR,
                UI_CONFIG.STRINGS.DELETE_ES,
                UI_CONFIG.STRINGS.DELETE_PT,
                UI_CONFIG.STRINGS.DELETE_IT,
                UI_CONFIG.STRINGS.DELETE_RU
              ];
            } else {
              textOptions = [
                UI_CONFIG.STRINGS.ARCHIVE,
                UI_CONFIG.STRINGS.ARCHIVE_CN,
                UI_CONFIG.STRINGS.ARCHIVE_TW,
                UI_CONFIG.STRINGS.ARCHIVE_JP,
                UI_CONFIG.STRINGS.ARCHIVE_KR,
                UI_CONFIG.STRINGS.ARCHIVE_DE,
                UI_CONFIG.STRINGS.ARCHIVE_FR,
                UI_CONFIG.STRINGS.ARCHIVE_ES,
                UI_CONFIG.STRINGS.ARCHIVE_PT,
                UI_CONFIG.STRINGS.ARCHIVE_IT,
                UI_CONFIG.STRINGS.ARCHIVE_RU
              ];
            }
            
            const elements = parent.querySelectorAll('div[role="menuitem"]');
            const element = Array.from(elements).find(el => 
              textOptions.some(text => el.textContent.trim() === text)
            );
            
            if (element) {
              console.log(`Found ${operation} button using text fallback strategy`);
              return element;
            }
          } else {
            // Try CSS selector strategy
            const element = parent.querySelector(strategy);
            if (element) {
              console.log(`Found ${operation} button using strategy: ${strategy}`);
              return element;
            }
          }
        }
        
        await this.delay(UI_CONFIG.DELAYS.SHORT);
      }
      
      return null;
    },

    // Get selected conversations
    getSelectedConversations() {
      return [...document.querySelectorAll(UI_CONFIG.SELECTORS.conversationsCheckbox)];
    },

    // Remove all checkboxes
    removeAllCheckboxes() {
      const checkboxes = document.querySelectorAll(`.${CSS_CLASSES.CHECKBOX}`);
      checkboxes.forEach(checkbox => checkbox.remove());
    },

    // Show notification
    showNotification(message, type = 'info') {
      console.log(`[${type.toUpperCase()}] ${message}`);
      if (type === 'error') {
        alert(message);
      }
    }
  };

  // Chrome API utilities
  const ChromeUtils = {
    // Get user info with error handling
    getUserInfo() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getUserInfo" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.userInfo);
          }
        });
      });
    },

    // Send progress update
    sendProgress(buttonId, progress) {
      chrome.runtime.sendMessage({
        action: "updateProgress",
        buttonId: buttonId,
        progress: progress
      });
    },

    // Send operation complete
    sendComplete(buttonId) {
      chrome.runtime.sendMessage({
        action: "operationComplete",
        buttonId: buttonId
      });
    }
  };

  // API utilities
  const APIUtils = {
    // Generic API call with error handling
    async makeRequest(endpoint, options = {}) {
      try {
        const url = `${API_CONFIG.BASE_URL}${endpoint}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          ...options
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.error(`API request failed for ${endpoint}:`, error);
        throw error;
      }
    },

    // Send analytics event
    async sendEvent(action, count) {
      try {
        const userInfo = await ChromeUtils.getUserInfo();
        const data = {
          user_id: userInfo.id || "unknown",
          timestamp: CommonUtils.generateTimestamp(),
          action: action,
          count: count
        };

        await this.makeRequest(API_CONFIG.ENDPOINTS.SEND_EVENT, {
          method: 'POST',
          body: JSON.stringify(data)
        });

        console.log(`Event '${action}' sent successfully`);
      } catch (error) {
        console.error(`Error sending '${action}' event:`, error);
      }
    },

    // Check payment status
    async checkPaymentStatus(userId) {
      const endpoint = `${API_CONFIG.ENDPOINTS.CHECK_PAYMENT}?user_id=${encodeURIComponent(userId)}`;
      return await this.makeRequest(endpoint);
    }
  };

  // Export to global scope
  window.CommonUtils = CommonUtils;
  window.ChromeUtils = ChromeUtils;
  window.APIUtils = APIUtils;

  // For backward compatibility
  window.getUserInfo = ChromeUtils.getUserInfo;
  window.sendEventAsync = APIUtils.sendEvent;

} else {
  console.log("utils.js already loaded, skipping re-initialization");
}
