const sessionName = 'atd_session';
const encoder = new TextEncoder();

function toB64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function fromB64Url(str) {
  const normalized = str.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(bytes, c => c.charCodeAt(0));
}
async function keyFromSecret(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
async function checkPassword(input, expected) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(input)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
export async function validPassword(input, env) {
  return env.DASHBOARD_PASSWORD?.length >= 14 && typeof input === 'string' &&
    await checkPassword(input, env.DASHBOARD_PASSWORD);
}
export async function makeSession(env) {
  const data = { exp: Date.now() + 8 * 60 * 60_000, v: 1 };
  const body = toB64Url(encoder.encode(JSON.stringify(data)));
  const signature = await crypto.subtle.sign('HMAC', await keyFromSecret(env.SESSION_SECRET), encoder.encode(body));
  return `${body}.${toB64Url(signature)}`;
}
export async function validSession(request, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return false;
  const cookie = request.headers.get('Cookie') || '';
  const raw = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(sessionName + '='))?.slice(sessionName.length + 1);
  if (!raw || raw.length > 512) return false;
  const chunks = raw.split('.');
  if (chunks.length !== 2) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(chunks[0])));
    if (payload.v !== 1 || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return false;
    return crypto.subtle.verify('HMAC', await keyFromSecret(env.SESSION_SECRET), fromB64Url(chunks[1]), encoder.encode(chunks[0]));
  } catch { return false; }
}
export function sessionCookie(request, token) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`;
}
export function expiredSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
export function isSameOrigin(request) {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  // When present and non-null, Origin always takes precedence.
  if (origin && origin !== 'null') return origin === expected;

  // A privacy-sensitive browser or an older cached login form can send
  // Origin: null. Browsers protect Sec-Fetch-* against modification by JS.
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite !== null) return fetchSite === 'same-origin';

  // Older browsers without Fetch Metadata may provide a Referer.
  const referer = request.headers.get('Referer');
  if (referer) {
    try { return new URL(referer).origin === expected; }
    catch { return false; }
  }
  // Fail closed when the browser provides no reliable origin context.
  return false;
}
