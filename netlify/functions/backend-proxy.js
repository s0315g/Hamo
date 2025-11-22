// Netlify function: backend-proxy
// Forwards requests to the museum backend and returns the response.
// Usage from client: /.netlify/functions/backend-proxy?path=/api/themes

exports.handler = async function(event) {
  // Allow any origin (change for production to restrict domains)
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  const qs = event.queryStringParameters || {};
  const path = qs.path || '/api/themes';
  const targetBase = process.env.BACKEND_BASE || 'http://15.165.213.11:8080';
  const targetUrl = `${targetBase}${path}`;

  try {
    // Use global fetch (Node 18+). If not available, fallback to node-fetch (not included here).
    const fetchRes = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: event.headers || {},
      body: event.body || undefined,
    });

    const bodyText = await fetchRes.text();
    const headers = { 'Content-Type': fetchRes.headers.get('content-type') || 'application/json', ...CORS_HEADERS };

    return {
      statusCode: fetchRes.status,
      headers,
      body: bodyText
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: String(err)
    };
  }
};
