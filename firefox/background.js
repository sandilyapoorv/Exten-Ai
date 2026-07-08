const extApi = globalThis.browser ?? globalThis.chrome;
const maxConsoleEntries = 200;

if (!globalThis.extenAiIsRestrictedUrl && typeof importScripts === 'function') {
  importScripts('restricted-url.js');
}

extApi.action.onClicked.addListener(async () => {
  await extApi.sidebarAction.open().catch((error) => {
    console.error('Could not open Exten AI sidebar:', error);
  });
});

extApi.runtime.onMessage.addListener((message, sender) => (
  handleMessage(message, sender).catch((error) => ({
    ok: false,
    error: error.message || String(error)
  }))
));

async function handleMessage(message) {
  if (message?.type === 'GET_ACTIVE_TAB') {
    const [tab] = await extApi.tabs.query({ active: true, currentWindow: true });
    return { ok: true, tab: sanitizeTab(tab) };
  }

  if (message?.type === 'GET_PAGE_CONTEXT') {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);
    await ensureConsoleCapture(tab.id);
    return extApi.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
  }

  if (message?.type === 'START_REGION_SELECT') {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);
    await ensureConsoleCapture(tab.id);
    return extApi.tabs.sendMessage(tab.id, { type: 'START_REGION_SELECT' });
  }

  if (message?.type === 'START_CONSOLE_CAPTURE') {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);
    const injected = await tryEnsureConsoleCapture(tab.id);
    return { ok: true, ready: injected.ok, error: injected.error || '' };
  }

  if (message?.type === 'GET_CONSOLE_CONTEXT') {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);
    let pageCapture = await getConsoleContextFromPage(tab.id);
    if (!pageCapture.ready) {
      const injected = await tryEnsureConsoleCapture(tab.id);
      pageCapture = await getConsoleContextFromPage(tab.id);
      if (!pageCapture.ready && !pageCapture.error && injected.error) {
        pageCapture.error = injected.error;
      }
    }
    return {
      ok: true,
      ready: Boolean(pageCapture.ready),
      entries: mergeConsoleEntries(pageCapture.entries || []),
      error: pageCapture.error || ''
    };
  }

  if (message?.type === 'CAPTURE_VISIBLE_TAB') {
    const windows = await extApi.windows.getAll({ windowTypes: ['normal'], populate: true });
    const focusedWindow = windows.find((windowItem) => windowItem.focused) || windows[0];
    if (!focusedWindow) throw new Error('No browser window found.');

    const activeTab = focusedWindow.tabs?.find((tab) => tab.active);
    if (!activeTab) throw new Error('No active tab found in browser window.');
    if (isRestrictedUrl(activeTab.url)) {
      throw new Error('Firefox does not allow extensions to read this page.');
    }

    await delay(150);
    const dataUrl = await extApi.tabs.captureVisibleTab(focusedWindow.id, { format: 'png' }).catch((error) => {
      throw new Error(`Screenshot failed: ${error.message}`);
    });
    return { ok: true, dataUrl };
  }

  if (message?.type === 'SEARCH_WEB') {
    const query = String(message.query || '').trim();
    if (!query) throw new Error('Search query is empty.');
    return {
      ok: true,
      query,
      results: await searchWeb(query)
    };
  }

  throw new Error('Unknown background message');
}

async function getActiveTab() {
  const [tab] = await extApi.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  if (isRestrictedUrl(tab.url)) {
    throw new Error('Firefox does not allow extensions to read this page.');
  }
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    const response = await extApi.tabs.sendMessage(tabId, { type: 'PING_EXTEN_AI' });
    if (response?.ok) return;
  } catch (_) {
    await extApi.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  }
}

async function ensureConsoleCapture(tabId) {
  await extApi.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['console-capture.js']
  });
}

async function tryEnsureConsoleCapture(tabId) {
  try {
    await ensureConsoleCapture(tabId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function getConsoleContextFromPage(tabId) {
  return extApi.tabs.sendMessage(tabId, { type: 'GET_CONSOLE_CONTEXT' })
    .catch((error) => ({ ready: false, entries: [], error: error.message || String(error) }));
}

function isRestrictedUrl(url) {
  return globalThis.extenAiIsRestrictedUrl(url);
}

function mergeConsoleEntries(entries) {
  const seen = new Set();
  return [...entries]
    .filter((entry) => {
      const key = `${entry.level}|${entry.text}|${entry.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .slice(-maxConsoleEntries);
}

function sanitizeTab(tab) {
  if (!tab) return null;
  return {
    id: tab.id,
    title: tab.title || '',
    url: tab.url || ''
  };
}

async function searchWeb(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) {
    throw new Error(`Web search failed (${response.status}).`);
  }

  const html = await response.text();
  const results = parseDuckDuckGoResults(html);
  if (!results.length) {
    throw new Error('No web results found for that query.');
  }
  return results.slice(0, 5);
}

function parseDuckDuckGoResults(html) {
  const matches = [...String(html || '').matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const results = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextIndex = matches[index + 1]?.index ?? html.length;
    const slice = html.slice(match.index, Math.min(nextIndex, match.index + 4000));
    const snippetMatch = slice.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    const href = decodeDuckDuckGoUrl(match[1]);
    const title = cleanHtmlText(match[2]);
    const snippet = cleanHtmlText(snippetMatch?.[1] || snippetMatch?.[2] || '');

    if (!href || !title) continue;
    results.push({ title, url: href, snippet });
  }

  return results;
}

function decodeDuckDuckGoUrl(href) {
  const raw = decodeHtmlEntities(href || '');
  if (!raw.startsWith('/l/?')) return raw;

  const params = new URLSearchParams(raw.split('?')[1] || '');
  return params.get('uddg') || raw;
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
