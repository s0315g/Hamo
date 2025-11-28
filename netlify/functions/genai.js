// Netlify Function proxy that forwards chat requests to OpenAI Chat Completions.
// Set the environment variable OPENAI_API_KEY in Netlify site settings.
// The client POSTs { message, systemInstruction } and this function returns { text }.

const DEFAULT_MODEL = 'gpt-3.5-turbo';

const jsonResponse = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async function handler(request) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { message, systemInstruction } = body;
  if (!message || typeof message !== 'string') {
    return jsonResponse(400, { error: 'Missing "message" string in body' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: 'Server misconfiguration: OPENAI_API_KEY is not set' });
  }

  try {
    // Optional: try backend chat endpoint first. This lets deployments that implement
    // server-side QA return their own answer structure (e.g., { answer: '...' }).
    // Enable by setting environment variable BACKEND_BASE and BACKEND_USE_CHAT_FIRST=true,
    // or by client sending `useBackendChat: true` in the request body.
    const wantsStream = Boolean(body && body.stream);
    const forceOpenAI = Boolean(body && body.forceOpenAI);
    const tryBackendChat = !forceOpenAI && ((process.env.BACKEND_BASE && (process.env.BACKEND_USE_CHAT_FIRST === 'true')) || Boolean(body && body.useBackendChat));
    if (tryBackendChat) {
      try {
        const backendBase = process.env.BACKEND_BASE || 'http://15.165.213.11:8080';
        const chatPath = process.env.BACKEND_CHAT_PATH || '/api/chat';
        const chatUrl = `${backendBase}${chatPath}`;
        console.debug('[genai] trying backend chat:', chatUrl);
        const chatResp = await fetch(chatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: message }),
        });
        if (chatResp.ok) {
          // Mirror backend response when possible. Support JSON, arrays, or text/event-stream.
          const contentType = (chatResp.headers.get('content-type') || '');
          if (contentType.includes('application/json')) {
            const chatData = await chatResp.json().catch(() => null);
            if (chatData !== null) {
              return jsonResponse(200, chatData);
            }
          }
          // Fallback for SSE or plain text responses: read body and normalize/merge pieces
          const textBody = await chatResp.text().catch(() => '');
          // Remove `data:` prefixes, skip [DONE], try to parse JSON chunks, then merge into one paragraph.
          const cleanStream = (body) => {
            if (!body) return '';
            const parts = [];
            for (const rawLine of body.split(/\r?\n/)) {
              if (rawLine == null) continue;
              let line = rawLine.replace(/\r$/, '');
              if (!line) continue;
              if (line.trim() === '[DONE]') continue;
              if (/^\s*data:/i.test(line)) {
                line = line.replace(/^\s*data:\s*/i, '');
                if (line === '') continue;
              }
              // try parse JSON line
              try {
                const parsed = JSON.parse(line);
                if (typeof parsed === 'string') {
                  parts.push(parsed);
                } else if (parsed && typeof parsed === 'object') {
                  if (typeof parsed.answer === 'string') parts.push(parsed.answer);
                  else if (typeof parsed.text === 'string') parts.push(parsed.text);
                  else if (typeof parsed.content === 'string') parts.push(parsed.content);
                  else if (typeof parsed.delta === 'string') parts.push(parsed.delta);
                  else parts.push(JSON.stringify(parsed));
                } else {
                  parts.push(String(parsed));
                }
              } catch (e) {
                parts.push(line);
              }
            }
            if (parts.length === 0) return '';
            const singleCharCount = parts.reduce((acc, p) => acc + (String(p).trim().length <= 1 ? 1 : 0), 0);
            const joinWithNoSpace = singleCharCount / parts.length > 0.6;
            let merged = joinWithNoSpace ? parts.join('') : parts.join(' ');
            // Ensure punctuation is followed by a space for readability
            merged = merged.replace(/([,.!?])(?=\S)/g, '$1 ');
            // Collapse repeated whitespace and trim
            merged = merged.replace(/\s{2,}/g, ' ').trim();
            // If hangul text still lacks spaces, try Intl.Segmenter to insert word boundaries
            const hangulMatches = merged.match(/[\uAC00-\uD7AF]/g) || [];
            const spaceMatches = merged.match(/\s/g) || [];
            const hangulRatio = hangulMatches.length / Math.max(merged.length, 1);
            const spaceRatio = spaceMatches.length / Math.max(merged.length, 1);
            if (hangulRatio > 0.4 && spaceRatio < 0.05 && typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
              try {
                const seg = new Intl.Segmenter('ko', { granularity: 'word' });
                const pieces = [];
                for (const { segment } of seg.segment(merged)) {
                  const trimmed = segment.trim();
                  if (!trimmed) continue;
                  pieces.push(trimmed);
                }
                const spaced = pieces.join(' ');
                if (spaced.length > 0) {
                  merged = spaced.replace(/\s{2,}/g, ' ').trim();
                }
              } catch (segErr) {
                console.warn('[genai] Intl.Segmenter spacing failed:', segErr);
              }
            }
            return merged;
          };

          let cleaned = cleanStream(textBody);
          if (cleaned) {
            const hangulCount = (cleaned.match(/[\uAC00-\uD7AF]/g) || []).length;
            const spaceCount = (cleaned.match(/\s/g) || []).length;
            const totalLen = Math.max(cleaned.length, 1);
            const hangulRatio = hangulCount / totalLen;
            const spaceRatio = spaceCount / totalLen;
            const needsOpenAISpacing = hangulRatio > 0.2 && spaceRatio < 0.18;
            const forceSpacing = Boolean(body && body.forceSpacing);
            if (forceSpacing || needsOpenAISpacing) {
              cleaned = await fixHangulSpacingWithOpenAI(cleaned, apiKey);
            }
          }
          return jsonResponse(200, { text: cleaned, source: 'backend-merged' });
        } else {
          console.debug('[genai] backend chat returned non-ok', chatResp.status);
        }
      } catch (e) {
        console.warn('[genai] backend chat attempt failed:', String(e));
      }
    }

    // Build messages array for the Chat Completions API
    const messages = [];

    // Note: retrieval is handled inside backend chat; do not call retrieve separately.

    if (systemInstruction && typeof systemInstruction === 'string') {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: message });

    // Call OpenAI Chat Completions endpoint using fetch (Node 18+ on Netlify supports fetch)
    if (wantsStream) {
      return await streamOpenAIResponse({ messages, apiKey, temperature: 0.7, maxTokens: 800 });
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('OpenAI error', resp.status, text);
      return jsonResponse(502, { error: 'OpenAI API error', status: resp.status, details: text });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? JSON.stringify(data);

    // Truncate response by lines. Client may pass `maxLines` in the request body to override.
    const maxLinesRequested = body && body.maxLines ? Number(body.maxLines) : undefined;
    const maxLines = Number.isFinite(maxLinesRequested) && maxLinesRequested > 0 ? Math.min(20, maxLinesRequested) : 3;
    try {
      const lines = String(content).split(/\r?\n/).filter(l => l.trim() !== '');
      const truncated = lines.length > 0 ? lines.slice(0, maxLines).join('\n') : String(content).split(/\r?\n/).slice(0, maxLines).join('\n');
      return jsonResponse(200, { text: truncated });
    } catch (e) {
      return jsonResponse(200, { text: content });
    }
  } catch (err) {
    console.error('OpenAI proxy error:', err);
    return jsonResponse(500, { error: 'Internal Server Error', details: String(err) });
  }
}

