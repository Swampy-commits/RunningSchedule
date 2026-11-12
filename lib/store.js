import { Redis } from '@upstash/redis';

const LOGS = 'eabha:logs';

export function redis() {
  return Redis.fromEnv();
}

const FAIL_KEY = ip => `eabha:pinfail:${ip}`;

export async function lockedOut(ip) {
  const count = Number(await redis().get(FAIL_KEY(ip))) || 0;
  return count >= 8;
}

export async function recordFailure(ip) {
  const db = redis();
  const key = FAIL_KEY(ip);
  const count = await db.incr(key);
  if (count === 1) await db.expire(key, 60 * 15);
  return count;
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
