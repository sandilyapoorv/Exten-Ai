import {
  buildGroqPayload,
  cropSelectionToViewport,
  formatConsoleContext,
  formatSearchContext,
  formatWebsiteContext,
  normalizeHistory
} from './src/core.js';

const storageKeys = {
  apiKey: 'extenAi.groqApiKey',
  history: 'extenAi.history',
  threads: 'extenAi.threads',
  activeThreadId: 'extenAi.activeThreadId',
  mode: 'extenAi.mode'
};

const modes = {
  instant: {
    label: 'Instant',
    model: 'llama-3.1-8b-instant'
  },
  thinking: {
    label: 'Thinking',
    model: 'llama-3.3-70b-versatile'
  }
};

const visionModel = 'meta-llama/llama-4-scout-17b-16e-instruct';

const steps = [
  {
    title: 'Grant browser access',
    body: 'Allow Exten AI to work on websites. Chrome will show the permission prompt now.',
    permission: true
  },
  {
    title: 'Open Groq Console',
    body: 'Open Groq API keys in a new tab. Your key comes from Groq, not from us.',
    link: true
  },
  {
    title: 'Create an API key',
    body: 'Create a key in Groq, then copy the value that starts with gsk_.',
    link: false
  },
  {
    title: 'Come back to Exten AI',
    body: 'Keep the key copied. The next step stores it locally in Chrome.',
    link: false
  },
  {
    title: 'Paste your key',
    body: 'Your key is stored only on this device. Prompts are sent directly to Groq when you chat.',
    key: true
  }
];

