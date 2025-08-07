console.log("toggleCheckboxes.js loaded");

function toggleCheckboxes() {
  try {
    const checkboxes = document.querySelectorAll(`.${CSS_CLASSES.CHECKBOX}`);
    console.log(`Toggling ${checkboxes.length} checkboxes`);
    
    checkboxes.forEach((checkbox) => {
      checkbox.checked = !checkbox.checked;
    });
    
    console.log("Checkboxes toggled successfully");
  } catch (error) {
    console.error("Error toggling checkboxes:", error);
    CommonUtils.showNotification(`Error toggling checkboxes: ${error.message}`, 'error');
  }
}

toggleCheckboxes();