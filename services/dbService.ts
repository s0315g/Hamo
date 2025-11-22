import { THEMES_DB, QUIZZES_DB } from '../db';

// Base URL for remote API. Prefer Vite env var. When the app is served
// over HTTPS (e.g. Netlify), avoid mixed-content by using the Netlify
// function proxy path `/.netlify/functions/backend-proxy?path=` by default.
const DEFAULT_BACKEND = 'http://15.165.213.11:8080';
const envApi = ((import.meta as any).env?.VITE_API_BASE_URL as string) || '';
const useProxyOnHttps = (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:');
// If an explicit env var is provided, use it. Otherwise, when served
// over HTTPS prefer the Netlify function proxy to avoid mixed-content.
const API_BASE = envApi || (useProxyOnHttps ? '/.netlify/functions/backend-proxy?path=' : DEFAULT_BACKEND);
// Optional fallback used during local development if the proxy path is not available.
const FALLBACK_API = ((import.meta as any).env?.VITE_API_FALLBACK as string) || DEFAULT_BACKEND;

async function fetchJson(path: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    const text = await res.text();

    if (!res.ok) {
      // Include response text (if any) to help diagnose server errors
      const msg = `HTTP ${res.status} ${res.statusText} - ${text.slice(0, 1000)}`;
      throw new Error(msg);
    }

    // Try parsing JSON; if parse fails, include the raw text for debugging
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      const msg = `Failed to parse JSON response from ${url}: ${parseErr} - response text: ${text.slice(0,1000)}`;
      throw new Error(msg);
    }
  } catch (err) {
    clearTimeout(id);
    // If the configured API_BASE points to the Netlify function proxy (used in production)
    // but during local development that path is not served, try the fallback backend directly.
    try {
      if (API_BASE.startsWith('/.netlify/functions')) {
        const fallbackUrl = `${FALLBACK_API}${path}`;
        console.info('fetchJson: proxy unreachable, trying fallback URL', fallbackUrl);
        const res2 = await fetch(fallbackUrl, { signal: controller.signal });
        const text2 = await res2.text();
        if (!res2.ok) throw new Error(`Fallback HTTP ${res2.status} ${res2.statusText} - ${text2.slice(0,1000)}`);
        try {
          return JSON.parse(text2);
        } catch (parseErr2) {
          throw new Error(`Failed to parse JSON response from fallback ${fallbackUrl}: ${parseErr2} - response text: ${text2.slice(0,1000)}`);
        }
      }
    } catch (fallbackErr) {
      // If fallback also fails, prefer reporting original error context but include fallback info.
      const orig = err instanceof Error ? err.message : String(err);
      const fb = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`Original fetch error: ${orig}; fallback error: ${fb}`);
    }
    // If we didn't try fallback (API_BASE not proxy), rethrow original error
    throw err;
  }
}

// Public API: try remote fetch; if it fails, fall back to local mock DB for development.
export const getThemes = async () => {
  try {
    const data = await fetchJson('/api/themes');
    // Normalize remote theme shape to front-end expected fields: { id, title, longDescription, contextPrompt, ... }
    if (Array.isArray(data)) {
      return data.map((t: any) => ({
        id: t.theme_id || t.id || t.ThemeID || t.themeId,
        title: t.theme_name || t.title || t.ThemeName || t.themeName,
        description: t.theme_desc || t.description || t.ThemeDesc || t.themeDesc,
        longDescription: t.long_description || t.theme_desc || t.longDescription || t.description || '',
        contextPrompt: t.context_prompt || t.contextPrompt || '',
        raw: t,
      }));
    }
    return data;
  } catch (err) {
    // Provide more context in logs: include API base and error message
    console.warn('getThemes: remote fetch failed, falling back to local DB. API_BASE=', API_BASE, 'error=', err instanceof Error ? err.message : err);
    // Simulate network delay similar to previous implementation
    await new Promise((r) => setTimeout(r, 300));
    // Ensure local DB also normalized
    return (THEMES_DB || []).map((t: any) => ({
      id: t.id || t.theme_id,
      title: t.title || t.theme_name,
      description: t.description || t.theme_desc,
      longDescription: t.longDescription || t.theme_desc || '',
      contextPrompt: t.contextPrompt || '',
      raw: t,
    }));
  }
};

// Diagnostic helper: fetch a path and return raw info useful for debugging from the browser
export type ProbeResult = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string,string>;
  bodyText: string;
  json?: any;
};

export const probeApi = async (path: string, timeoutMs = 8000): Promise<ProbeResult> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    const headers: Record<string,string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    const bodyText = await res.text();
    let json: any = undefined;
    try { json = bodyText ? JSON.parse(bodyText) : undefined; } catch (_) { /* ignore parse errors */ }
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers,
      bodyText,
      json,
    };
  } catch (err) {
    clearTimeout(id);
    const msg = (err instanceof Error) ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      statusText: msg,
      headers: {},
      bodyText: msg,
    };
  }
};

