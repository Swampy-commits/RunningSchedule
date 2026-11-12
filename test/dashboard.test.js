import assert from 'node:assert/strict';
import test from 'node:test';
import {
  last7Summary,
  niggleRepeats,
  raceEntries,
  sessionCounts,
  streakCount,
  weeklyBars,
} from '../lib/dashboard.js';

const plan = [
  { date: '2026-11-08', label: 'Sun 8 Nov', effort: 'Easy', week: 1, title: 'Easy recovery' },
  { date: '2026-11-09', label: 'Mon 9 Nov', effort: 'Rest', week: 2, title: 'Full rest day' },
  { date: '2026-11-10', label: 'Tue 10 Nov', effort: 'Hard', week: 2, title: 'Progression run' },
  { date: '2026-11-11', label: 'Wed 11 Nov', effort: 'Easy', week: 2, title: 'Own S&C' },
  { date: '2026-12-06', label: 'Sun 6 Dec', effort: 'Race', week: 5, title: 'All-Ireland' },
];

test('shapes an empty log into zeros', () => {
  const summary = last7Summary({}, plan, '2026-11-12');
  assert.deepEqual(summary, { sessions: 0, km: 0, feelings: [] });
  assert.deepEqual(sessionCounts({}, ['2026-11-09', '2026-11-10']), { done: 0, part: 0, skipped: 0, swapped: 0, none: 2 });
  assert.equal(streakCount({}, ['2026-11-09', '2026-11-10']), 0);
  assert.deepEqual(raceEntries({}, plan), []);
  assert.deepEqual(weeklyBars({}, plan, [{ id: 2, planKm: 29 }]), [{ id: 2, planKm: 29, loggedKm: 0 }]);
});

test('counts sessions, km, a streak, and a repeated niggle', () => {
  const logs = {
    '2026-11-09': { status: 'done', km: 0, felt: 'OK', pain: false },
    '2026-11-10': { status: 'done', km: 8, felt: 'Heavy', pain: true, painWhere: 'calf', painNote: 'tight' },
    '2026-11-11': { status: 'skipped', km: 0, felt: 'OK', pain: false },
    '2026-11-08': { status: 'part', km: 3, felt: 'Tired', pain: true, painWhere: 'calf', painNote: 'after' },
  };
  const summary = last7Summary(logs, plan, '2026-11-12');
  assert.equal(summary.sessions, 3);
  assert.equal(summary.km, 11);
  assert.deepEqual(sessionCounts(logs, ['2026-11-09', '2026-11-10', '2026-11-11']), { done: 2, part: 0, skipped: 1, swapped: 0, none: 0 });
  assert.equal(streakCount(logs, ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']), 0);
  assert.equal(streakCount(logs, ['2026-11-08', '2026-11-09', '2026-11-10']), 3);
  const items = [
    { date: '2026-11-08', label: 'Sun 8 Nov', area: 'calf', note: 'after' },
    { date: '2026-11-10', label: 'Tue 10 Nov', area: 'calf', note: 'tight' },
  ];
  assert.deepEqual(niggleRepeats(items), ['You noted calf on Sun 8 Nov and again on Tue 10 Nov.']);
  assert.equal(raceEntries({ '2026-12-06': { status: 'done', felt: 'OK', rpe: 8, note: 'done' } }, plan).length, 1);
});
