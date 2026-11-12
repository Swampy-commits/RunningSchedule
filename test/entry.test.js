import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { loggingReady, pinMatches, readToken, signToken } from '../lib/auth.js';
import { validateEntry } from '../lib/entry.js';

test('accepts a normal log and drops extra km', () => {
  const { entry, error } = validateEntry({
    status: 'done',
    km: 5.25,
    minutes: '',
    rpe: 4,
    felt: 'Fine',
    pain: false,
    note: '  grass   felt fine  ',
  }, '2026-11-12');
  assert.equal(error, undefined);
  assert.equal(entry.km, 5.3);
  assert.equal(entry.minutes, null);
  assert.equal(entry.note, 'grass felt fine');
  assert.equal(entry.pain, false);
});

test('rejects days outside the plan and bad RPE', () => {
  assert.equal(validateEntry({ status: 'done' }, '2026-10-01').error, 'That day is not on this plan.');
  assert.match(validateEntry({ status: 'done', rpe: 11 }, '2026-12-06').error, /RPE/);
  assert.match(validateEntry({ status: 'race' }, '2026-12-06').error, /done/);
});

test('keeps a pain flag and clears it when pain is off', () => {
  const on = validateEntry({
    status: 'part',
    pain: true,
    painWhere: 'calf',
    painNote: 'tight after strides',
  }, '2026-11-14');
  assert.equal(on.entry.painWhere, 'calf');
  const off = validateEntry({
    status: 'swapped',
    pain: false,
    painWhere: 'back',
    painNote: 'should not stick',
  }, '2026-11-03');
  assert.equal(off.entry.painWhere, '');
  assert.equal(off.entry.painNote, '');
});

test('passcodes and tokens', () => {
  process.env.EABHA_PIN = 'test-eabha-pin';
  process.env.NIALL_PIN = 'test-niall-pin';
  process.env.LOG_SECRET = 'test-secret';
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  assert.equal(loggingReady(), true);
  assert.equal(pinMatches('eabha', 'test-eabha-pin'), true);
  assert.equal(pinMatches('eabha', 'test-niall-pin'), false);
  assert.equal(pinMatches('niall', ''), false);
  const token = signToken('niall');
  const payload = readToken(token);
  assert.equal(payload.role, 'niall');
  const remaining = payload.exp - Date.now();
  assert.ok(remaining > 29 * 24 * 60 * 60 * 1000);
  assert.ok(remaining < 31 * 24 * 60 * 60 * 1000);
  const oldBody = Buffer.from(JSON.stringify({
    role: 'niall',
    exp: Date.now() + 180 * 24 * 60 * 60 * 1000,
  })).toString('base64url');
  const oldSig = crypto.createHmac('sha256', 'test-secret').update(oldBody).digest('base64url');
  assert.equal(readToken(oldBody + '.' + oldSig), null);
  assert.equal(readToken(token.slice(0, -2) + 'aa'), null);
  delete process.env.EABHA_PIN;
  assert.equal(loggingReady(), false);
});

test('logging is ready with the KV Redis env names', () => {
  const keys = [
    'EABHA_PIN', 'NIALL_PIN', 'LOG_SECRET',
    'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
    'KV_REST_API_URL', 'KV_REST_API_TOKEN',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.EABHA_PIN = 'test-eabha-pin';
  process.env.NIALL_PIN = 'test-niall-pin';
  process.env.LOG_SECRET = 'test-secret';
  assert.equal(loggingReady(), false);
  process.env.KV_REST_API_URL = 'https://example.upstash.io';
  process.env.KV_REST_API_TOKEN = 'token';
  assert.equal(loggingReady(), true);
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});