export const getItems = async (themeId: string) => {
  // Backend expects query parameter style: /api/items?theme_id=...
  try {
    const q = await fetchJson(`/api/items?theme_id=${encodeURIComponent(themeId)}`);
    if (q === null) {
      console.info(`getItems: server returned null for theme_id=${themeId}`);
      return [];
    }
    const rawItems = Array.isArray(q) ? q : (q ? [q] : []);
    // DEV: log raw quiz items and their normalized form to help debug mapping issues
    try {
      if ((import.meta as any).env?.DEV) {
        console.debug('DEV PROBE: raw quiz items for theme', themeId, rawItems);
      }
    } catch (e) {}

    const extractVideo = (it: any) => {
      if (!it) return null;
      let v = it.video || it.video_src || it.videoUrl || it.src || it.file || null;
      if (!v && it.media) v = it.media.video || it.media.url || null;
      if (!v && it.raw) v = it.raw.video || it.raw.video_src || it.raw.media?.video || it.raw.media_url || null;
      if (v === '') v = null;
      return v || null;
    };

    const normalize = (it: any, idx: number) => ({
      item_id: it.item_id || it.id || it.itemId || it.item_idx || `itm_${idx}`,
      item_name: it.item_name || it.name || it.title || it.itemName || `코스 ${idx + 1}`,
      video: extractVideo(it),
      raw: it,
      ...it,
    });

    return rawItems.map(normalize);
  } catch (err) {
    console.warn('getItems: remote fetch failed, falling back to local DB. error=', err instanceof Error ? err.message : err);
    // Fallback to local DB
    await new Promise((r) => setTimeout(r, 300));
    const allItems = (globalThis as any).ITEMS_DB || [];
    if (allItems.length > 0) {
      const filtered = allItems.filter((it: any) => it.theme_id === themeId);
      const extractVideo = (it: any) => {
        if (!it) return null;
        let v = it.video || it.video_src || it.videoUrl || it.src || it.file || null;
        if (!v && it.media) v = it.media.video || it.media.url || null;
        if (!v && it.raw) v = it.raw.video || it.raw.video_src || it.raw.media?.video || it.raw.media_url || null;
        if (v === '') v = null;
        return v || null;
      };
      return filtered.map((it: any, idx: number) => ({
        item_id: it.item_id || it.id || it.itemId || it.item_idx || `itm_local_${idx}`,
        item_name: it.item_name || it.name || it.title || it.itemName || `코스 ${idx + 1}`,
        video: extractVideo(it),
        raw: it,
        ...it,
      }));
    }
    return [];
  }
};

export const getQuizzes = async (themeId: string) => {
  // Backend expects query parameter style: /api/quizzes?theme_id=...
  try {
    const q = await fetchJson(`/api/quizzes?theme_id=${encodeURIComponent(themeId)}`);
    if (q === null) {
      console.info(`getQuizzes: server returned null for theme_id=${themeId}`);
      return [];
    }

    const rawItems = Array.isArray(q) ? q : (q ? [q] : []);

    const normalize = (item: any, idx: number) => {
      const question = item.question || item.question_text || item.prompt || item.title || item.q || '';

      let options: any = item.options || item.choices || item.answers || item.option_list || item.items || item.answer_list || item.option || null;
      // If options is an object (map), use its values
      if (options && typeof options === 'object' && !Array.isArray(options)) {
        options = Object.values(options);
      }
      // If options is a string, split by newline, pipe, or comma
      if (typeof options === 'string') {
        // Convert escaped newline sequences (literal "\\n") into real newlines,
        // then split by real newlines, pipe, or comma.
        let s = options;
        try {
          s = s.replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n');
        } catch (e) {
          /* ignore */
        }
        options = s.split(/\r?\n|\||,/) .map((s: string) => s.trim()).filter(Boolean);
      }
      // If still not an array, try to extract from common fields like a/b/c
      if (!Array.isArray(options)) {
        const guess = [];
        ['a','b','c','d','A','B','C','D'].forEach((k) => {
          if (item[k]) guess.push(item[k]);
        });
        options = guess;
      }

      const correct = item.correctAnswer || item.answer || item.correct || item.correct_answer || item.key || item.solution || item.correctOption || '';

      // If correct is an index (number or numeric string), map to option value
      let correctValue = correct;
      // If the correct answer is provided as an index (number or numeric string),
      // handle both 0-based (0..N-1) and 1-based (1..N) encodings used by some DBs.
      if ((typeof correct === 'number' || (typeof correct === 'string' && /^[0-9]+$/.test(correct))) && Array.isArray(options)) {
        const idxNum = Number(correct);
        if (idxNum >= 0 && idxNum < options.length) {
          // 0-based index
          correctValue = options[idxNum];
        } else if (idxNum >= 1 && idxNum <= options.length) {
          // 1-based index stored in DB (e.g., '1'..'4') -> convert to 0-based
          correctValue = options[idxNum - 1];
        }
      }

      const normalized = {
        question: question || `문제 ${idx + 1}`,
        options: Array.isArray(options) ? options : [],
        correctAnswer: correctValue,
        raw: item,
      };

      if (!normalized.options.length) console.warn('getQuizzes: no options parsed for item', normalized);
      return normalized;
    };

    return rawItems.map(normalize);
  } catch (err) {
    console.warn('getQuizzes: remote fetch failed, falling back to local DB. error=', err instanceof Error ? err.message : err);
    await new Promise((r) => setTimeout(r, 300));
    // Normalize local QUIZZES_DB entries as well
    const local = QUIZZES_DB[themeId] || [];
    return (Array.isArray(local) ? local : [local]).map((it: any, i: number) => ({
      question: it.question || it.q || it.prompt || it.title || `문제 ${i+1}`,
      options: it.options || it.choices || it.answers || [],
      correctAnswer: it.correct || it.answer || it.key || '',
      raw: it,
    }));
  }
};

export const getRecipients = async () => {
  try {
    return await fetchJson('/api/recipient');
  } catch (err) {
    console.warn('getRecipients: remote fetch failed:', err);
    return [];
  }
};

// Backwards-compatible alias: some modules import getQuizForTheme
export const getQuizForTheme = async (themeId: string) => {
  return getQuizzes(themeId);
};