async function fixHangulSpacingWithOpenAI(text, apiKey) {
  if (!apiKey) return text;
  // Limit prompt size to avoid excessive tokens
  const MAX_CHARS = 1500;
  const trimmedInput = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const prompt = `다음 한국어 문장은 띄어쓰기가 거의 없습니다. 의미를 바꾸지 말고 자연스러운 문장으로 띄어쓰기를 넣어 주세요. 다른 주석을 덧붙이지 말고 결과 문장만 출력하세요.\n\n${trimmedInput}`;
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: '당신은 한국어 문장을 자연스럽게 띄어쓰기 하는 교정 도우미입니다.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: Math.min(900, Math.floor(trimmedInput.length * 1.2) + 50),
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.warn('[genai] spacing OpenAI call failed', resp.status, errText);
      return text;
    }
    const data = await resp.json();
    const fixed = data?.choices?.[0]?.message?.content?.trim();
    return fixed && fixed.length > 0 ? fixed : text;
  } catch (err) {
    console.warn('[genai] spacing OpenAI call threw', err);
    return text;
  }
}

async function streamOpenAIResponse({ messages, apiKey, temperature, maxTokens }) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    return new Response(JSON.stringify({ error: 'OpenAI API error', status: resp.status, details: text }), {
      status: resp.status || 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({ event: 'start' });

      const reader = resp.body.getReader();
      let buffer = '';
      let fullText = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const eventChunk of events) {
            const lines = eventChunk.split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              if (!line.startsWith('data:')) continue;
              const dataStr = line.replace(/^data:\s*/, '');
              if (dataStr === '[DONE]') {
                send({ event: 'complete', text: fullText });
                controller.close();
                return;
              }
              let parsed;
              try {
                parsed = JSON.parse(dataStr);
              } catch (parseErr) {
                console.warn('[genai] failed to parse stream chunk', parseErr);
                continue;
              }
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                send({ event: 'delta', text: delta, fullText });
              }
            }
          }
        }
        send({ event: 'complete', text: fullText });
        controller.close();
      } catch (err) {
        console.error('[genai] error streaming OpenAI response', err);
        send({ event: 'error', message: String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
