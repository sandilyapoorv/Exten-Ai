# Chrome Groq Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Manifest V3 side-panel extension that lets users chat with Groq using their own API key, attach website context, select a screenshot region, and keep all extension data local.

**Architecture:** Use a dependency-free MV3 extension. Keep browser-specific orchestration in `background.js`, page interaction in `content.js`, UI logic in `sidepanel.js`, and pure logic in `src/core.js` so key behavior can be tested with Node.

**Tech Stack:** Chrome Manifest V3, plain HTML/CSS/JavaScript, `chrome.sidePanel`, `chrome.storage.local`, `chrome.tabs.captureVisibleTab`, Groq OpenAI-compatible chat completions API, Node built-in test runner.

---

### Task 1: Core Utilities And Tests

**Files:**
- Create: `package.json`
- Create: `src/core.js`
- Create: `tests/core.test.js`

- [ ] **Step 1: Add Node test script**

Create `package.json`:

```json
{
  "name": "exten-ai",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "check": "node --check background.js && node --check content.js && node --check sidepanel.js && node --check src/core.js"
  }
}
```

- [ ] **Step 2: Write tests for pure behavior**

Create `tests/core.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroqPayload,
  cropSelectionToViewport,
  formatWebsiteContext,
  limitText,
  normalizeHistory
} from '../src/core.js';

test('limitText trims long text and preserves short text', () => {
  assert.equal(limitText('short', 10), 'short');
  assert.equal(limitText('abcdef', 4), 'abcd...');
});

test('formatWebsiteContext includes title, url, selected text, and body text', () => {
  const text = formatWebsiteContext({
    title: 'Example',
    url: 'https://example.com',
    selectedText: 'chosen',
    metaDescription: 'desc',
    headings: ['One', 'Two'],
    bodyText: 'Page body'
  });

  assert.match(text, /Title: Example/);
  assert.match(text, /URL: https:\/\/example.com/);
  assert.match(text, /Selected text: chosen/);
  assert.match(text, /Headings: One; Two/);
  assert.match(text, /Page body/);
});

test('buildGroqPayload creates text-only chat payload', () => {
  const payload = buildGroqPayload({
    model: 'llama-3.1-8b-instant',
    history: [{ role: 'user', content: 'hello' }],
    message: 'world',
    contextText: 'Context'
  });

  assert.equal(payload.model, 'llama-3.1-8b-instant');
  assert.equal(payload.messages.at(-1).role, 'user');
  assert.match(payload.messages.at(-1).content, /Context/);
  assert.match(payload.messages.at(-1).content, /world/);
});

test('buildGroqPayload creates multimodal content when image is attached', () => {
  const payload = buildGroqPayload({
    model: 'llama-3.2-11b-vision-preview',
    history: [],
    message: 'what is this',
    imageDataUrl: 'data:image/png;base64,abc'
  });

  assert.equal(payload.messages[1].content[0].type, 'text');
  assert.equal(payload.messages[1].content[1].type, 'image_url');
});

test('cropSelectionToViewport clamps coordinates', () => {
  assert.deepEqual(
    cropSelectionToViewport({ x: -5, y: 10, width: 200, height: 100 }, { width: 100, height: 80 }),
    { x: 0, y: 10, width: 100, height: 70 }
  );
});

test('normalizeHistory removes invalid messages and caps history', () => {
  const history = Array.from({ length: 60 }, (_, index) => ({ role: 'user', content: `m${index}` }));
  const normalized = normalizeHistory([...history, { role: 'bad', content: 1 }], 50);
  assert.equal(normalized.length, 50);
  assert.equal(normalized[0].content, 'm10');
});
```

- [ ] **Step 3: Implement pure utilities**

Create `src/core.js` with exported functions for text limiting, history normalization, website context formatting, Groq payload creation, and viewport crop clamping.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: all tests pass.

### Task 2: Chrome Extension Shell

**Files:**
- Create: `manifest.json`
- Create: `background.js`
- Create: `sidepanel.html`
- Create: `sidepanel.css`
- Create: `sidepanel.js`
- Create: `content.js`

- [ ] **Step 1: Create Manifest V3 config**

Create a Chrome MV3 manifest with side panel, background service worker, content script, permissions for `sidePanel`, `storage`, `activeTab`, `scripting`, and `tabs`, and host permissions for `https://api.groq.com/*`.

- [ ] **Step 2: Create background service worker**

Add side-panel behavior on toolbar click, active tab lookup, content-script messaging, and visible-tab screenshot capture.

- [ ] **Step 3: Create side panel markup and styles**

Build a compact chat UI with API key settings, model selector, "Use this website", "Select part", "Clear history", message list, attachment preview, text input, and send button.

- [ ] **Step 4: Create content script**

Implement page context extraction and rectangular selection overlay. Return selection coordinates in viewport pixels.

- [ ] **Step 5: Create side panel logic**

Implement local storage reads/writes, chat rendering, Groq requests, active tab context actions, screenshot crop attachment, error messages, and history clearing.

- [ ] **Step 6: Run syntax checks**

Run: `npm run check`

Expected: all JavaScript files pass syntax checks.

### Task 3: Manual Verification Notes

**Files:**
- Create: `docs/manual-test.md`

- [ ] **Step 1: Document load and smoke test**

Create manual test instructions for loading the unpacked extension from `chrome://extensions`, saving a Groq key, opening the side panel, sending a message, using website context, selecting a region, and clearing history.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run check
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
```

Expected: tests pass, syntax checks pass, manifest parses.

## Self-Review

The plan covers the approved spec: Chrome MV3 shell, side panel, Groq key, local storage, chat history, website context, selected screenshot region, direct Groq calls, privacy messaging, and manual verification. The implementation intentionally avoids a build system and external dependencies for the first Chrome Web Store version.
