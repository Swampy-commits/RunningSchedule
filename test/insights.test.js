import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { feltByType, planStory, readPlan, sameSessionTrend, whereWeAre } from '../lib/insights.js';
import { renderDashboard } from '../lib/dashboard-view.js';
import { signToken } from '../lib/auth.js';
import handler from '../api/schedule.js';

function scheduleHtml() {
  const src = fs.readFileSync(new URL('../api/schedule.js', import.meta.url), 'utf8');
  const start = src.indexOf('const SCHEDULE_HTML = ') + 'const SCHEDULE_HTML = '.length;
  const end = src.indexOf(';\nconst PLAN');
  return JSON.parse(src.slice(start, end));
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

test('weekly kilometres come from the days written on the plan', () => {
  const { weeks } = readPlan(scheduleHtml());
  assert.deepEqual(weeks.map(week => week.km), [14.5, 28.5, 33, 25.5, 19]);
  assert.deepEqual(weeks.map(week => week.qualityCount), [1, 2, 2, 2, 1]);
  assert.equal(weeks[2].qualityKm, 16.5);
  assert.equal(weeks[0].raceKm, 7);
  assert.ok(weeks[2].load > weeks[1].load);
  assert.ok(weeks[4].load < weeks[2].load);
});

test('the strategy is a short arc in the plan\'s words', () => {
  const story = planStory(scheduleHtml());
  assert.equal(story.strategy.length, 5);
  assert.match(story.strategy.join(' '), /All-Ireland/);
  assert.match(story.strategy.join(' '), /5 x 1km/);
  assert.match(story.strategy.join(' '), /2 x \(3 x 400m/);
  assert.equal(story.strategy.join(' ').includes('missed'), false);
  const where = whereWeAre(story.phases, story.days, '2026-11-12', '2026-12-06');
  assert.equal(where.phase, 'Build');
  assert.match(where.away, /3 weeks/);
  assert.match(where.next, /Peak load/);
});

test('log insights stay quiet until there are a few sessions', () => {
  const { days } = readPlan(scheduleHtml());
  assert.match(feltByType(days, {}), /appears once a few sessions are logged/);
  assert.match(sameSessionTrend(days, {}), /appears once a few sessions are logged/);
  const logs = {
    '2026-11-10': { km: 8, rpe: 6, status: 'done' },
    '2026-11-17': { km: 7.5, rpe: 7, status: 'done' },
    '2026-11-12': { km: 4, rpe: 3, status: 'done' },
  };
  const felt = feltByType(days, logs);
  const trend = sameSessionTrend(days, logs);
  assert.match(felt, /harder running/);
  assert.match(felt, /easy running/);
  assert.match(trend, /Tuesday 10 Nov/);
  assert.match(trend, /Tuesday 17 Nov/);
  assert.equal((felt + trend).includes('missed'), false);
  assert.equal((felt + trend).includes('Not logged'), false);
});

test('the dashboard leads with the strategy and does not count gaps', () => {
  const story = planStory(scheduleHtml());
  const html = renderDashboard({
    story,
    plan: story.days,
    logs: { '2026-11-10': { km: 8, rpe: 6, status: 'done' } },
    today: '2026-11-12',
  });
  const strategy = html.indexOf("The plan's strategy");
  const where = html.indexOf('Where we are in the plan');
  const build = html.indexOf('How the running builds');
  const niggles = html.indexOf('Niggles noted');
  assert.ok(strategy < where && where < build && build < niggles);
  assert.equal(html.includes('Not logged'), false);
  assert.equal(html.includes('missed'), false);
  assert.match(html, /This week/);
  assert.match(html, /<line /);
  const files = ['dashboard.js', 'lib/dashboard-view.js', 'lib/insights.js', 'dashboard.html'];
  for (const name of files) {
    const text = fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
    assert.equal(text.includes('Belgooly'), false, name);
  }
});

test('the story is only returned with a valid sign-in', async () => {
  process.env.LOG_SECRET = 'test-secret';
  const blocked = mockRes();
  await handler({ method: 'GET', headers: {} }, blocked);
  assert.equal(blocked.statusCode, 401);
  assert.equal(JSON.stringify(blocked.body).includes('strategy'), false);
  const ok = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + signToken('eabha') } }, ok);
  assert.equal(ok.body.strategy.length, 5);
  assert.equal(ok.body.phases.length, 5);
  assert.equal(ok.body.days.length, 35);
});
