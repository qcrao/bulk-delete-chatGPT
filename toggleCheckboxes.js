function toggleCheckboxes() {
  const conversations = document.querySelectorAll(".conversation-checkbox");

  conversations.forEach((checkbox) => {
    checkbox.checked = !checkbox.checked;
  });
}

toggleCheckboxes();
