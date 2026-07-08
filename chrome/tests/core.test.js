import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroqPayload,
  cropSelectionToViewport,
  formatConsoleContext,
  formatSearchContext,
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

test('formatConsoleContext prioritizes errors and limits entries', () => {
  const text = formatConsoleContext([
    { level: 'log', text: 'loaded', timestamp: 1000 },
    { level: 'error', text: 'boom', timestamp: 2000 },
    { level: 'warn', text: 'careful', timestamp: 3000 }
  ]);

  assert.match(text, /Recent console output/);
  assert.ok(text.indexOf('[error] boom') < text.indexOf('[warn] careful'));
  assert.ok(text.indexOf('[warn] careful') < text.indexOf('[log] loaded'));
});

test('formatSearchContext includes query, titles, urls, and snippets', () => {
  const text = formatSearchContext('how to fix vite error', [
    {
      title: 'Vite troubleshooting',
      url: 'https://vite.dev/guide/troubleshooting.html',
      snippet: 'Common fixes for dev server issues.'
    }
  ]);

  assert.match(text, /Web search query: how to fix vite error/);
  assert.match(text, /Vite troubleshooting/);
  assert.match(text, /https:\/\/vite\.dev\/guide\/troubleshooting\.html/);
  assert.match(text, /Common fixes for dev server issues/);
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

test('buildGroqPayload includes grounded concise answer guardrails', () => {
  const payload = buildGroqPayload({
    model: 'llama-3.1-8b-instant',
    responseMode: 'instant',
    history: [],
    message: 'why is it broken?',
    contextText: 'Recent console output:\\n[error] boom'
  });

  assert.match(payload.messages[0].content, /Use only the supplied browser context/);
  assert.match(payload.messages[0].content, /do not invent/);
  assert.match(payload.messages[0].content, /Answer format/);
  assert.match(payload.messages[0].content, /Fix/);
});

test('buildGroqPayload adds citation guardrails when web search context is attached', () => {
  const payload = buildGroqPayload({
    model: 'llama-3.1-8b-instant',
    responseMode: 'instant',
    history: [],
    message: 'what changed in vite?',
    contextText: formatSearchContext('vite release notes', [
      {
        title: 'Vite release notes',
        url: 'https://vite.dev/releases',
        snippet: 'Latest changes and migration notes.'
      }
    ])
  });

  assert.match(payload.messages[0].content, /cite the source URLs/i);
  assert.match(payload.messages.at(-1).content, /Web search query: vite release notes/);
});

test('buildGroqPayload uses extensive structured formatting in thinking mode', () => {
  const payload = buildGroqPayload({
    model: 'llama-3.3-70b-versatile',
    responseMode: 'thinking',
    history: [],
    message: 'debug this',
    contextText: 'Recent console output:\\n[error] boom'
  });

  assert.match(payload.messages[0].content, /Thinking mode/);
  assert.match(payload.messages[0].content, /Root cause/);
  assert.match(payload.messages[0].content, /Step-by-step fix/);
  assert.equal(payload.max_tokens, 1200);
});

test('buildGroqPayload keeps instant mode short', () => {
  const payload = buildGroqPayload({
    model: 'llama-3.1-8b-instant',
    responseMode: 'instant',
    history: [],
    message: 'debug this',
    contextText: 'Recent console output:\\n[error] boom'
  });

  assert.match(payload.messages[0].content, /Instant mode/);
  assert.equal(payload.max_tokens, 500);
});

test('buildGroqPayload warns when no browser context is attached', () => {
  const payload = buildGroqPayload({
    model: 'llama-3.1-8b-instant',
    history: [],
    message: 'what is wrong?'
  });

  assert.match(payload.messages.at(-1).content, /No browser context is attached/);
});

test('buildGroqPayload creates multimodal content when image is attached', () => {
  const payload = buildGroqPayload({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    history: [],
    message: 'what is this',
    imageDataUrl: 'data:image/png;base64,abc'
  });

  assert.equal(payload.messages[1].content[0].type, 'text');
  assert.match(payload.messages[1].content[0].text, /inspect the attached screenshot crop/);
  assert.equal(payload.messages[1].content[1].type, 'image_url');
});

test('buildGroqPayload keeps image attachments text-only for text models', () => {
  const payload = buildGroqPayload({
    model: 'llama-3.1-8b-instant',
    history: [],
    message: 'what is this',
    imageDataUrl: 'data:image/png;base64,abc'
  });

  assert.equal(typeof payload.messages[1].content, 'string');
  assert.match(payload.messages[1].content, /text model cannot inspect images/);
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
