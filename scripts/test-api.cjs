const API_BASE = process.env.API_BASE || 'http://15.165.213.11:8080';

async function probe(path) {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, { method: 'GET' });
    const text = await res.text();
    console.log(`\n[OK] ${url} -> ${res.status} ${res.statusText}`);
    try {
      const json = JSON.parse(text);
      console.log('Sample JSON keys:', Object.keys(json).slice(0, 10));
      console.log('First item preview:', Array.isArray(json) ? json[0] : json);
    } catch (_) {
      console.log('Response text preview:', text.slice(0, 200));
    }
  } catch (err) {
    console.error(`\n[ERR] ${url} ->`, err.message || err);
  }
}

async function run() {
  console.log('Probing API base:', API_BASE);
  await probe('/api/themes');
  // Test both query-param and path-param styles for items/quizzes
  const sampleIds = ['jinju_museum', 'thm_cannon_004', 'nonexistent_test'];
  for (const id of sampleIds) {
    await probe(`/api/items?theme_id=${encodeURIComponent(id)}`);
    await probe(`/api/items/${encodeURIComponent(id)}`);
    await probe(`/api/quizzes?theme_id=${encodeURIComponent(id)}`);
    await probe(`/api/quizzes/${encodeURIComponent(id)}`);
  }
  await probe('/api/recipient');
}

run();
