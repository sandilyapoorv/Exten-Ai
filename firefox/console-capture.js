(function installExtenAiConsoleCapture() {
  if (window.__extenAiConsoleCaptureInstalled) return;
  window.__extenAiConsoleCaptureInstalled = true;

  const emit = (level, args) => {
    window.postMessage({
      source: 'EXTEN_AI_CONSOLE',
      level,
      args: Array.from(args, serializeConsoleValue),
      timestamp: Date.now(),
      url: location.href
    }, '*');
  };

  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'assert']) {
    const original = console[method];
    if (typeof original !== 'function') continue;
    console[method] = function patchedConsoleMethod(...args) {
      if (method !== 'assert' || args[0] === false) emit(method, method === 'assert' ? args.slice(1) : args);
      return original.apply(this, args);
    };
  }

  window.addEventListener('error', (event) => {
    emit('error', [`${event.message || 'Unhandled error'} at ${event.filename || location.href}:${event.lineno || 0}:${event.colno || 0}`]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    emit('error', ['Unhandled promise rejection', event.reason]);
  });

  window.postMessage({
    source: 'EXTEN_AI_CONSOLE_READY',
    timestamp: Date.now(),
    url: location.href
  }, '*');

  function serializeConsoleValue(value) {
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ''}`.trim();
    if (typeof value === 'string') return value;
    if (value === undefined) return 'undefined';
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }
}());
