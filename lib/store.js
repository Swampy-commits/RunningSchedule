import { Redis } from '@upstash/redis';

const LOGS = 'eabha:logs';
const STRIKES = 3;
const BASE_LOCK = 15 * 60;
const MAX_LOCK = 24 * 60 * 60;
const GLOBAL_LIMIT = 20;
const GLOBAL_WINDOW = 24 * 60 * 60;
const GLOBAL_LOCK_SECONDS = 60 * 60;

const failKey = ip => `eabha:pinfail:${ip}`;
const levelKey = ip => `eabha:pinlevel:${ip}`;
const lockKey = ip => `eabha:pinlock:${ip}`;
const GLOBAL_FAILS = 'eabha:pinfail:all';
const GLOBAL_LOCK = 'eabha:pinlock:all';

let redisOverride = null;

export function redis() {
  return redisOverride || Redis.fromEnv();
}

export function setRedisForTests(db) {
  redisOverride = db || null;
}

export function lockSeconds(level) {
  return Math.min(BASE_LOCK * (2 ** level), MAX_LOCK);
}

export function retryMessage(seconds) {
  const minutes = Math.max(1, Math.ceil(Number(seconds) / 60));
  if (minutes < 60) {
    return `Too many tries. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }
  const hours = Math.ceil(minutes / 60);
  return `Too many tries. Try again in ${hours} hour${hours === 1 ? '' : 's'}.`;
}

export function wrongMessage(remaining) {
  return `Wrong passcode. ${remaining === 1 ? '1 try' : remaining + ' tries'} left.`;
}

function positiveTtl(ttl) {
  return Number(ttl) > 0 ? Number(ttl) : 0;
}

export async function signInBlocked(ip, db = redis()) {
  const globalTtl = positiveTtl(await db.ttl(GLOBAL_LOCK));
  if (globalTtl) return { retrySeconds: globalTtl };
  const ipTtl = positiveTtl(await db.ttl(lockKey(ip)));
  if (ipTtl) return { retrySeconds: ipTtl };
  const seen = Number(await db.get(GLOBAL_FAILS)) || 0;
  if (seen > GLOBAL_LIMIT) {
    await db.set(GLOBAL_LOCK, '1', { ex: GLOBAL_LOCK_SECONDS });
    await db.del(GLOBAL_FAILS);
    return { retrySeconds: GLOBAL_LOCK_SECONDS };
  }
  return null;
}

export async function recordWrongPasscode(ip, db = redis()) {
  const globalCount = await db.incr(GLOBAL_FAILS);
  if (globalCount === 1) await db.expire(GLOBAL_FAILS, GLOBAL_WINDOW);
  let globalFor = 0;
  if (globalCount > GLOBAL_LIMIT) {
    await db.set(GLOBAL_LOCK, '1', { ex: GLOBAL_LOCK_SECONDS });
    await db.del(GLOBAL_FAILS);
    globalFor = GLOBAL_LOCK_SECONDS;
  }

  const fails = await db.incr(failKey(ip));
  if (fails >= STRIKES) {
    const level = Number(await db.get(levelKey(ip))) || 0;
    const seconds = lockSeconds(level);
    if (fails === STRIKES) {
      await db.set(lockKey(ip), '1', { ex: seconds });
      await db.set(levelKey(ip), String(level + 1));
      await db.del(failKey(ip));
    }
    const ipFor = positiveTtl(await db.ttl(lockKey(ip))) || seconds;
    return { retrySeconds: Math.max(ipFor, globalFor), remaining: 0 };
  }
  if (globalFor) return { retrySeconds: globalFor, remaining: 0 };
  return { retrySeconds: 0, remaining: STRIKES - fails };
}

export async function clearSignInFailures(ip, db = redis()) {
  await db.del(failKey(ip));
  await db.del(levelKey(ip));
  await db.del(lockKey(ip));
}

export async function decideSignIn(ip, checkPin, db = redis()) {
  const blocked = await signInBlocked(ip, db);
  if (blocked) return { status: 429, retrySeconds: blocked.retrySeconds };
  if (!checkPin()) {
    const outcome = await recordWrongPasscode(ip, db);
    if (outcome.retrySeconds) return { status: 429, retrySeconds: outcome.retrySeconds };
    return { status: 401, remaining: outcome.remaining };
  }
  await clearSignInFailures(ip, db);
  return { status: 200 };
}

export async function allLogs() {
  const raw = await redis().hgetall(LOGS);
  const logs = {};
  for (const [date, value] of Object.entries(raw || {})) {
    logs[date] = typeof value === 'string' ? JSON.parse(value) : value;
  }
  return logs;
}

export async function saveLog(entry) {
  await redis().hset(LOGS, { [entry.date]: JSON.stringify(entry) });
}

export async function deleteLog(date) {
  await redis().hdel(LOGS, date);
}
