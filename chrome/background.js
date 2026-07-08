const maxConsoleEntries = 200;
initializeSidePanel();

chrome.tabs.onCreated.addListener((tab) => {
  if (!tab.id) return;
  enableTabSidePanel(tab.id);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  enableTabSidePanel(tabId);
});

chrome.tabs.onUpdated.addListener((tabId) => {
  enableTabSidePanel(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});

async function handleMessage(message) {
  if (message?.type === 'GET_ACTIVE_TAB') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { ok: true, tab: sanitizeTab(tab) };
  }

  if (message?.type === 'GET_PAGE_CONTEXT') {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);
    await ensureConsoleCapture(tab.id);
    return chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
  }

  if (message?.type === 'START_REGION_SELECT') {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);
    await ensureConsoleCapture(tab.id);
    return chrome.tabs.sendMessage(tab.id, { type: 'START_REGION_SELECT' });
  }

  if (message?.type === 'START_CONSOLE_CAPTURE') {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);
    await ensureConsoleCapture(tab.id);
    return { ok: true };
  }

  if (message?.type === 'GET_CONSOLE_CONTEXT') {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);
    await ensureConsoleCapture(tab.id);
    const pageCapture = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONSOLE_CONTEXT' }).catch(() => ({ entries: [] }));
    return {
      ok: true,
      ready: true,
      entries: mergeConsoleEntries(pageCapture.entries || [])
    };
  }

  if (message?.type === 'CAPTURE_VISIBLE_TAB') {
    // Query the focused browser window (not the side panel) to get the right windowId
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'], populate: true });
    const focusedWindow = windows.find((w) => w.focused) || windows[0];
    if (!focusedWindow) throw new Error('No browser window found.');
    const activeTab = focusedWindow.tabs?.find((t) => t.active);
    if (!activeTab) throw new Error('No active tab found in browser window.');
    if (!activeTab.url || /^(chrome|edge|about|chrome-extension):\/\//.test(activeTab.url)) {
      throw new Error('Chrome does not allow extensions to read this page.');
    }
    // Small delay so the browser window settles focus before capture
    await new Promise((r) => setTimeout(r, 150));
    const dataUrl = await chrome.tabs.captureVisibleTab(focusedWindow.id, { format: 'png' })
      .catch((err) => { throw new Error(`Screenshot failed: ${err.message}`); });
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  if (!tab.url || /^(chrome|edge|about|chrome-extension):\/\//.test(tab.url)) {
    throw new Error('Chrome does not allow extensions to read this page.');
  }
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING_EXTEN_AI' });
    if (response?.ok) return;
  } catch (_) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  }
}

async function ensureConsoleCapture(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['console-capture.js']
  });
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

async function initializeSidePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  const tabs = await chrome.tabs.query({}).catch(() => []);
  await Promise.all(tabs
    .filter((tab) => tab.id)
    .map((tab) => enableTabSidePanel(tab.id)));
}

async function enableTabSidePanel(tabId) {
  await chrome.sidePanel.setOptions({
    tabId,
    path: 'sidepanel.html',
    enabled: true
  }).catch(() => {});
}

async function searchWeb(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml'
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
