function addCheckboxes() {
    const conversations = document.querySelectorAll('.flex.py-3.px-3.items-center.gap-3.relative.rounded-md');
  
    conversations.forEach((conversation, index) => {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'conversation-checkbox';
        checkbox.dataset.index = index;
  
        conversation.insertAdjacentElement('afterbegin', checkbox);
  
        // Add click event listener to the conversation title
        const titleElement = conversation.querySelector('.flex-1.text-ellipsis.max-h-5.overflow-hidden.break-all.relative');
        if (titleElement) {
            titleElement.style.cursor = 'default'; // Ensure the cursor is the default arrow pointer
            titleElement.addEventListener('click', function(event) {
                // Toggle the checkbox state
                checkbox.checked = !checkbox.checked;
                // Prevent the event from propagating further
                event.stopPropagation();
            });
  
            // Ensure the checkbox click doesn't trigger the title's click event
            checkbox.addEventListener('click', function(event) {
                event.stopPropagation();
            });
        }
    });
  }
  
  addCheckboxes();
  