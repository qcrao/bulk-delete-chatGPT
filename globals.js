if (typeof window.globalsLoaded === "undefined") {
  console.log("globals.js loaded");

  window.globalsLoaded = true;

  // Global state management
  const GlobalState = {
    shiftPressed: false,
    lastCheckedCheckbox: null,
    
    // State setters
    setShiftPressed(pressed) {
      this.shiftPressed = pressed;
    },
    
    setLastCheckedCheckbox(checkbox) {
      this.lastCheckedCheckbox = checkbox;
    },
    
    // State getters  
    isShiftPressed() {
      return this.shiftPressed;
    },
    
    getLastCheckedCheckbox() {
      return this.lastCheckedCheckbox;
    }
  };

  // Export to global scope
  window.GlobalState = GlobalState;
  
  // For backward compatibility
  window.shiftPressed = false;
  window.lastCheckedCheckbox = null;

} else {
  console.log("globals.js already loaded, skipping re-initialization");
}
