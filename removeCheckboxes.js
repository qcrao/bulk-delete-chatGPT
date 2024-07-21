function removeCheckboxesAndReload() {
  const checkboxes = document.querySelectorAll(`.${CHECKBOX_CLASS}`);
  checkboxes.forEach(checkbox => checkbox.remove());

  // Refresh the page after removing all checkboxes
  location.reload();
}

removeCheckboxesAndReload();