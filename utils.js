// Define getUserInfo function
function getUserInfo() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "getUserInfo" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response.userInfo);
      }
    });
  });
}

async function sendEventAsync(count) {
  try {
    const userInfo = await getUserInfo();
    const timestamp = new Date().toISOString().replace("T", " ").substr(0, 19);

    const data = {
      user_id: userInfo.id || "unknown",
      timestamp: timestamp,
      action: "delete",
      count: count,
    };

    const response = await fetch(
      "https://bulk-delete-chatgpt-worker.qcrao.com/send-event",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log("Event sent successfully");
  } catch (error) {
    console.error("Error sending event:", error);
  }
}