const els = {
  onboarding: document.getElementById('onboarding'),
  chatApp: document.getElementById('chatApp'),
  stepCount: document.getElementById('stepCount'),
  stepTitle: document.getElementById('stepTitle'),
  stepBody: document.getElementById('stepBody'),
  groqLink: document.getElementById('groqLink'),
  grantAccess: document.getElementById('grantAccess'),
  keyStep: document.getElementById('keyStep'),
  setupStatus: document.getElementById('setupStatus'),
  apiKey: document.getElementById('apiKey'),
  backStep: document.getElementById('backStep'),
  nextStep: document.getElementById('nextStep'),
  saveKey: document.getElementById('saveKey'),
  modeLabel: document.getElementById('modeLabel'),
  chatTopbar: document.getElementById('chatTopbar'),
  newChat: document.getElementById('newChat'),
  topbarActions: document.getElementById('topbarActions'),
  supportButton: document.getElementById('supportButton'),
  historyTab: document.getElementById('historyTab'),
  archiveTab: document.getElementById('archiveTab'),
  chatView: document.getElementById('chatView'),
  blockedPage: document.getElementById('blockedPage'),
  blockedReason: document.getElementById('blockedReason'),
  chatScroll: document.getElementById('chatScroll'),
  historyView: document.getElementById('historyView'),
  historyList: document.getElementById('historyList'),
  archiveView: document.getElementById('archiveView'),
  archiveList: document.getElementById('archiveList'),
  modePicker: document.getElementById('modePicker'),
  modeTrigger: document.getElementById('modeTrigger'),
  modeTriggerLabel: document.getElementById('modeTriggerLabel'),
  modeMenu: document.getElementById('modeMenu'),
  attachmentPicker: document.getElementById('attachmentPicker'),
  attachmentTrigger: document.getElementById('attachmentTrigger'),
  attachmentLabel: document.getElementById('attachmentLabel'),
  attachmentMenu: document.getElementById('attachmentMenu'),
  useWebsite: document.getElementById('useWebsite'),
  useConsole: document.getElementById('useConsole'),
  useWeb: document.getElementById('useWeb'),
  selectPart: document.getElementById('selectPart'),
  attachment: document.getElementById('attachment'),
  status: document.getElementById('status'),
  messages: document.getElementById('messages'),
  form: document.getElementById('chatForm'),
  prompt: document.getElementById('prompt'),
  send: document.getElementById('send'),
  appNote: document.getElementById('appNote'),
  confirmOverlay: document.getElementById('confirmOverlay'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmBody: document.getElementById('confirmBody'),
  confirmCancel: document.getElementById('confirmCancel'),
  confirmAccept: document.getElementById('confirmAccept'),
  supportOverlay: document.getElementById('supportOverlay'),
  supportClose: document.getElementById('supportClose'),
  copyUpi: document.getElementById('copyUpi'),
  supportUpi: document.getElementById('supportUpi'),
  contactEmail: document.getElementById('contactEmail')
};

let setupStep = 0;
let apiKey = '';
let mode = 'instant';
let threads = [];
let activeThreadId = '';
let pendingContext = null;
let pendingConsole = null;
let pendingImage = '';
let pendingWebSearch = false;
let pendingWebResults = [];
let pendingWebQuery = '';
let currentTabId = null;
let pendingConfirm = null;

init();
resizePrompt();

async function init() {
  const stored = await chrome.storage.local.get(Object.values(storageKeys));
  apiKey = stored[storageKeys.apiKey] || '';
  threads = normalizeThreads(stored[storageKeys.threads]);
  activeThreadId = stored[storageKeys.activeThreadId] || '';
  if (!threads.length && Array.isArray(stored[storageKeys.history]) && stored[storageKeys.history].length) {
    const migratedThread = createThread(normalizeHistory(stored[storageKeys.history]));
    migratedThread.title = titleFromMessages(migratedThread.messages);
    threads = [migratedThread];
    activeThreadId = migratedThread.id;
    await saveThreads();
  }
  mode = modes[stored[storageKeys.mode]] ? stored[storageKeys.mode] : 'instant';
  await prepareThreadForPanelOpen();
  ensureActiveThread();
  const siteAccess = await hasSiteAccess();

  if (apiKey && siteAccess) {
    await showChat();
  } else {
    setupStep = siteAccess ? 1 : 0;
    showOnboarding();
  }
}

els.backStep.addEventListener('click', () => {
  setupStep = Math.max(0, setupStep - 1);
  renderOnboarding();
});

els.nextStep.addEventListener('click', () => {
  setupStep = Math.min(steps.length - 1, setupStep + 1);
  renderOnboarding();
});

els.grantAccess.addEventListener('click', async () => {
  els.setupStatus.textContent = '';
  const granted = await chrome.permissions.request({
    origins: ['http://*/*', 'https://*/*']
  });

  if (!granted) {
    els.setupStatus.textContent = 'Chrome access was not granted. Exten AI needs this to use page context.';
    return;
  }

  setupStep = 1;
  renderOnboarding();
});

els.saveKey.addEventListener('click', async () => {
  const key = els.apiKey.value.trim();
  if (!key.startsWith('gsk_')) {
    els.setupStatus.textContent = 'Paste a Groq key that starts with gsk_.';
    els.apiKey.focus();
    return;
  }

  apiKey = key;
  await chrome.storage.local.set({ [storageKeys.apiKey]: apiKey });
  await showChat();
});

els.modeTrigger?.addEventListener('click', () => {
  const open = els.modeMenu.hidden;
  els.modeMenu.hidden = !open;
  els.modeTrigger.setAttribute('aria-expanded', String(open));
});

els.modeMenu?.addEventListener('click', (event) => {
  const option = event.target.closest('[data-mode]');
  if (!option) return;
  setMode(option.dataset.mode);
  closeModeMenu();
});

document.addEventListener('click', (event) => {
  if (!els.modePicker || els.modePicker.contains(event.target)) return;
  closeModeMenu();
});

els.attachmentTrigger?.addEventListener('click', () => {
  const open = els.attachmentMenu.hidden;
  els.attachmentMenu.hidden = !open;
  els.attachmentTrigger.setAttribute('aria-expanded', String(open));
});

els.attachmentMenu?.addEventListener('click', async (event) => {
  const option = event.target.closest('[data-attach]');
  if (!option) return;
  await attachContext(option.dataset.attach);
  closeAttachmentMenu();
});

document.addEventListener('click', (event) => {
  if (!els.attachmentPicker || els.attachmentPicker.contains(event.target)) return;
  closeAttachmentMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeModeMenu();
    closeAttachmentMenu();
    closeConfirm(false);
    closeSupport();
  }
});

els.confirmCancel?.addEventListener('click', () => closeConfirm(false));
els.confirmAccept?.addEventListener('click', () => closeConfirm(true));
els.confirmOverlay?.addEventListener('click', (event) => {
  if (event.target === els.confirmOverlay) closeConfirm(false);
});
els.supportButton?.addEventListener('click', openSupport);
els.supportClose?.addEventListener('click', closeSupport);
els.supportOverlay?.addEventListener('click', (event) => {
  if (event.target === els.supportOverlay) closeSupport();
});
els.copyUpi?.addEventListener('click', async () => {
  const upiId = els.supportUpi?.textContent?.trim() || '';
  await navigator.clipboard.writeText(upiId).catch(() => {});
  setStatus('UPI ID copied.');
});
els.contactEmail?.addEventListener('click', (event) => {
  event.preventDefault();
  window.open('https://mail.google.com/mail/?view=cm&fs=1&to=contact@apoorv.sbs', '_blank', 'noopener,noreferrer');
});

els.prompt.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  els.form.requestSubmit();
});

els.prompt.addEventListener('input', () => {
  resizePrompt();
});

