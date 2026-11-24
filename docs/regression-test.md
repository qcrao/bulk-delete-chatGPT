# Release regression test: bulk delete

Run this after every change and before packaging a release. It deletes real
(throwaway) conversations in a signed-in ChatGPT account with this repo's code,
so it catches selector breakage, slow or flaky menu opening, and server-side
failures that unit checks can't.

```bash
scripts/regression-delete.sh        # 3 test conversations (the minimum)
scripts/regression-delete.sh 5      # more, e.g. to watch the batch delays
```

The last line is `RESULT: PASS` or `RESULT: FAIL (n)`. The exit code matches.

## Prerequisites (one-time)

- ego lite (`ego-browser`) is installed and running.
- ChatGPT is signed in in ego-browser. The test is written for a Pro account
  (no per-run cap).
- This repo is loaded as an unpacked extension in ego-browser
  (`chrome://extensions` → Developer mode → Load unpacked → this folder).
  A Chrome Web Store copy can stay installed next to it: the script picks the
  extension whose `conversationHandler.js` matches the file on disk.

## What the script does

1. **Finds and reloads the unpacked extension**, so the running code is what is on disk.
2. **Creates N conversations** named `BDC regression test i/N`. If the home
   page opens in "Work" mode, it switches to "Chat" first.
3. **Enters the extension's content-script world** on chatgpt.com through CDP
   (`Runtime.executionContextCreated` → the isolated world whose origin is the
   extension). A popup opened in a normal tab has no `activeTab` permission, so
   it can't inject into the page. Running the files directly is the same code
   path the popup takes after its checks.
4. **Selects only the test conversations.** It runs `addCheckboxes.js`, ticks the
   test rows, then checks `CommonUtils.getSelectedConversations()`. If the
   selection is anything else it aborts before deleting.
5. **Runs `bulkDeleteConversations.js`** with the default delay settings
   (`baseDelayMs: 1200`, auto slowdown, no cap).
6. **Records a timeline** (menu open, confirm open/closed, row gone) from a
   MutationObserver in the page, plus the extension's console log.
7. **Checks the result:**
   - all N rows left the sidebar
   - the first one was gone within 3 s (v7.12 baseline: about 1.5 s)
   - the extension logged `DELETE completed: N processed, 0 skipped`
   - every three-dot menu opened on the first try (`2a.` lines only)
   - `GET /backend-api/conversation/<id>` returns `conversation_deleted` for each
8. **Cleans up.** It closes the ego-browser task space on PASS and leaves it open on FAIL.

## Baseline (v7.12, 2026-11-24, 3 conversations)

| | menu open | confirm open | gone |
|---|---|---|---|
| chat 1 | 828 ms | 1174 ms | 1464 ms |
| chat 2 | 3040 ms | 3388 ms | 3697 ms |
| chat 3 | 5261 ms | 5617 ms | 5914 ms |

Of the time before the first chat, about 500 ms is the uncached remote UI
config (capped at 800 ms). Between chats, the gap is the 1200 ms default delay.

## Not covered

- **The popup itself:** sign-in, `claimUsage`, the free-plan cap, and the
  run-warning notice. To check those, open the popup from the toolbar icon in
  real Chrome and run a delete by hand.
- **Bulk archive.**
- **The backend fallback** (`chatgptApi.js`). It only runs when sidebar clicks fail.
