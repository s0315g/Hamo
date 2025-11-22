// Netlify Function proxy that forwards chat requests to OpenAI Chat Completions.
// Set the environment variable OPENAI_API_KEY in Netlify site settings.
// The client POSTs { message, systemInstruction } and this function returns { text }.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { message, systemInstruction } = body;
  if (!message || typeof message !== 'string') {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing "message" string in body' }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server misconfiguration: OPENAI_API_KEY is not set' }),
    };
  }

  try {
    // Build messages array for the Chat Completions API
    const messages = [];
    if (systemInstruction && typeof systemInstruction === 'string') {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: message });

    // Call OpenAI Chat Completions endpoint using fetch (Node 18+ on Netlify supports fetch)
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('OpenAI error', resp.status, text);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'OpenAI API error', status: resp.status, details: text }),
      };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? JSON.stringify(data);

    // Truncate response by lines. Client may pass `maxLines` in the request body to override.
    const maxLinesRequested = body && body.maxLines ? Number(body.maxLines) : undefined;
    const maxLines = Number.isFinite(maxLinesRequested) && maxLinesRequested > 0 ? Math.min(20, maxLinesRequested) : 3;
    try {
      const lines = String(content).split(/\r?\n/).filter(l => l.trim() !== '');
      const truncated = lines.length > 0 ? lines.slice(0, maxLines).join('\n') : String(content).split(/\r?\n/).slice(0, maxLines).join('\n');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: truncated }),
      };
    } catch (e) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content }),
      };
    }
  } catch (err) {
    console.error('OpenAI proxy error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error', details: String(err) }),
    };
  }
};
