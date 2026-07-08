# Manual Test: Exten AI Chrome Extension

This repo is now split by browser:
- Chrome extension source: `/home/primal/Sandilyapoorv/Exten-ai/chrome`
- Firefox extension source: `/home/primal/Sandilyapoorv/Exten-ai/firefox`

## Load Unpacked Extension

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Click "Load unpacked".
5. Select this project folder: `/home/primal/Sandilyapoorv/Exten-ai/chrome`.
6. Pin "Exten AI" from the extensions menu.

## Smoke Test

1. Click the Exten AI toolbar icon.
2. Confirm the Chrome side panel opens.
3. Confirm the first-run setup appears.
4. Click "Grant all-site access".
5. Confirm Chrome asks for permission to read and change data on websites.
6. Allow the permission.
7. Follow each remaining setup instruction one by one.
8. Open `https://console.groq.com/keys` from the setup link.
9. Create or copy a Groq API key.
10. Paste the key when Exten AI asks for it.
11. Click "Start chatting" and confirm the chat window appears.
12. Type `Say hello in one sentence.` and click "Send".
13. Confirm a response appears in the chat.
14. Open a restricted page such as `chrome://extensions`, open Exten AI, and confirm it shows a centered blocked-page message with no chat actions.
15. Type a multi-line draft and confirm `Shift+Enter` inserts a newline while `Enter` sends the message.
16. Open the mode dropdown, switch between "Instant" and "Thinking" mid-chat, and confirm the label changes.
17. Ask a debugging question in Thinking mode and confirm the answer uses structured sections such as summary, evidence, root cause, fix, and check.
18. Click "New" and confirm the chat becomes empty.
19. Send another short message.
20. Click the History icon beside New and confirm both chats appear.
21. Click a history item and confirm that chat opens.
22. Click "Archive" on a history item and confirm it disappears from History.
23. Click the Archive icon beside New and confirm the archived chat appears there.
24. Click "Restore" and confirm the chat returns to History.
25. Click "Delete" on a history or archive item, confirm inside the Exten AI panel, and confirm the chat is permanently removed.
26. Open a normal website such as `https://example.com`.
27. Click the plus attachment control and choose "Page". Confirm Page is the default option.
28. Confirm the side panel shows the website attachment.
29. Ask `What page am I on?` and confirm the answer uses the attached page context.
30. Ask a second page question without attaching Page again and confirm the same page remains attached.
31. Open a new browser tab and confirm Exten AI is not shown there automatically.
32. Click the extension icon in the new tab and confirm a fresh empty chat opens there.
33. Switch back to the original tab and confirm the original tab's Exten AI chat is still there.
34. Close Exten AI in a tab, click the extension icon again, and confirm a fresh empty chat opens.
35. Reload the web page.
36. Click the plus attachment control and choose "Console" once. Confirm console capture starts without Chrome showing a browser debugging banner.
37. Reproduce the page issue. For a manual test, type this directly into the address bar and press Enter: `javascript:console.error('Exten AI test error')`
38. Open the plus attachment control and choose "Console" again.
39. Ask `What console errors do you see?` and confirm the answer mentions the test error.
40. Open the plus attachment control and choose "Search web".
41. Confirm the side panel says web search is ready for the next send.
42. Ask `latest vite release notes` and confirm Exten AI responds using attached search results without opening a new tab.
43. Ask a follow-up question and confirm the web search attachment remains visible with the last query.
44. Ask a question without attaching page, console, area, or web search context and confirm Exten AI says context is missing instead of guessing.
45. Open the plus attachment control and choose "Area".
46. Drag over a visible region of the page and release.
47. Confirm the selected region preview appears in the side panel.
48. Ask `What is shown in the selected area?` and confirm the answer uses the selected image crop.
49. Confirm the composer shows a plus attachment control, prompt box, and Send. Delete should only be available from History or Archive.

## Expected Chrome Limitations

- Chrome internal pages such as `chrome://extensions` cannot be read or captured by this extension.
- Region selection captures only the visible tab area, not the full scrollable page.
- The visible model choices use Groq text models: "Instant" maps to `llama-3.1-8b-instant`, and "Thinking" maps to `llama-3.3-70b-versatile`.
- Selected screenshot areas are previewed locally, then sent as JPEG data URLs to Groq's vision model when submitted.
- Web search uses browser-side fetches inside the extension and keeps the result set in the side panel instead of opening a search tab.
- Console capture uses an injected page-world console wrapper, not Chrome's `debugger` permission.
- Console capture starts after Exten AI injects the wrapper. It may not include logs from before injection.
- API requests, prompt text, page context, selected screenshot crops, attached web search results, and attached console summaries are sent directly to Groq when a message is submitted.
- Answers should be short and grounded in attached context. If context is missing, Exten AI should say what to attach instead of guessing.
- Instant mode should stay short. Thinking mode should be more extensive, structured, crisp, and grounded.
- Attached page context stays with its chat until a new chat is created or another page is attached.
- Exten AI is tab-only: a side panel opened in one tab should not appear in a newly opened tab.
- Clicking the extension icon in any tab opens that tab's own Exten AI side panel.
- Closing Exten AI in a tab and reopening it from the extension icon starts a fresh chat.
- Archived chats are hidden from History, visible in Archive, and still stored locally until deleted.
- The API key and chat history are stored in Chrome local storage on the device.
