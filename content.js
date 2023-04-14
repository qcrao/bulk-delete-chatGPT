console.log('content.js is running');

// 向每个会话前添加复选框
// 向每个会话前添加复选框
// function addCheckboxes() {
//     const conversations = document.querySelectorAll(
//       '.flex.flex-col.gap-2.pb-2.text-gray-100.text-sm > .flex.py-3.px-3.items-center.gap-3.relative.rounded-md.hover\\:bg-\\[\\#2A2B32\\].cursor-pointer.break-all.hover\\:pr-4.group'
//     );
  
//     conversations.forEach((conversation) => {
//       const checkbox = document.createElement('input');
//       checkbox.type = 'checkbox';
//       checkbox.className = 'conversation-checkbox';
//       conversation.insertBefore(checkbox, conversation.firstChild);
//     });
// }

document.addEventListener("fetch", (event) => {
    const response = event.detail.response;
  
    if (response) {
      console.log("Result found:", response);
      // 在这里执行你的逻辑
    }
  });
  
  
  
function addCheckboxes() {
    console.log(`try to addCheckboxes...`);
    const conversations = document.querySelectorAll(
      '.flex.flex-col.gap-2.pb-2.text-gray-100.text-sm > .flex.py-3.px-3.items-center.gap-3.relative.rounded-md.hover\\:bg-\\[\\#2A2B32\\].cursor-pointer.break-all.hover\\:pr-4.group'
    );
  
    conversations.forEach((conversation) => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'conversation-checkbox';
      checkbox.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      conversation.insertBefore(checkbox, conversation.firstChild);
    });
  }
  

  
  
  
  
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'add_checkboxes') {
        addCheckboxes();
    } else if (request.message === 'delete_selected_conversations') {
        deleteSelectedConversations();
    }
});

async function fetchAllConversations(offset = 0, limit = 20) {
    const response = await fetch(
      `https://chat.openai.com/backend-api/conversations?offset=${offset}&limit=${limit}`
    );
    const data = await response.json();
    const conversations = data.items;
  
    if (conversations.length === limit) {
      const nextConversations = await fetchAllConversations(offset + limit, limit);
      return [...conversations, ...nextConversations];
    }
  
    return conversations;
  }
  
  async function buildTitleToIdMap() {
    const conversations = await fetchAllConversations();
    const titleToIdMap = {};
  
    conversations.forEach((conversation) => {
      const title = conversation.title;
      if (titleToIdMap[title]) {
        titleToIdMap[title].push(conversation.id);
      } else {
        titleToIdMap[title] = [conversation.id];
      }
    });
  
    return titleToIdMap;
  }
  
  async function deleteSelectedConversations() {
    const titleToIdMap = await buildTitleToIdMap();
    const checkboxes = document.querySelectorAll('.conversation-checkbox:checked');
    const conversationIds = [];
  
    checkboxes.forEach((checkbox) => {
      const titleElement = checkbox.parentElement.querySelector('.text-ellipsis');
      const title = titleElement.textContent;
      const conversationId = titleToIdMap[title].shift();
  
      if (conversationId) {
        conversationIds.push(conversationId);
      }
    });
  
    await Promise.all(
      conversationIds.map(async (id) => {
        console.log(`try to delete conversation with ID: ${id}`);
        await fetch(`https://chat.openai.com/backend-api/conversation/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'deleted',
          }),
        });
  
        console.log(`Deleted conversation with ID: ${id}`);
      })
    );
  
    location.reload();
  }
  
  
  