els.newChat.addEventListener('click', async () => {
  let thread = getActiveThread();
  if (!isBlankThread(thread)) {
    const tabResponse = await sendBackground({ type: 'GET_ACTIVE_TAB' }).catch(() => null);
    thread = createThread([], tabResponse?.tab || null);
    threads = [thread, ...threads];
    activeThreadId = thread.id;
  }
  pendingContext = null;
  pendingConsole = null;
  pendingImage = '';
  pendingWebSearch = false;
  pendingWebResults = [];
  pendingWebQuery = '';
  await saveThreads();
  renderMessages();
  renderAttachment();
  renderHistoryList();
  renderArchiveList();
  setView('chat');
  setStatus('New chat ready.');
  els.prompt.focus();
});

els.historyTab.addEventListener('click', () => setView('history'));
els.archiveTab?.addEventListener('click', () => setView('archive'));

chrome.tabs?.onUpdated?.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.active || tabId !== currentTabId) return;
  await syncThreadToActiveTab();
  renderMessages();
  renderAttachment();
  renderHistoryList();
  renderArchiveList();
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = els.prompt.value.trim();
  if (!message) return;

  els.prompt.value = '';
  resizePrompt();
  const thread = getActiveThread();
  const imageDataUrl = pendingImage;
  pendingImage = '';   // image is one-shot, clear after use

  const userMessage = imageDataUrl
    ? { role: 'user', content: message, imageDataUrl }
    : { role: 'user', content: message };
  thread.messages = [...thread.messages, userMessage];
  if (thread.title === 'New chat') thread.title = makeTitle(message);
  thread.updatedAt = Date.now();
  sortThreads();
  renderMessages();
  renderAttachment();
  await saveThreads();
  const requestThreadId = thread.id;

  await withBusy(els.send, async () => {
    if (pendingWebSearch) {
      setStatus('Searching the web...');
      const search = await sendBackground({ type: 'SEARCH_WEB', query: message });
      pendingWebResults = search.results || [];
      pendingWebQuery = search.query || message;
      pendingWebSearch = false;
    }

    const contextText = [
      thread.pageContext ? formatWebsiteContext(thread.pageContext) : '',
      pendingConsole ? formatConsoleContext(pendingConsole) : '',
      pendingWebResults.length ? formatSearchContext(pendingWebQuery || message, pendingWebResults) : ''
    ].filter(Boolean).join('\n\n');

    renderAttachment();

    setStatus(imageDataUrl
      ? 'Vision is reading the selected area...'
      : pendingWebResults.length
        ? `${modes[mode].label} is answering with web results...`
        : `${modes[mode].label} is responding...`);
    const answer = await askGroq({ thread, message, contextText, imageDataUrl });
    const responseThread = threads.find((item) => item.id === requestThreadId);
    if (!responseThread) {
      setStatus('Chat was deleted before the response returned.');
      return;
    }
    responseThread.messages = [...responseThread.messages, { role: 'assistant', content: answer }];
    responseThread.updatedAt = Date.now();
    sortThreads();
    renderMessages();
    renderHistoryList();
    renderArchiveList();
    await saveThreads();
    setStatus('Ready.');
  });
});

function showOnboarding() {
  els.onboarding.hidden = false;
  els.chatApp.hidden = true;
  renderOnboarding();
}

async function showChat() {
  els.onboarding.hidden = true;
  els.chatApp.hidden = false;
  setBlockedPage(false);
  await syncThreadToActiveTab();
  sendBackground({ type: 'START_CONSOLE_CAPTURE' }).catch((error) => {
    const message = error.message || 'Console capture could not start on this page.';
    if (isChromeBlockedPageError(message)) {
      setBlockedPage(true, message);
      return;
    }
    setStatus(message);
  });
  renderMode();
  renderMessages();
  renderAttachment();
  renderHistoryList();
  renderArchiveList();
  setView('chat');
  setStatus('Ready.');
}

function isChromeBlockedPageError(message) {
  return String(message || '').includes('Chrome does not allow extensions to read this page.');
}

function setBlockedPage(blocked, message = 'Chrome does not allow extensions to read this page.') {
  if (els.blockedPage) els.blockedPage.hidden = !blocked;
  if (els.blockedReason) els.blockedReason.textContent = message;
  if (els.chatScroll) els.chatScroll.hidden = blocked;
  if (els.form) els.form.hidden = blocked;
  if (els.appNote) els.appNote.hidden = blocked;
  if (els.chatTopbar) els.chatTopbar.hidden = blocked;
  if (els.topbarActions) els.topbarActions.hidden = blocked;
}

