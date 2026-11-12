import crypto from 'node:crypto';

const ROLES = { eabha: 'EABHA_PIN', niall: 'NIALL_PIN' };
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export function loggingReady() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN &&
    process.env.EABHA_PIN &&
    process.env.NIALL_PIN &&
    process.env.LOG_SECRET
  );
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

export function pinMatches(role, pin) {
  const envName = ROLES[role];
  const expected = envName ? process.env[envName] : '';
  if (!expected || pin === undefined || pin === null || pin === '') return false;
  return crypto.timingSafeEqual(digest(pin), digest(expected));
}

export function signToken(role) {
  const body = Buffer.from(JSON.stringify({
    role,
    exp: Date.now() + TWELVE_HOURS,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.LOG_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readToken(token) {
  if (!token || !process.env.LOG_SECRET) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', process.env.LOG_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!ROLES[payload.role] || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearer(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? readToken(match[1].trim()) : null;
}
