export function limitText(value, maxLength = 8000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function normalizeHistory(history, maxMessages = 50) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((message) => (
      message
      && ['user', 'assistant', 'system'].includes(message.role)
      && typeof message.content === 'string'
      && message.content.trim()
    ))
    .slice(-maxMessages)
    .map((message) => {
      const normalized = { role: message.role, content: message.content };
      // Preserve the captured area screenshot for rendering in the chat UI
      if (message.role === 'user' && typeof message.imageDataUrl === 'string' && message.imageDataUrl) {
        normalized.imageDataUrl = message.imageDataUrl;
      }
      return normalized;
    });
}

export function formatWebsiteContext(context = {}) {
  const lines = [];
  if (context.title) lines.push(`Title: ${context.title}`);
  if (context.url) lines.push(`URL: ${context.url}`);
  if (context.metaDescription) lines.push(`Description: ${context.metaDescription}`);
  if (context.selectedText) lines.push(`Selected text: ${limitText(context.selectedText, 2000)}`);
  if (Array.isArray(context.headings) && context.headings.length) {
    lines.push(`Headings: ${context.headings.slice(0, 12).join('; ')}`);
  }
  if (context.bodyText) lines.push(`Page text: ${limitText(context.bodyText, 10000)}`);
  return lines.join('\n');
}

export function formatConsoleContext(entries = []) {
  if (!Array.isArray(entries) || !entries.length) {
    return 'Recent console output: no console entries captured yet.';
  }

  const rank = { error: 0, warn: 1, assert: 2, debug: 3, info: 4, log: 5 };
  const lines = entries
    .filter((entry) => entry && typeof entry.text === 'string' && entry.text.trim())
    .sort((a, b) => (rank[a.level] ?? 9) - (rank[b.level] ?? 9) || (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 50)
    .map((entry) => `[${entry.level || 'log'}] ${limitText(entry.text, 1200)}`);

  if (!lines.length) return 'Recent console output: no console entries captured yet.';
  return `Recent console output:\n${lines.join('\n')}`;
}

export function formatSearchContext(query, results = []) {
  const safeQuery = limitText(query || '', 500);
  if (!Array.isArray(results) || !results.length) {
    return `Web search query: ${safeQuery}\nNo web results were found.`;
  }

  const lines = [`Web search query: ${safeQuery}`];
  results.slice(0, 5).forEach((result, index) => {
    lines.push(`${index + 1}. Title: ${limitText(result.title || 'Untitled', 200)}`);
    lines.push(`   URL: ${limitText(result.url || '', 400)}`);
    if (result.snippet) lines.push(`   Snippet: ${limitText(result.snippet, 500)}`);
  });
  return lines.join('\n');
}

export function buildGroqPayload({
  model,
  responseMode = 'instant',
  history = [],
  message,
  contextText = '',
  imageDataUrl = ''
}) {
  const thinkingMode = responseMode === 'thinking';
  const hasImage = Boolean(imageDataUrl);
  const hasWebContext = String(contextText || '').includes('Web search query:');
  const supportsImage = model.includes('vision') || model.includes('llama-4');

  const systemLines = [
    'You are Exten AI, a smart browser assistant.',
    'No generic AI filler. No long introductions. Get straight to the point.',
  ];

  if (hasImage && supportsImage) {
    // Vision task — respond naturally to whatever the user asks about the image
    systemLines.push(
      'The user has attached a screenshot from their browser.',
      'Analyse the image and answer the user\'s question directly and naturally.',
      'Do NOT use rigid "Answer / Evidence / Fix" formatting unless the task specifically calls for debugging.',
      'If describing content, just describe it clearly. If asked to fix something, give concrete steps.',
      'ACCURACY RULES FOR NUMBERS AND DATA:',
      '- Only report a number with the exact label the UI shows next to it. Never rename or relabel metrics.',
      '- Example: if the UI shows a heart icon followed by "1.2M", say "1.2M likes" — do NOT call it followers.',
      '- If you can see a number but cannot clearly read its label from the UI, say "I can see X but the label is not clear in the screenshot".',
      '- Do NOT infer what a number means from context — read only what is explicitly shown.',
      '- If two numbers are present and you are unsure which is which, list them exactly as they appear left-to-right.',
      thinkingMode
        ? 'Be thorough but concise. Use markdown for structure when it genuinely helps.'
        : 'Be brief and direct. Plain prose or short bullets only.'
    );
  } else {
    // Text / debugging task — keep the structured debug format
    systemLines.push(
      'Use only the supplied browser context: page text, selected text, console output, URL, and user message.',
      'If the answer is not in the supplied browser context, say what is missing. Do not invent page facts, console errors, selectors, files, APIs, or causes.',
      hasWebContext
        ? 'When web search results are attached, answer only from those attached results and cite the source URLs you used.'
        : 'Do not claim to have searched the web unless attached web results are present.',
      thinkingMode
        ? 'Thinking mode: give a fuller answer, but keep it crisp, structured, and grounded.'
        : 'Instant mode: terse, high signal, plain English.',
      thinkingMode
        ? 'Answer format:\n1. Summary: direct conclusion.\n2. Evidence: exact page/console clues used.\n3. Root cause: what is most likely happening and why.\n4. Step-by-step fix: concrete actions or code-level direction.\n5. Check: how to verify the fix worked.'
        : 'Answer format:\n1. Answer: direct conclusion.\n2. Evidence: exact page/console clue used.\n3. Fix: concrete steps or code-level direction.',
      'If there is no useful context, ask the user to attach page, console, web search, or selected area.'
    );
  }

  const messages = [
    { role: 'system', content: systemLines.join('\n') },
    ...normalizeHistory(history, 20).map((item) => ({
      role: item.role,
      content: item.content
    }))
  ];

  const sections = [];
  if (contextText) {
    sections.push(`Browser context:\n${contextText}`);
  } else if (!hasImage) {
    sections.push('Browser context:\nNo browser context is attached. Do not guess from the website.');
  }
  if (hasImage && supportsImage) {
    sections.push('Screenshot attached. Answer the user\'s question about it.');
  }
  if (hasImage && !supportsImage) {
    sections.push('Selected area note: the user selected a screenshot area, but this text model cannot inspect images.');
  }
  sections.push(`User message:\n${message}`);
  const text = sections.join('\n\n');

  messages.push({
    role: 'user',
    content: hasImage && supportsImage
      ? [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ]
      : text
  });

  return {
    model,
    messages,
    temperature: thinkingMode ? 0.2 : 0.4,
    max_tokens: hasImage ? 800 : (thinkingMode ? 1200 : 500)
  };
}

export function cropSelectionToViewport(selection, viewport) {
  const maxWidth = Number(viewport?.width) || 0;
  const maxHeight = Number(viewport?.height) || 0;
  const x = Math.max(0, Number(selection?.x) || 0);
  const y = Math.max(0, Number(selection?.y) || 0);
  const width = Math.max(0, Math.min(Number(selection?.width) || 0, maxWidth - x));
  const height = Math.max(0, Math.min(Number(selection?.height) || 0, maxHeight - y));
  return { x, y, width, height };
}
