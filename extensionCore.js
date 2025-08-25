/**
 * ChatGPT Bulk Delete - Core Extension System
 * 
 * This module provides the core infrastructure for the extension:
 * - Unified namespace management
 * - Module registration and lifecycle
 * - State management and error handling
 */

(function() {
  'use strict';

  // Prevent duplicate initialization
  if (window.ChatGPTBulkDelete && window.ChatGPTBulkDelete.initialized) {
    console.log("ChatGPT Bulk Delete core already initialized");
    return;
  }

  // Core namespace
  window.ChatGPTBulkDelete = {
    // Version and metadata
    version: '5.11',
    initialized: false,
    
    // Module registry
    modules: new Map(),
    
    // State management
    state: {
      initialized: false,
      modulesLoaded: new Set(),
      operationsInProgress: new Set()
    },

    // Configuration and constants
    config: {
      debug: true,
      namespace: 'ChatGPTBulkDelete'
    },

    // Core utilities
    utils: {
      /**
       * Safe logging with namespace prefix
       */
      log: function(level, ...args) {
        const prefix = `[${window.ChatGPTBulkDelete.config.namespace}]`;
        if (console[level]) {
          console[level](prefix, ...args);
        }
      },

      /**
       * Debug logging (only when debug mode is on)
       */
      debug: function(...args) {
        if (window.ChatGPTBulkDelete.config.debug) {
          this.log('log', '[DEBUG]', ...args);
        }
      },

      /**
       * Check if DOM element exists with retry mechanism
       */
      waitForElement: function(selector, timeout = 5000, interval = 100) {
        return new Promise((resolve, reject) => {
          const startTime = Date.now();
          
          const check = () => {
            const element = document.querySelector(selector);
            if (element) {
              resolve(element);
            } else if (Date.now() - startTime >= timeout) {
              reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            } else {
              setTimeout(check, interval);
            }
          };
          
          check();
        });
      },

      /**
       * Safe DOM manipulation with error handling
       */
      safeQuery: function(selector, context = document) {
        try {
          return context.querySelector(selector);
        } catch (error) {
          this.log('error', 'DOM query failed:', selector, error);
          return null;
        }
      },

      /**
       * Safe DOM manipulation for multiple elements
       */
      safeQueryAll: function(selector, context = document) {
        try {
          return context.querySelectorAll(selector);
        } catch (error) {
          this.log('error', 'DOM queryAll failed:', selector, error);
          return [];
        }
      }
    },

    /**
     * Module registration system
     */
    registerModule: function(name, moduleFactory) {
      try {
        if (this.modules.has(name)) {
          this.utils.debug(`Module ${name} already registered, skipping`);
          return this.modules.get(name);
        }

        this.utils.debug(`Registering module: ${name}`);
        
        // Create module instance
        const moduleInstance = typeof moduleFactory === 'function' 
          ? moduleFactory(this) 
          : moduleFactory;
        
        // Store module
        this.modules.set(name, moduleInstance);
        this.state.modulesLoaded.add(name);
        
        this.utils.debug(`Module ${name} registered successfully`);
        return moduleInstance;
        
      } catch (error) {
        this.utils.log('error', `Failed to register module ${name}:`, error);
        return null;
      }
    },

    /**
     * Get registered module
     */
    getModule: function(name) {
      return this.modules.get(name);
    },

    /**
     * Operation execution with state tracking
     */
    executeOperation: function(operationName, operationFn) {
      try {
        if (this.state.operationsInProgress.has(operationName)) {
          this.utils.debug(`Operation ${operationName} already in progress, skipping`);
          return;
        }

        this.utils.debug(`Starting operation: ${operationName}`);
        this.state.operationsInProgress.add(operationName);

        const result = operationFn();
        
        // Handle promises
        if (result && typeof result.then === 'function') {
          return result.finally(() => {
            this.state.operationsInProgress.delete(operationName);
            this.utils.debug(`Operation ${operationName} completed`);
          });
        } else {
          this.state.operationsInProgress.delete(operationName);
          this.utils.debug(`Operation ${operationName} completed`);
          return result;
        }
        
      } catch (error) {
        this.state.operationsInProgress.delete(operationName);
        this.utils.log('error', `Operation ${operationName} failed:`, error);
        
        // Show user-friendly error notification if available
        const CommonUtils = this.getModule('CommonUtils');
        if (CommonUtils && CommonUtils.showNotification) {
          CommonUtils.showNotification(`Error in ${operationName}: ${error.message}`, 'error');
        }
        
        throw error;
      }
    },

    /**
     * Auto-discover and register existing modules from global scope
     */
    discoverExistingModules: function() {
      const moduleMapping = [
        { globalName: 'CommonUtils', moduleName: 'CommonUtils' },
        { globalName: 'DOMHandler', moduleName: 'DOMHandler' },
        { globalName: 'EventHandler', moduleName: 'EventHandler' },
        { globalName: 'ConversationHandler', moduleName: 'ConversationHandler' },
        { globalName: 'ChromeUtils', moduleName: 'ChromeUtils' }
      ];

      moduleMapping.forEach(({ globalName, moduleName }) => {
        if (window[globalName] && !this.modules.has(moduleName)) {
          this.modules.set(moduleName, window[globalName]);
          this.state.modulesLoaded.add(moduleName);
          this.utils.debug(`Auto-registered existing module: ${moduleName}`);
        }
      });
    },

    /**
     * Initialize core system
     */
    init: function() {
      if (this.initialized) {
        this.utils.debug('Core already initialized');
        return;
      }

      try {
        this.utils.log('log', `Initializing ChatGPT Bulk Delete v${this.version}`);
        
        // Auto-discover existing modules after a short delay to let them load
        setTimeout(() => {
          this.discoverExistingModules();
        }, 100);
        
        // Mark as initialized
        this.initialized = true;
        this.state.initialized = true;
        
        this.utils.debug('Core system initialized successfully');
        
      } catch (error) {
        this.utils.log('error', 'Failed to initialize core system:', error);
        this.initialized = false;
        this.state.initialized = false;
        throw error;
      }
    }
  };

  // Initialize the core system
  window.ChatGPTBulkDelete.init();

  // Expose to global for debugging
  if (window.ChatGPTBulkDelete.config.debug) {
    window.CBD = window.ChatGPTBulkDelete;
  }

})();