function renderOnboarding() {
  const step = steps[setupStep];
  els.stepCount.textContent = `Step ${setupStep + 1} of ${steps.length}`;
  els.stepTitle.textContent = step.title;
  els.stepBody.textContent = step.body;
  document.querySelectorAll('.step-dots span').forEach((dot, index) => {
    dot.classList.toggle('active', index <= setupStep);
  });
  els.grantAccess.hidden = !step.permission;
  els.groqLink.hidden = !step.link;
  els.keyStep.hidden = !step.key;
  els.nextStep.hidden = Boolean(step.key || step.permission);
  els.saveKey.hidden = !step.key;
  els.backStep.disabled = setupStep === 0;
  els.setupStatus.textContent = '';
  if (step.key) els.apiKey.focus();
}

async function setMode(nextMode) {
  mode = nextMode;
  await chrome.storage.local.set({ [storageKeys.mode]: mode });
  renderMode();
}

async function hasSiteAccess() {
  return chrome.permissions.contains({
    origins: ['http://*/*', 'https://*/*']
  });
}

function renderMode() {
  if (els.modeTriggerLabel) els.modeTriggerLabel.textContent = modes[mode].label;
  els.modeMenu?.querySelectorAll('[data-mode]').forEach((option) => {
    const active = option.dataset.mode === mode;
    option.classList.toggle('active', active);
    option.setAttribute('aria-selected', String(active));
  });
  els.modeLabel.textContent = mode === 'thinking'
    ? 'Thinking mode · structured answers'
    : 'Instant mode · concise answers';
}

function closeModeMenu() {
  if (!els.modeMenu || !els.modeTrigger) return;
  els.modeMenu.hidden = true;
  els.modeTrigger.setAttribute('aria-expanded', 'false');
}

async function attachContext(kind) {
  const labels = {
    page: 'Page',
    console: 'Console',
    web: 'Web',
    area: 'Area'
  };
  if (els.attachmentLabel) els.attachmentLabel.textContent = labels[kind] || 'Page';
  els.attachmentMenu?.querySelectorAll('[data-attach]').forEach((option) => {
    option.classList.toggle('active', option.dataset.attach === kind);
  });

  await withBusy(els.attachmentTrigger, async () => {
    if (kind === 'console') {
      const response = await sendBackground({ type: 'GET_CONSOLE_CONTEXT' });
      pendingConsole = response.entries || [];
      renderAttachment();
      setStatus(pendingConsole.length
        ? 'Console output attached.'
        : response.ready
          ? 'Console capture is active. Reproduce the issue, then attach Console again.'
          : 'Console capture started. Reproduce the issue, then attach Console again.');
      return;
    }

    if (kind === 'area') {
      setStatus('Preparing screenshot…');

      // Capture the screenshot BEFORE showing the selection overlay.
      // This avoids the focus/window issue where captureVisibleTab grabs
      // the side-panel instead of the page after the overlay is dismissed.
      let captured;
      try {
        captured = await sendBackground({ type: 'CAPTURE_VISIBLE_TAB' });
      } catch (err) {
        throw new Error(`Could not capture screenshot: ${err.message}`);
      }
      if (!captured?.dataUrl) throw new Error('Could not capture tab screenshot — try reloading the page.');

      setStatus('Select an area on the page.');

      const selected = await sendBackground({ type: 'START_REGION_SELECT' });
      if (!selected?.ok) throw new Error(selected?.error || 'Selection cancelled.');

      const selection = cropSelectionToViewport(selected.selection, {
        width: selected.selection.viewportWidth,
        height: selected.selection.viewportHeight
      });

      if (!selection.width || !selection.height) {
        throw new Error('Selected area was empty.');
      }

      pendingImage = await cropDataUrl(captured.dataUrl, selection, {
        width: selected.selection.viewportWidth,
        height: selected.selection.viewportHeight
      });

      // Grab page context so we have the website link and title
      const response = await sendBackground({ type: 'GET_PAGE_CONTEXT' }).catch(() => null);
      if (response?.context) {
        const thread = getActiveThread();
        thread.pageContext = response.context;
        thread.updatedAt = Date.now();
        await saveThreads();
      }

      renderAttachment();
      setStatus('Selected area attached.');
      return;
    }

    if (kind === 'web') {
      pendingWebSearch = true;
      pendingWebResults = [];
      pendingWebQuery = '';
      renderAttachment();
      setStatus('Web search armed. Send your message to search first.');
      return;
    }

    const response = await sendBackground({ type: 'GET_PAGE_CONTEXT' });
    const thread = getActiveThread();
    thread.pageContext = response.context;
    thread.updatedAt = Date.now();
    await saveThreads();
    renderAttachment();
    setStatus('Page context attached to this chat.');
  });
}

