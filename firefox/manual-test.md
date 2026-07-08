# Manual Test: Exten AI Firefox Add-on

## Load The Add-on

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `/home/primal/Sandilyapoorv/Exten-ai/firefox/manifest.json`.
4. Pin the Exten AI toolbar button if Firefox hides it in the extensions menu.

## Core Checks

1. Click the Exten AI toolbar button.
   - Expected: Firefox opens the native Exten AI sidebar.
2. Open the sidebar on a normal website.
   - Expected: onboarding appears until site access and the Groq key are stored.
3. Complete onboarding.
   - Expected: the key is stored locally and chat view appears.
4. Switch to a different normal website tab while the sidebar stays open.
   - Expected: the sidebar stays open, but the active chat context becomes tab-specific.
5. Click `New chat`.
   - Expected: a fresh blank chat is created for the current tab.

## Restricted Page Checks

1. Open a restricted Firefox page such as `about:addons`.
2. Open Exten AI from the toolbar button.
   - Expected: the sidebar shows a centered blocked state.
   - Expected: the composer and chat actions are hidden.
   - Expected blocked copy: `Firefox does not allow extensions to read this page.`

## Attachment Checks

1. On a normal website, attach `Use page`.
   - Expected: page context attaches to the current chat.
2. Attach `Use console`, then trigger a console error on the page and attach console again.
   - Expected: recent console entries appear in the attachment state.
3. Attach `Select area`.
   - Expected: Firefox captures the visible tab, lets you drag a region, and attaches the cropped image preview.
4. Attach `Search web`, then send a prompt.
   - Expected: DuckDuckGo HTML results are fetched in the background and attached before the Groq request.

## History Checks

1. Send a message in one tab.
2. Switch to another tab and send a different message.
   - Expected: each tab gets its own thread flow.
3. Archive a chat.
   - Expected: it leaves history and appears in archive.
4. Delete a chat.
   - Expected: the in-extension confirm dialog appears before permanent removal.
