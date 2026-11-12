import assert from 'node:assert/strict';
import test from 'node:test';
import { signToken } from '../lib/auth.js';
import handler from '../api/session.js';
import {
  decideSignIn,
  lockSeconds,
  retryMessage,
  setRedisForTests,
  wrongMessage,
} from '../lib/store.js';

function memoryRedis(clock) {
  const rows = new Map();
  function read(key) {
    const row = rows.get(key);
    if (!row) return null;
    if (row.expiresAt && row.expiresAt <= clock()) {
      rows.delete(key);
      return null;
    }
    return row;
  }
  return {
    async get(key) {
      const row = read(key);
      return row ? row.value : null;
    },
    async set(key, value, opts = {}) {
      const prev = read(key);
      const expiresAt = opts.ex ? clock() + opts.ex * 1000 : (prev ? prev.expiresAt : 0);
      rows.set(key, { value: String(value), expiresAt });
    },
    async incr(key) {
      const row = read(key);
      const next = (row ? Number(row.value) : 0) + 1;
      rows.set(key, { value: String(next), expiresAt: row ? row.expiresAt : 0 });
      return next;
    },
    async expire(key, seconds) {
      const row = read(key);
      if (!row) return 0;
      row.expiresAt = clock() + seconds * 1000;
      return 1;
    },
    async ttl(key) {
      const row = read(key);
      if (!row) return -2;
      if (!row.expiresAt) return -1;
      return Math.ceil((row.expiresAt - clock()) / 1000);
    },
    async del(key) {
      return rows.delete(key) ? 1 : 0;
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('lockouts double from 15 minutes up to 24 hours', () => {
  assert.equal(lockSeconds(0), 15 * 60);
  assert.equal(lockSeconds(1), 30 * 60);
  assert.equal(lockSeconds(2), 60 * 60);
  assert.equal(lockSeconds(7), 24 * 60 * 60);
  assert.equal(retryMessage(15 * 60), 'Too many tries. Try again in 15 minutes.');
  assert.equal(wrongMessage(2), 'Wrong passcode. 2 tries left.');
  assert.equal(wrongMessage(1), 'Wrong passcode. 1 try left.');
});

test('three wrong codes lock the IP, and a right code works after the lock', async () => {
  let now = 1_000_000;
  const db = memoryRedis(() => now);
  const ip = '203.0.113.8';
  let checks = 0;
  const wrong = () => { checks += 1; return false; };
  const right = () => { checks += 1; return true; };

  const first = await decideSignIn(ip, wrong, db);
  const second = await decideSignIn(ip, wrong, db);
  const third = await decideSignIn(ip, wrong, db);
  assert.equal(first.status, 401);
  assert.equal(first.remaining, 2);
  assert.equal(second.remaining, 1);
  assert.equal(third.status, 429);
  assert.equal(third.retrySeconds, 15 * 60);

  const during = await decideSignIn(ip, right, db);
  assert.equal(during.status, 429);
  assert.equal(checks, 3);

  now += 15 * 60 * 1000;
  const after = await decideSignIn(ip, right, db);
  assert.equal(after.status, 200);
  assert.equal(checks, 4);

  const again = await decideSignIn(ip, wrong, db);
  await decideSignIn(ip, wrong, db);
  const relock = await decideSignIn(ip, wrong, db);
  assert.equal(relock.retrySeconds, 15 * 60);
});

test('a second lockout lasts twice as long', async () => {
  let now = 1_000_000;
  const db = memoryRedis(() => now);
  const ip = '203.0.113.9';
  const wrong = () => false;
  await decideSignIn(ip, wrong, db);
  await decideSignIn(ip, wrong, db);
  await decideSignIn(ip, wrong, db);
  now += 15 * 60 * 1000;
  await decideSignIn(ip, wrong, db);
  await decideSignIn(ip, wrong, db);
  const second = await decideSignIn(ip, wrong, db);
  assert.equal(second.status, 429);
  assert.equal(second.retrySeconds, 30 * 60);
});

test('more than 20 wrong codes across addresses pause new sign-ins for an hour', async () => {
  const db = memoryRedis(() => 5_000_000);
  let checks = 0;
  for (let n = 0; n < 20; n += 1) {
    const outcome = await decideSignIn('198.51.100.' + n, () => { checks += 1; return false; }, db);
    assert.equal(outcome.status, 401);
  }
  const tripped = await decideSignIn('198.51.100.21', () => { checks += 1; return false; }, db);
  assert.equal(tripped.status, 429);
  assert.equal(tripped.retrySeconds, 60 * 60);
  const blocked = await decideSignIn('198.51.100.22', () => { checks += 1; return true; }, db);
  assert.equal(blocked.status, 429);
  assert.equal(checks, 21);
});

test('a redis failure refuses sign-in', async () => {
  const down = { async ttl() { throw new Error('unreachable'); } };
  let checks = 0;
  await assert.rejects(() => decideSignIn('203.0.113.10', () => { checks += 1; return true; }, down));
  assert.equal(checks, 0);
});

test('an existing sign-in still reads, and the passcode route reports the lock', async () => {
  process.env.LOG_SECRET = 'test-secret';
  process.env.EABHA_PIN = 'test-eabha-pin';
  process.env.NIALL_PIN = 'test-niall-pin';
  process.env.KV_REST_API_URL = 'https://example.upstash.io';
  process.env.KV_REST_API_TOKEN = 'token';
  const token = signToken('eabha');
  const ok = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + token } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.role, 'eabha');

  const db = memoryRedis(() => 9_000_000);
  setRedisForTests(db);
  try {
    const statuses = [];
    for (let n = 0; n < 3; n += 1) {
      const res = mockRes();
      await handler({
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.15' },
        body: { role: 'eabha', pin: 'not-the-passcode' },
      }, res);
      statuses.push([res.statusCode, res.body.error]);
    }
    assert.deepEqual(statuses, [
      [401, 'Wrong passcode. 2 tries left.'],
      [401, 'Wrong passcode. 1 try left.'],
      [429, 'Too many tries. Try again in 15 minutes.'],
    ]);
    const locked = mockRes();
    await handler({
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.15' },
      body: { role: 'eabha', pin: 'test-eabha-pin' },
    }, locked);
    assert.equal(locked.statusCode, 429);
    const still = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer ' + token } }, still);
    assert.equal(still.statusCode, 200);
    assert.equal(still.body.role, 'eabha');
  } finally {
    setRedisForTests(null);
  }
});
