const consoleEntries = [];
const maxConsoleEntries = 120;
let consoleCaptureReady = false;

window.addEventListener('message', (event) => {
  if (event.data?.source === 'EXTEN_AI_CONSOLE_READY') {
    consoleCaptureReady = true;
    return;
  }
  if (event.data?.source !== 'EXTEN_AI_CONSOLE') return;
  const entry = {
    level: event.data.level || 'log',
    text: Array.isArray(event.data.args) ? event.data.args.join(' ') : '',
    timestamp: event.data.timestamp || Date.now(),
    url: event.data.url || location.href
  };
  if (!entry.text.trim()) return;
  consoleEntries.push(entry);
  if (consoleEntries.length > maxConsoleEntries) {
    consoleEntries.splice(0, consoleEntries.length - maxConsoleEntries);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PING_EXTEN_AI') {
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === 'GET_PAGE_CONTEXT') {
    sendResponse({ ok: true, context: getPageContext() });
    return;
  }

  if (message?.type === 'GET_CONSOLE_CONTEXT') {
    sendResponse({
      ok: true,
      ready: consoleCaptureReady,
      entries: consoleEntries.slice(-maxConsoleEntries)
    });
    return;
  }

  if (message?.type === 'START_REGION_SELECT') {
    startRegionSelect().then(sendResponse);
    return true;
  }
});

function getPageContext() {
  const selection = window.getSelection()?.toString() || '';
  const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
  const headings = Array.from(document.querySelectorAll('h1, h2'))
    .map((heading) => heading.textContent.trim())
    .filter(Boolean)
    .slice(0, 12);
  const bodyText = document.body?.innerText || '';

  return {
    title: document.title,
    url: location.href,
    selectedText: selection,
    metaDescription,
    headings,
    bodyText
  };
}

function startRegionSelect() {
  return new Promise((resolve) => {
    const previous = document.getElementById('exten-ai-selector');
    if (previous) previous.remove();

    const overlay = document.createElement('div');
    overlay.id = 'exten-ai-selector';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'cursor:crosshair',
      'background:rgba(0,0,0,.12)'
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
      'position:fixed',
      'border:2px solid #fff',
      'background:rgba(25,25,25,.18)',
      'box-shadow:0 0 0 9999px rgba(0,0,0,.28)',
      'display:none'
    ].join(';');

    const hint = document.createElement('div');
    hint.textContent = 'Drag to select. Release to attach. Esc to cancel.';
    hint.style.cssText = [
      'position:fixed',
      'left:12px',
      'top:12px',
      'padding:8px 10px',
      'border-radius:7px',
      'background:#191919',
      'color:#fff',
      'font:13px system-ui,sans-serif'
    ].join(';');

    overlay.append(box, hint);
    document.documentElement.append(overlay);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
    };

    const finish = (selection) => {
      cleanup();
      resolve(selection);
    };

    const draw = (event) => {
      const x = Math.min(startX, event.clientX);
      const y = Math.min(startY, event.clientY);
      const width = Math.abs(event.clientX - startX);
      const height = Math.abs(event.clientY - startY);
      box.style.display = 'block';
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      return { x, y, width, height, viewportWidth: innerWidth, viewportHeight: innerHeight };
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') finish({ ok: false, error: 'Selection cancelled.' });
    };

    overlay.addEventListener('mousedown', (event) => {
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      draw(event);
    });

    overlay.addEventListener('mousemove', (event) => {
      if (dragging) draw(event);
    });

    overlay.addEventListener('mouseup', (event) => {
      if (!dragging) return;
      dragging = false;
      const selection = draw(event);
      if (selection.width < 8 || selection.height < 8) {
        finish({ ok: false, error: 'Selection was too small.' });
        return;
      }
      finish({ ok: true, selection });
    });

    window.addEventListener('keydown', onKeyDown, true);
  });
}