function closeAttachmentMenu() {
  if (!els.attachmentMenu || !els.attachmentTrigger) return;
  els.attachmentMenu.hidden = true;
  els.attachmentTrigger.setAttribute('aria-expanded', 'false');
}

function setView(view) {
  const isHistory = view === 'history';
  const isArchive = view === 'archive' && Boolean(els.archiveView);
  els.chatView.hidden = isHistory || isArchive;
  els.historyView.hidden = !isHistory;
  if (els.archiveView) els.archiveView.hidden = !isArchive;
  els.historyTab.classList.toggle('active', isHistory);
  els.archiveTab?.classList.toggle('active', isArchive);
  if (isHistory) renderHistoryList();
  if (isArchive) renderArchiveList();
}

async function askGroq({ thread, message, contextText, imageDataUrl }) {
  const model = imageDataUrl ? visionModel : modes[mode].model;
  const payload = buildGroqPayload({
    model,
    responseMode: mode,
    history: thread.messages.slice(0, -1),
    message,
    contextText,
    imageDataUrl
  });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Groq request failed (${response.status}).`);
  }

  return data?.choices?.[0]?.message?.content?.trim() || 'No response text returned.';
}

function renderMessages() {
  els.messages.textContent = '';
  const messages = getActiveThread().messages;
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<strong>Attach context first for exact answers.</strong><span>Use page, console, web search, or selected area. Exten AI will not guess facts.</span>';
    els.messages.append(empty);
    return;
  }

  for (const message of messages) {
    const item = document.createElement('div');
    item.className = `message ${message.role}`;

    if (message.role === 'user') {
      // User messages: plain text + optional area screenshot
      if (message.imageDataUrl) {
        const img = document.createElement('img');
        img.src = message.imageDataUrl;
        img.alt = 'Selected area';
        img.className = 'message-image';
        item.append(img);
      }
      const text = document.createElement('span');
      text.textContent = message.content;
      item.append(text);
    } else {
      // Assistant messages: full markdown rendering
      renderMarkdown(message.content, item);
    }

    els.messages.append(item);
  }

  els.messages.scrollTop = els.messages.scrollHeight;
}

/**
 * Parse and render markdown into a container element.
 * Supports: fenced code blocks (with copy button), headings (##/###),
 * bullet and numbered lists, bold, italic, inline code.
 */
function renderMarkdown(text, container) {
  // Split on fenced code blocks first so we can handle them separately
  const parts = text.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    const codeBlockMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
    if (codeBlockMatch) {
      const lang = codeBlockMatch[1] || '';
      const code = codeBlockMatch[2].replace(/\n$/, '');
      container.append(buildCodeBlock(lang, code));
      continue;
    }

    // Process non-code sections line by line
    const lines = part.split('\n');
    let listEl = null;
    let listType = null;

    const flushList = () => {
      if (listEl) {
        container.append(listEl);
        listEl = null;
        listType = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Headings
      const h3Match = line.match(/^### (.+)/);
      const h2Match = line.match(/^## (.+)/);
      const h1Match = line.match(/^# (.+)/);
      if (h3Match || h2Match || h1Match) {
        flushList();
        const level = h3Match ? 'h4' : h2Match ? 'h3' : 'h3';
        const headingEl = document.createElement(level);
        headingEl.className = 'md-heading';
        headingEl.append(...parseInline(h3Match?.[1] ?? h2Match?.[1] ?? h1Match?.[1]));
        container.append(headingEl);
        continue;
      }

      // Bullet list item
      const bulletMatch = line.match(/^(\s*)[-*+] (.+)/);
      if (bulletMatch) {
        if (listType !== 'ul') { flushList(); listEl = document.createElement('ul'); listEl.className = 'md-list'; listType = 'ul'; }
        const li = document.createElement('li');
        li.append(...parseInline(bulletMatch[2]));
        listEl.append(li);
        continue;
      }

      // Numbered list item
      const numberedMatch = line.match(/^\d+\. (.+)/);
      if (numberedMatch) {
        if (listType !== 'ol') { flushList(); listEl = document.createElement('ol'); listEl.className = 'md-list'; listType = 'ol'; }
        const li = document.createElement('li');
        li.append(...parseInline(numberedMatch[1]));
        listEl.append(li);
        continue;
      }

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        flushList();
        container.append(document.createElement('hr'));
        continue;
      }

      // Blank line: end any active list, add a paragraph break
      if (!line.trim()) {
        flushList();
        continue;
      }

      // Regular paragraph line
      flushList();
      const p = document.createElement('p');
      p.className = 'md-p';
      p.append(...parseInline(line));
      container.append(p);
    }

    flushList();
  }
}

/**
 * Parse inline markdown: **bold**, *italic*, `code`, and plain text.
 * Returns an array of DOM nodes.
 * Inline `code` spans get a copy button.
 */
function parseInline(text) {
  const nodes = [];
  // Combined regex: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[2] !== undefined) {
      const strong = document.createElement('strong');
      strong.textContent = match[2];
      nodes.push(strong);
    } else if (match[3] !== undefined) {
      const em = document.createElement('em');
      em.textContent = match[3];
      nodes.push(em);
    } else if (match[4] !== undefined) {
      // Inline code: pill + copy button
      nodes.push(buildInlineCode(match[4]));
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(document.createTextNode(text.slice(lastIndex)));
  }

  return nodes.length ? nodes : [document.createTextNode(text)];
}

/**
 * Build an inline code pill with a small copy button beside it.
 */
function buildInlineCode(codeText) {
  const wrap = document.createElement('span');
  wrap.className = 'md-inline-wrap';

  const code = document.createElement('code');
  code.className = 'md-inline-code';
  code.textContent = codeText;

  const btn = document.createElement('button');
  btn.className = 'md-inline-copy';
  btn.type = 'button';
  btn.title = 'Copy';
  btn.setAttribute('aria-label', 'Copy code');
  btn.textContent = 'Copy';
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(codeText).catch(() => {});
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });

  wrap.append(code, btn);
  return wrap;
}

/**
 * Build a fenced code block element with a copy-to-clipboard button.
 */
function buildCodeBlock(lang, code) {
  const wrap = document.createElement('div');
  wrap.className = 'md-code-block';

  const header = document.createElement('div');
  header.className = 'md-code-header';

  const langLabel = document.createElement('span');
  langLabel.className = 'md-code-lang';
  langLabel.textContent = lang || 'code';
  header.append(langLabel);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'md-copy-btn';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(code).catch(() => {});
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
  });
  header.append(copyBtn);

  const pre = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.textContent = code;
  pre.append(codeEl);

  wrap.append(header, pre);
  return wrap;
}

function renderHistoryList() {
  renderThreadList({
    root: els.historyList,
    emptyText: 'No saved chats yet.',
    archived: false
  });
}

function renderArchiveList() {
  if (!els.archiveList) return;
  renderThreadList({
    root: els.archiveList,
    emptyText: 'No archived chats yet.',
    archived: true
  });
}

function renderThreadList({ root, emptyText, archived }) {
  root.textContent = '';
  const savedThreads = threads.filter((thread) => thread.messages.length && Boolean(thread.archived) === archived);
  if (!savedThreads.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = emptyText;
    root.append(empty);
    return;
  }

  for (const thread of savedThreads) {
    const card = document.createElement('article');
    card.className = 'thread-card';
    card.classList.toggle('active', thread.id === activeThreadId);

    const openButton = document.createElement('button');
    openButton.className = 'history-item';
    openButton.type = 'button';
    openButton.innerHTML = `<strong></strong><span></span>`;
    openButton.querySelector('strong').textContent = thread.title || 'Untitled chat';
    openButton.querySelector('span').textContent = formatThreadDate(thread.updatedAt);
    openButton.addEventListener('click', async () => {
      activeThreadId = thread.id;
      pendingContext = null;
      pendingConsole = null;
      pendingImage = '';
      pendingWebSearch = false;
      pendingWebResults = [];
      pendingWebQuery = '';
      await saveThreads();
      renderMessages();
      renderAttachment();
      renderHistoryList();
      renderArchiveList();
      setView('chat');
    });

    const actions = document.createElement('div');
    actions.className = 'thread-actions';

    const archiveButton = document.createElement('button');
    archiveButton.className = 'ghost-button';
    archiveButton.type = 'button';
    archiveButton.textContent = archived ? 'Restore' : 'Archive';
    archiveButton.addEventListener('click', () => archived
      ? restoreThreadById(thread.id)
      : archiveThreadById(thread.id));

    const deleteButton = document.createElement('button');
    deleteButton.className = 'ghost-button danger-button';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteThreadById(thread.id));

    actions.append(archiveButton, deleteButton);
    card.append(openButton, actions);
    root.append(card);
  }
}

function renderAttachment() {
  els.attachment.textContent = '';
  const thread = getActiveThread();
  const hasContext = Boolean(thread.pageContext);
  const hasConsole = Boolean(pendingConsole);
  const hasImage = Boolean(pendingImage);
  const hasWebPending = pendingWebSearch;
  const hasWebResults = Boolean(pendingWebResults.length);
  els.attachment.hidden = !hasContext && !hasConsole && !hasImage && !hasWebPending && !hasWebResults;
  if (!hasContext && !hasConsole && !hasImage && !hasWebPending && !hasWebResults) return;

  if (hasContext) {
    const context = document.createElement('div');
    context.className = 'attachment-line';
    context.textContent = 'Page attached to Exten AI';
    els.attachment.append(context);
  }

  if (hasConsole) {
    const consoleLine = document.createElement('div');
    consoleLine.className = 'attachment-line';
    consoleLine.textContent = pendingConsole.length
      ? `Console attached: ${pendingConsole.length} recent entries`
      : 'Console attached: no entries captured yet';
    els.attachment.append(consoleLine);
  }

  if (hasWebPending || hasWebResults) {
    const webLine = document.createElement('div');
    webLine.className = 'attachment-line';
    webLine.textContent = hasWebPending
      ? 'Web search ready: next send will search the internet'
      : `Web attached: ${pendingWebResults.length} search results for "${pendingWebQuery}"`;
    els.attachment.append(webLine);
  }

  if (hasImage) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'attachment-image-wrap';

    const label = document.createElement('div');
    label.className = 'attachment-line';
    label.textContent = 'Selected area ready to send';

    const image = document.createElement('img');
    image.alt = 'Selected page area';
    image.src = pendingImage;
    image.className = 'attachment-preview-img';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'attachment-remove';
    removeBtn.type = 'button';
    removeBtn.title = 'Remove selected area';
    removeBtn.setAttribute('aria-label', 'Remove selected area');
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      pendingImage = '';
      renderAttachment();
    });

    imageWrap.append(label, image, removeBtn);
    els.attachment.append(imageWrap);
  }
}

async function cropDataUrl(dataUrl, selection, viewport) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / viewport.width;
  const scaleY = image.naturalHeight / viewport.height;
  const sourceX = Math.round(selection.x * scaleX);
  const sourceY = Math.round(selection.y * scaleY);
  const sourceWidth = Math.round(selection.width * scaleX);
  const sourceHeight = Math.round(selection.height * scaleY);
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  canvas.getContext('2d').drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  return canvas.toDataURL('image/jpeg', 0.86);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load captured screenshot.'));
    image.src = dataUrl;
  });
}

function createThread(messages = [], tab = null) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: messages.length ? titleFromMessages(messages) : 'New chat',
    createdAt: now,
    updatedAt: now,
    tabId: tab?.id || null,
    tabUrl: tab?.url || '',
    archived: false,
    pageContext: null,
    messages: normalizeHistory(messages)
  };
}

function normalizeThreads(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((thread) => ({
      id: typeof thread.id === 'string' ? thread.id : crypto.randomUUID(),
      title: typeof thread.title === 'string' && thread.title.trim() ? thread.title.trim() : titleFromMessages(thread.messages || []),
      createdAt: Number(thread.createdAt) || Date.now(),
      updatedAt: Number(thread.updatedAt) || Number(thread.createdAt) || Date.now(),
      tabId: Number(thread.tabId) || null,
      tabUrl: typeof thread.tabUrl === 'string' ? thread.tabUrl : '',
      archived: Boolean(thread.archived),
      pageContext: thread.pageContext || null,
      messages: normalizeHistory(thread.messages || [])
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function ensureActiveThread() {
  if (!threads.length) threads = [createThread()];
  if (!threads.some((thread) => thread.id === activeThreadId)) {
    activeThreadId = threads[0].id;
  }
}

function getActiveThread() {
  ensureActiveThread();
  return threads.find((thread) => thread.id === activeThreadId);
}

async function prepareThreadForPanelOpen() {
  const response = await sendBackground({ type: 'GET_ACTIVE_TAB' }).catch(() => null);
  const tab = response?.tab;
  if (!tab?.id) return;

  currentTabId = tab.id;
  const thread = createThread([], tab);
  threads = [thread, ...threads];
  activeThreadId = thread.id;
  pendingContext = null;
  pendingConsole = null;
  pendingImage = '';
  pendingWebSearch = false;
  pendingWebResults = [];
  pendingWebQuery = '';
  await saveThreads();
}

async function syncThreadToActiveTab() {
  const response = await sendBackground({ type: 'GET_ACTIVE_TAB' }).catch(() => null);
  const tab = response?.tab;
  if (!tab?.url) return;
  currentTabId = tab.id || null;

  const thread = getActiveThread();
  if (!thread.tabUrl) {
    thread.tabId = tab.id || null;
    thread.tabUrl = tab.url;
    await saveThreads();
    return;
  }

  if (thread.tabUrl === tab.url) return;

  const blankThreadForTab = threads.find((item) => !item.archived && item.tabUrl === tab.url && isBlankThread(item));
  if (blankThreadForTab) {
    activeThreadId = blankThreadForTab.id;
  } else {
    const nextThread = createThread([], tab);
    threads = [nextThread, ...threads];
    activeThreadId = nextThread.id;
  }
  pendingContext = null;
  pendingConsole = null;
  pendingImage = '';
  pendingWebSearch = false;
  pendingWebResults = [];
  pendingWebQuery = '';
  await saveThreads();
}

async function archiveThreadById(threadId) {
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;
  thread.archived = true;
  thread.updatedAt = Date.now();
  if (thread.id === activeThreadId) {
    const nextThread = threads.find((item) => !item.archived && item.id !== thread.id) || createThread();
    if (!threads.includes(nextThread)) threads.unshift(nextThread);
    activeThreadId = nextThread.id;
    pendingContext = null;
    pendingConsole = null;
    pendingImage = '';
    pendingWebSearch = false;
    pendingWebResults = [];
    pendingWebQuery = '';
  }
  sortThreads();
  await saveThreads();
  renderMessages();
  renderAttachment();
  renderHistoryList();
  renderArchiveList();
  setStatus('Chat archived.');
}

async function restoreThreadById(threadId) {
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;
  thread.archived = false;
  thread.updatedAt = Date.now();
  sortThreads();
  await saveThreads();
  renderHistoryList();
  renderArchiveList();
  setStatus('Chat restored to history.');
}

async function deleteThreadById(threadId) {
  const thread = threads.find((item) => item.id === threadId);
  if (!thread) return;
  const confirmed = await requestConfirm({
    title: 'Delete chat?',
    body: `"${thread.title || 'Untitled chat'}" will be permanently removed from this device.`
  });
  if (!confirmed) return;

  threads = threads.filter((item) => item.id !== threadId);
  if (!threads.length) {
    const nextThread = createThread();
    threads = [nextThread];
    activeThreadId = nextThread.id;
  } else if (activeThreadId === threadId) {
    activeThreadId = (threads.find((item) => !item.archived) || threads[0]).id;
  }

  pendingContext = null;
  pendingConsole = null;
  pendingImage = '';
  pendingWebSearch = false;
  pendingWebResults = [];
  pendingWebQuery = '';
  await saveThreads();
  await syncThreadToActiveTab();
  renderMessages();
  renderAttachment();
  renderHistoryList();
  renderArchiveList();
  setStatus('Chat permanently deleted.');
}

function requestConfirm({ title, body }) {
  if (!els.confirmOverlay) return Promise.resolve(false);
  if (pendingConfirm) closeConfirm(false);

  els.confirmTitle.textContent = title;
  els.confirmBody.textContent = body;
  els.confirmOverlay.hidden = false;
  els.confirmAccept.focus();

  return new Promise((resolve) => {
    pendingConfirm = resolve;
  });
}

function closeConfirm(result) {
  if (!pendingConfirm) return;
  const resolve = pendingConfirm;
  pendingConfirm = null;
  if (els.confirmOverlay) els.confirmOverlay.hidden = true;
  resolve(result);
}

function sortThreads() {
  threads.sort((a, b) => b.updatedAt - a.updatedAt);
}

function isBlankThread(thread) {
  return !thread || !thread.messages.length;
}

async function saveThreads() {
  ensureActiveThread();
  await chrome.storage.local.set({
    [storageKeys.threads]: threads,
    [storageKeys.activeThreadId]: activeThreadId
  });
}

function titleFromMessages(messages) {
  const firstUserMessage = normalizeHistory(messages).find((message) => message.role === 'user');
  return firstUserMessage ? makeTitle(firstUserMessage.content) : 'New chat';
}

function makeTitle(text) {
  const title = String(text || '').replace(/\s+/g, ' ').trim();
  return title.length > 48 ? `${title.slice(0, 48)}...` : title || 'New chat';
}

function formatThreadDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

async function sendBackground(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Extension action failed.');
  return response;
}

async function withBusy(button, work) {
  button.disabled = true;
  try {
    await work();
  } catch (error) {
    setStatus(error.message || String(error));
  } finally {
    button.disabled = false;
  }
}

function setStatus(text) {
  els.status.textContent = text;
}

function resizePrompt() {
  if (!els.prompt) return;
  els.prompt.style.height = '32px';
  const nextHeight = Math.min(els.prompt.scrollHeight, 128);
  els.prompt.style.height = `${Math.max(32, nextHeight)}px`;
  els.prompt.style.overflowY = els.prompt.scrollHeight > 128 ? 'auto' : 'hidden';
}

function openSupport() {
  if (!els.supportOverlay) return;
  els.supportOverlay.hidden = false;
  els.supportClose?.focus();
}

function closeSupport() {
  if (els.supportOverlay) els.supportOverlay.hidden = true;
}
