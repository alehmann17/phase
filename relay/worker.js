// Phase relay: lets the Phase web app read your own Garmin Connect data.
// Garmin's Personal API does not allow browser calls (CORS), so this Worker
// holds the API key, exchanges it for a 24 h token, and forwards a small
// allowlist of read-only requests.
//
// Secrets (Workers > Settings > Variables and Secrets):
//   GARMIN_API_KEY  your Garmin Connect Personal API key
//   APP_SECRET      any long random string; enter the same value in Phase
// Optional plain variable:
//   ALLOWED_ORIGIN  defaults to https://alehmann17.github.io

const GARMIN = 'https://personal.connectapi.garmin.com';
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';
const ALLOWED_PATHS = [
  /^\/activitylist-service\/activities\/search\/activities$/,
  /^\/download-service\/files\/activity\/\d+$/,
  /^\/hrv-service\/hrv\/daily\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/,
  /^\/sleep-service\/sleep\/dailySleepSummariesByDate$/,
  /^\/usersummary-service\/v2\/dailysummaries$/,
  /^\/biometric-service\/heartRateZones\/v2$/,
];
const TOKEN_CACHE_URL = 'https://phase-relay.internal/garmin-token';

let memToken = null; // { token, exp, keyTag }

export default {
  async fetch(request, env, ctx) {
    const allowed = env.ALLOWED_ORIGIN || 'https://alehmann17.github.io';
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Phase-Key',
      'Access-Control-Expose-Headers': 'Retry-After, Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, body, headers = {}) =>
      new Response(body, { status, headers: { ...cors, 'Content-Type': 'application/json', ...headers } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return reply(405, '{"error":"method"}');
    if (origin && origin !== allowed) return reply(403, '{"error":"origin"}');
    if (!env.GARMIN_API_KEY || !env.APP_SECRET) return reply(500, '{"error":"relay not configured"}');
    if (!safeEqual(request.headers.get('X-Phase-Key') || '', env.APP_SECRET)) return reply(401, '{"error":"key"}');

    const url = new URL(request.url);
    if (url.pathname === '/ping') return reply(200, '{"ok":true}');
    if (!ALLOWED_PATHS.some((re) => re.test(url.pathname))) return reply(404, '{"error":"path"}');

    const target = GARMIN + url.pathname + url.search;
    const isFile = url.pathname.startsWith('/download-service/');
    const accept = isFile ? 'application/zip, application/x-zip-compressed, application/octet-stream' : 'application/json';

    let res;
    try {
      let token = await getToken(env, ctx, false);
      res = await fetch(target, { headers: { Authorization: 'Bearer ' + token, Accept: accept } });
      if (res.status === 401) {
        token = await getToken(env, ctx, true);
        res = await fetch(target, { headers: { Authorization: 'Bearer ' + token, Accept: accept } });
      }
    } catch (e) {
      return reply(502, JSON.stringify({ error: 'garmin', detail: String(e && e.message || e) }));
    }

    const out = { ...cors, 'Content-Type': res.headers.get('Content-Type') || (isFile ? 'application/zip' : 'application/json'), 'Cache-Control': 'no-store' };
    const ra = res.headers.get('Retry-After');
    if (ra) out['Retry-After'] = ra;
    return new Response(res.body, { status: res.status, headers: out });
  },
};

async function getToken(env, ctx, force) {
  const keyTag = await sha256(env.GARMIN_API_KEY);
  const now = Date.now() / 1000;
  if (!force && memToken && memToken.keyTag === keyTag && memToken.exp - now > 3600) return memToken.token;

  const cache = caches.default;
  if (!force) {
    const hit = await cache.match(TOKEN_CACHE_URL);
    if (hit) {
      const c = await hit.json();
      if (c.keyTag === keyTag && c.exp - now > 3600) { memToken = c; return c.token; }
    }
  }

  const res = await fetch(GARMIN + TOKEN_PATH, {
    method: 'POST',
    headers: { Authorization: 'ApiKey ' + env.GARMIN_API_KEY.trim(), Accept: '*/*' },
  });
  const text = (await res.text()).trim();
  if (!res.ok) throw new Error('token ' + res.status + ' ' + text.slice(0, 200));
  let token = text;
  if (text.startsWith('{')) { try { token = JSON.parse(text).access_token || ''; } catch (e) { token = ''; } }
  const exp = jwtExp(token);
  if (!token || !exp) throw new Error('token response was not a JWT');

  memToken = { token, exp, keyTag };
  const ttl = Math.max(60, Math.floor(exp - now - 3600));
  ctx.waitUntil(cache.put(TOKEN_CACHE_URL, new Response(JSON.stringify(memToken), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + ttl },
  })));
  return token;
}

function jwtExp(jwt) {
  try {
    const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4))).exp || null;
  } catch (e) { return null; }
}

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
