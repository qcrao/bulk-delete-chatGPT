chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (
        details.url.includes(
          "https://chat.openai.com/backend-api/conversations?"
        )
      ) {
        chrome.tabs.sendMessage(details.tabId, {
          message: "conversations_data_fetched",
        });
      }
    },
    { urls: ["<all_urls>"] }
  );
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === "fetch_conversations_data") {
      fetch(request.url)
        .then((response) => response.json())
        .then((data) => {
          sendResponse({ data: data.items });
        })
        .catch((error) => {
          console.error("Error fetching conversations data:", error);
        });
      return true;
    }
  });
  