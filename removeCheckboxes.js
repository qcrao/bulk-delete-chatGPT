console.log("removeCheckboxes.js loaded");

function removeCheckboxesAndReload() {
  try {
    const checkboxes = document.querySelectorAll(`.${CSS_CLASSES.CHECKBOX}`);
    console.log(`Removing ${checkboxes.length} checkboxes`);
    
    checkboxes.forEach(checkbox => checkbox.remove());
    
    console.log("Checkboxes removed, reloading page");
    // Refresh the page after removing all checkboxes
    location.reload();
  } catch (error) {
    console.error("Error removing checkboxes:", error);
    CommonUtils.showNotification(`Error removing checkboxes: ${error.message}`, 'error');
  }
}

removeCheckboxesAndReload();