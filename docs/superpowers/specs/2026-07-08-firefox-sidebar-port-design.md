# Firefox Sidebar Port Design

**Goal:** Adapt `firefox/` into a real Firefox add-on that uses Firefox's native extension sidebar while preserving the existing Exten AI product behavior as closely as Firefox allows.

## Scope

The Chrome build in `chrome/` is complete and out of scope. All changes happen in `firefox/`.

## Product Boundary

- The main UI stays in the sidebar.
- Clicking the toolbar icon opens the native Firefox sidebar for Exten AI.
- The sidebar is not force-opened by background tab events because Firefox requires `sidebarAction.open()` to run in direct response to a user action.
- Chat state remains tab-oriented:
  - opening the extension in a tab creates a fresh chat for that tab
  - moving to a different tab while the sidebar is open should switch the sidebar state to a tab-specific chat
  - if a tab has no active thread yet, create a fresh blank thread for it
- Existing local-first behavior stays:
  - Groq API key stored locally
  - chat/thread/archive/delete stored locally
  - page, console, web search, and selected-area attachments

## Technical Design

### Manifest

Replace Chrome `sidePanel` usage with Firefox `sidebar_action`.

- Keep `manifest_version: 3` only if the used Firefox APIs remain compatible.
- Remove `sidePanel` permission.
- Add `sidebar_action` with `default_title` and `default_panel`.
- Keep the toolbar `action` so the user can click the extension icon.
- Preserve required permissions for tabs, storage, scripting-style behavior, and capture.

### Background Runtime

Replace `chrome.sidePanel.*` logic in `firefox/background.js`.

- Use `browser.action.onClicked` to open the sidebar with `browser.sidebarAction.open()`.
- Keep message handlers for:
  - active tab lookup
  - page context
  - region select
  - console capture
  - screenshot capture
  - web search
- Remove Chrome-only per-tab side panel enablement code.
- Update blocked-page checks for Firefox-specific schemes such as `about:`, `moz-extension:`, and other built-in pages that do not allow content access.

### Sidebar App

Keep the app in `firefox/sidepanel.html`, `firefox/sidepanel.css`, and `firefox/sidepanel.js`.

- Keep onboarding and premium UI intact.
- Update copy from Chrome-specific wording to Firefox wording.
- Preserve tab-scoped thread creation and switching using the current active tab from background messages.
- Continue to block all chat actions when the current page cannot be read.

### Docs

Update Firefox docs to reflect real loading and testing steps through `about:debugging#/runtime/this-firefox`.

## Risks

- Firefox and Chrome differ on extension UI lifecycle. The sidebar can persist at the window level even though chats are tab-scoped. The implementation should therefore switch thread state by active tab rather than attempting Chrome-style open/close automation.
- Some Chrome content-script injection paths may need Firefox-compatible fallbacks.

## Acceptance Criteria

- Loading `firefox/manifest.json` in Firefox succeeds.
- Clicking the toolbar icon opens the Exten AI sidebar.
- The sidebar does not rely on `chrome.sidePanel`.
- Page-read failures show a centered blocked state with no active composer actions.
- Tab-specific chat behavior continues to work inside the sidebar.
- Firefox docs describe the actual install and test flow.
