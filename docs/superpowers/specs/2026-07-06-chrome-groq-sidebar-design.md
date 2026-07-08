# Chrome Groq Sidebar Extension Design

## Goal

Build a Chrome Web Store-ready Manifest V3 extension that lets a user bring their own Groq API key and chat with AI from a browser side panel. The extension stores the API key, chat history, and captured context locally on the user's device. It has no account system and no backend.

## Scope

The first version targets Chrome only. Firefox add-on support is explicitly out of scope for this phase.

The extension includes:

- A toolbar icon that opens Chrome's native side panel.
- A chat interface in the side panel.
- A settings area for saving a Groq API key locally.
- Local chat history stored with `chrome.storage.local`.
- A "Use this website" action that adds the current tab's title, URL, and visible/readable text context to the conversation.
- A "Select part" action that lets the user draw a rectangle over the current page, captures the visible tab, crops the selected area locally, and attaches the crop to the next message.
- Direct requests from the extension to Groq using the user's API key.

## Architecture

The extension uses Manifest V3 with these parts:

- `manifest.json`: declares permissions, side panel, service worker, content scripts, and Groq host access.
- `background.js`: configures the side panel, handles tab capture, and coordinates messages between the side panel and content script.
- `sidepanel.html`, `sidepanel.css`, `sidepanel.js`: render the chat UI, settings, history, context controls, and Groq API requests.
- `content.js`: injects page-selection UI and extracts page context on demand.

## Data Flow

API key:

1. User enters a Groq API key in the side panel.
2. The key is stored in `chrome.storage.local`.
3. The key is used only for requests to Groq.

Chat:

1. User sends a message.
2. The side panel combines the message with any selected website context.
3. The side panel calls Groq directly.
4. The user and assistant messages are saved to local storage.

Website context:

1. User clicks "Use this website".
2. The extension asks the active tab content script for title, URL, selected text, headings, meta description, and visible body text.
3. The side panel stores this context as an attachment for the next message.

Region selection:

1. User clicks "Select part".
2. The content script displays a full-page overlay.
3. User drags a rectangle and confirms selection.
4. The background service worker captures the visible tab.
5. The side panel crops the screenshot locally and attaches the image to the next message.

## Privacy

The extension does not use a backend. Data stored locally includes the API key, chat history, page context, and selected screenshot crops. The only remote network calls are direct Groq API calls initiated by the user.

The UI must make clear that the API key and history are local, while prompts and attached context are sent to Groq when the user sends a message.

## Permissions

Required Chrome permissions:

- `sidePanel`: open the native Chrome side panel.
- `storage`: store API key, history, and local settings.
- `activeTab`: work with the user-active page after user action.
- `scripting`: inject or interact with content scripts when needed.
- `tabs`: read active tab metadata and capture visible tab.

Host permissions:

- `https://api.groq.com/*`

## Error Handling

The side panel shows clear errors when:

- No API key is saved.
- Groq returns an authentication or rate-limit error.
- The current page cannot be accessed, such as Chrome internal pages.
- Screenshot capture fails.
- Local storage operations fail.

## Testing

Verification for this phase:

- Static JSON validation for `manifest.json`.
- Basic syntax checks for JavaScript files.
- Manual load path documented for `chrome://extensions`.
- Manual smoke checklist for saving an API key, opening side panel, sending a message, using website context, selecting a region, and clearing history.
