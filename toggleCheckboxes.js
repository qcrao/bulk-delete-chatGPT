function toggleCheckboxes() {
  const conversations = document.querySelectorAll(`.${CHECKBOX_CLASS}`);

  conversations.forEach((checkbox) => {
    checkbox.checked = !checkbox.checked;
  });
}

toggleCheckboxes();