# Exten AI

Exten AI is a local-first browser sidebar assistant powered by the user's own Groq API key.

The project is split into two browser targets:

- `chrome/` - Chrome Web Store build
- `firefox/` - Firefox Add-ons build using Firefox's native sidebar

## What It Does

- Opens as a sidebar assistant from the browser toolbar
- Stores the API key, chats, history, archives, and settings locally
- Lets users attach page context, selected page areas, console logs, and web search results
- Sends AI requests directly to Groq with the user's own API key
- Requires no account and uses no Exten AI backend

## Add-ons Listing

Firefox / Thunderbird listing:

https://addons.thunderbird.net/en-US/thunderbird/addon/exten-ai/

## Development

Chrome:

```sh
cd chrome
npm run check
npm test
```

Firefox:

```sh
cd firefox
npm run check
npm test
```

Node is required for the local checks and tests. The unpacked extensions themselves are static browser extension builds.

## Privacy

Exten AI is local-first. Data is stored on the user's device through browser storage. The user controls what they attach or send. AI requests go directly to Groq, and web search runs only when the user chooses it.

