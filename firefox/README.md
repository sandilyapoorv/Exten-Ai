## Firefox Folder

This folder is the Firefox add-on target for Exten AI.

Current status:
- This folder is self-contained as a separate browser target.
- It is separated from `chrome/` so Firefox-specific changes can happen without touching the Chrome build.
- The manifest and runtime wiring are adapted for Firefox's native sidebar.
- The toolbar action opens the app through Firefox's `sidebar_action` flow.

Load in Firefox:
1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `/home/primal/Sandilyapoorv/Exten-ai/firefox/manifest.json`.
4. Click the Exten AI toolbar button to open the sidebar.

Folder contents:
- `manifest.json`
- `background.js`
- `content.js`
- `console-capture.js`
- `sidepanel.html`
- `sidepanel.css`
- `sidepanel.js`
- `src/core.js`
- `tests/core.test.js`
- `upi_qr.png`

Local commands from inside this folder:
- `npm run check`
- `npm test`
