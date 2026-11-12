import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/schedule.js';
import { signToken } from '../lib/auth.js';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('the public pages do not contain the plan', () => {
  const files = ['index.html', 'dashboard.js', 'dashboard.html', 'log.js'];
  for (const name of files) {
    const text = fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
    assert.equal(text.includes('Belgooly'), false, name);
    assert.equal(text.includes('Cork County'), false, name);
    assert.equal(text.includes('All-Ireland'), false, name);
  }
});

test('the schedule is returned only with a valid pass', async () => {
  process.env.LOG_SECRET = 'test-secret';
  const blocked = mockRes();
  await handler({ method: 'GET', headers: {} }, blocked);
  assert.equal(blocked.statusCode, 401);
  assert.equal(JSON.stringify(blocked.body).includes('Belgooly'), false);

  const ok = mockRes();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + signToken('niall') },
  }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.html.includes('Belgooly'), true);
  assert.equal(ok.body.plan.length, 35);
  assert.equal(ok.body.weeks.length, 5);
  assert.equal(ok.body.weeks[2].planKm, 33);
});
