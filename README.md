# [🌟Ads：MyNav chrome extension](https://chromewebstore.google.com/detail/my-nav/hagcohiondnnjimialmlneleljfmkflf?authuser=0&hl=en)

# bulk-delete-chatGPT

English | [中文版本](./README-CN.md)

## Project Introduction

`bulk-delete-chatGPT` is a Chrome extension designed to bulk-delete conversations on ChatGPT pages. This extension allows you to quickly and easily manage conversations on ChatGPT pages. It features a clean and intuitive user interface, providing an efficient way to perform bulk deletion of conversations.

## Screenshot

<table>
  <tr>
    <td><img src="./assets/1.jpg" alt="图片1" style="max-width: 100%;"></td>
    <td><img src="./assets/2.jpg" alt="图片2" style="max-width: 100%;"></td>
    <td><img src="./assets/3.jpg" alt="图片3" style="max-width: 100%;"></td>
  </tr>
</table>

## Installation
### Chrome:

- Go to the [ChatGPT Bulk Delete Chrome extension page](https://chrome.google.com/webstore/detail/chatgpt-bulk-delete/effkgioceefcfaegehhfafjneeiabdjg) in the Chrome Web Store.
- Click the "Add to Chrome" button to install the extension.

### Firefox:
1. **Download the Extension**  
   - Go to the [GitHub repository](https://github.com/qcrao/bulk-delete-chatGPT).  
   - Click **Code → Download ZIP** or use this [direct link](https://github.com/qcrao/bulk-delete-chatGPT/archive/refs/heads/master.zip).  

2. **Extract the Files**  
   - Locate the downloaded `.zip` file.  
   - Extract the contents to a folder.  

3. **Load the Extension in Firefox**  
   - Open **Firefox** and navigate to:  
     ```
     about:debugging#/runtime/this-firefox
     ```
   - Click **"Load Temporary Add-on..."**.  
   - Select the **manifest.json** file from the extracted folder.  

📌 **Note:** This extension is **not signed yet**, so you will need to **reload manifest.json manually** each time you restart Firefox.  

## Usage Instructions
- Open the [ChatGPT website page](https://chat.openai.com/).
- Click the `bulk-delete-chatGPT` extension icon in the top-right corner of your browser.
- Click the "Add checkboxes" button. The extension will automatically add a checkbox in front of each conversation on the ChatGPT page.
- Select the conversations you wish to delete.
- Click the "Bulk delete" button, and the selected conversations will be deleted.
- If needed, you can click the "Remove checkboxes" button to hide the checkboxes.
- It's possible to select all checkboxes between your last selection and the one being selected by holding shift.