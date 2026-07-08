# Firefox Sidebar Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `firefox/` from a Chrome-shaped copy into a Firefox add-on that opens a native Firefox sidebar and preserves Exten AI's tab-scoped local chat workflow.

**Architecture:** Keep the existing sidebar UI and message flow, but swap the extension shell from Chrome `sidePanel` to Firefox `sidebar_action`. The background script becomes a thin Firefox event bridge that opens the sidebar on toolbar click and continues serving tab/context/screenshot/search requests for the sidebar app.

**Tech Stack:** Firefox WebExtensions APIs, Manifest V3, vanilla HTML/CSS/JavaScript, local extension storage

---

### Task 1: Convert The Firefox Manifest

**Files:**
- Modify: `firefox/manifest.json`

- [ ] **Step 1: Replace Chrome side panel manifest fields with Firefox sidebar fields**

```json
{
  "manifest_version": 3,
  "name": "Exten AI",
  "description": "Local-first Groq AI chat in a Firefox sidebar.",
  "version": "0.1.0",
  "action": {
    "default_title": "Open Exten AI"
  },
  "sidebar_action": {
    "default_title": "Exten AI",
    "default_panel": "sidepanel.html"
  }
}
```

- [ ] **Step 2: Remove the Chrome-only `sidePanel` permission and keep only permissions used by Firefox runtime behavior**

```json
"permissions": [
  "activeTab",
  "scripting",
  "storage",
  "tabs",
  "windows"
]
```

- [ ] **Step 3: Keep the current host permissions and content scripts, then validate the final manifest JSON**

Run: `sed -n '1,220p' firefox/manifest.json`
Expected: `sidebar_action` is present and `sidePanel` is absent

### Task 2: Rewrite The Background Entry For Firefox Sidebar APIs

**Files:**
- Modify: `firefox/background.js`

- [ ] **Step 1: Replace `chrome.sidePanel` initialization with a Firefox toolbar click handler**

```js
const extApi = globalThis.browser ?? globalThis.chrome;

extApi.action.onClicked.addListener(async () => {
  await extApi.sidebarAction.open().catch(() => {});
});
```

- [ ] **Step 2: Keep the existing message contract, but switch all top-level API access through the shared extension API object**

```js
extApi.runtime.onMessage.addListener((message, sender) => {
  return handleMessage(message, sender)
    .catch((error) => ({ ok: false, error: error.message || String(error) }));
});
```

- [ ] **Step 3: Remove Chrome-only per-tab enablement functions and update blocked-page detection**

```js
function isRestrictedUrl(url) {
  return !url || /^(about:|moz-extension:|chrome:|edge:|view-source:|file:)/.test(url);
}
```

- [ ] **Step 4: Keep screenshot, page context, console capture, and web search handlers, then verify syntax**

Run: `node --check firefox/background.js`
Expected: syntax check passes if `node` is available

### Task 3: Make The Sidebar App Firefox-Aware

**Files:**
- Modify: `firefox/sidepanel.js`
- Modify: `firefox/sidepanel.html`

- [ ] **Step 1: Add a shared extension API alias at the top of `firefox/sidepanel.js` and route storage/runtime calls through it**

```js
const extApi = globalThis.browser ?? globalThis.chrome;
```

- [ ] **Step 2: Replace Chrome-specific onboarding and blocked-page strings with Firefox-neutral wording**

```js
body: 'Allow Exten AI to work on websites. Firefox will show the permission prompt now.'
```

```js
function isBlockedPageError(message) {
  return String(message || '').includes('Firefox does not allow extensions to read this page.');
}
```

- [ ] **Step 3: Keep the existing tab-scoped thread logic, but ensure it only depends on background `GET_ACTIVE_TAB` responses rather than Chrome side panel lifecycle**

```js
async function prepareThreadForPanelOpen() {
  const response = await sendBackground({ type: 'GET_ACTIVE_TAB' }).catch(() => null);
  const tab = response?.tab;
  if (!tab?.id) return;
  currentTabId = tab.id;
  const thread = createThread([], tab);
  threads = [thread, ...threads];
  activeThreadId = thread.id;
  await saveThreads();
}
```

- [ ] **Step 4: Verify the blocked-page surface text in the sidebar markup**

```html
<strong>Exten AI cannot read this page</strong>
<span id="blockedReason">Firefox does not allow extensions to read this page.</span>
```

### Task 4: Update Firefox Documentation

**Files:**
- Modify: `firefox/README.md`
- Modify: `firefox/manual-test.md`

- [ ] **Step 1: Rewrite the README status text so it states that the folder is Firefox-adapted**

```md
Current status:
- This folder is self-contained as a Firefox add-on target.
- The manifest and runtime wiring are adapted for Firefox's native sidebar.
```

- [ ] **Step 2: Add actual temporary install steps to the manual test doc**

```md
1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `/home/primal/Sandilyapoorv/Exten-ai/firefox/manifest.json`.
4. Click the Exten AI toolbar button to open the sidebar.
```

- [ ] **Step 3: Add Firefox-specific checks for restricted pages and sidebar opening behavior**

Run: `sed -n '1,220p' firefox/manual-test.md`
Expected: install steps and restricted-page expectations are present

### Task 5: Verify The Firefox Folder End To End

**Files:**
- Review: `firefox/manifest.json`
- Review: `firefox/background.js`
- Review: `firefox/sidepanel.js`
- Review: `firefox/README.md`
- Review: `firefox/manual-test.md`

- [ ] **Step 1: Run fast static verification across the Firefox target**

Run: `node --check firefox/background.js && node --check firefox/content.js && node --check firefox/console-capture.js && node --check firefox/sidepanel.js && node --check firefox/src/core.js`
Expected: all checks pass if `node` is installed

- [ ] **Step 2: If `node` is unavailable, fall back to a file-by-file manifest and source review**

Run: `sed -n '1,220p' firefox/manifest.json`
Expected: Firefox sidebar manifest shape only

- [ ] **Step 3: Confirm no remaining Chrome side panel references exist in the Firefox target**

Run: `rg -n "sidePanel|openPanelOnActionClick|setPanelBehavior|setOptions" firefox`
Expected: no matches

- [ ] **Step 4: Confirm Firefox sidebar references exist where expected**

Run: `rg -n "sidebar_action|sidebarAction|Firefox does not allow extensions to read this page" firefox`
Expected: matches in the manifest, background script, and sidebar UI
