import {
  addDays,
  daysBetween,
  last7Summary,
  nextSession,
  niggleItems,
  niggleRepeats,
  raceEntries,
  sessionCounts,
  streakCount,
  weeklyBars,
} from './lib/dashboard.js';

const TOKEN_KEY = 'eabha-session';
const RACE = '2026-12-06';
const WEEKS = [
  { id: 1, name: 'Week 1', dates: '2 to 8 Nov', phase: 'Race week (Cork County B, Sat 7 Nov)', planKm: 15 },
  { id: 2, name: 'Week 2', dates: '9 to 15 Nov', phase: 'Build', planKm: 29 },
  { id: 3, name: 'Week 3', dates: '16 to 22 Nov', phase: 'Peak load', planKm: 33 },
  { id: 4, name: 'Week 4', dates: '23 to 29 Nov', phase: 'Sharpen', planKm: 26 },
  { id: 5, name: 'Week 5', dates: '30 Nov to 6 Dec', phase: 'Taper', planKm: 19 },
];
const PLAN = [
  ['2026-11-02', 'Mon 2 Nov', 'Rest', 1, 'Full rest day'],
  ['2026-11-03', 'Tue 3 Nov', 'Hard', 1, "Belgooly session at 6:45pm, cut to half of Glenn's fartlek, no hill sprints"],
  ['2026-11-04', 'Wed 4 Nov', 'Easy', 1, 'Own S&C, light, 20 to 25 min'],
  ['2026-11-05', 'Thu 5 Nov', 'Rest', 1, 'OFF. Full rest day, 2 days before the race'],
  ['2026-11-06', 'Fri 6 Nov', 'Easy', 1, 'Pre-race shakeout: 15 min very easy jog'],
  ['2026-11-07', 'Sat 7 Nov', 'Race', 1, 'Cork County B U17 race, Lyre, Clonakilty'],
  ['2026-11-08', 'Sun 8 Nov', 'Easy', 1, 'Easy recovery, 20 to 30 min'],
  ['2026-11-09', 'Mon 9 Nov', 'Rest', 2, 'Full rest day'],
  ['2026-11-10', 'Tue 10 Nov', 'Hard', 2, "Belgooly session at 6:45pm, Glenn's set as written (hill sprints capped)"],
  ['2026-11-11', 'Wed 11 Nov', 'Easy', 2, 'Own S&C, light, 20 to 25 min'],
  ['2026-11-12', 'Thu 12 Nov', 'Easy', 2, 'Skip the Belgooly club session. Easy day: 25 to 30 min'],
  ['2026-11-13', 'Fri 13 Nov', 'Easy', 2, 'Own S&C, light, 25 to 30 min'],
  ['2026-11-14', 'Sat 14 Nov', 'Hard', 2, 'Cork Athletics juvenile squad training session, hard day 2'],
  ['2026-11-15', 'Sun 15 Nov', 'Easy', 2, 'Easy run or cross trainer: 35 to 45 min'],
  ['2026-11-16', 'Mon 16 Nov', 'Rest', 3, 'Full rest day'],
  ['2026-11-17', 'Tue 17 Nov', 'Hard', 3, 'Belgooly session in full. Main set: 5 x 1km'],
  ['2026-11-18', 'Wed 18 Nov', 'Easy', 3, 'Own S&C, light, 20 to 25 min'],
  ['2026-11-19', 'Thu 19 Nov', 'Hard', 3, 'Main set: 6 x 800m at threshold'],
  ['2026-11-20', 'Fri 20 Nov', 'Moderate', 3, 'Own S&C, main session, 30 to 40 min'],
  ['2026-11-21', 'Sat 21 Nov', 'Easy', 3, 'Saturday alternative to the Belgooly club session'],
  ['2026-11-22', 'Sun 22 Nov', 'Easy', 3, 'Long run, easy: 55 to 60 min'],
  ['2026-11-23', 'Mon 23 Nov', 'Rest', 4, 'Full rest day'],
  ['2026-11-24', 'Tue 24 Nov', 'Hard', 4, 'Main set: 4 x 800m at XC race effort'],
  ['2026-11-25', 'Wed 25 Nov', 'Easy', 4, 'Own S&C, light, 15 to 20 min'],
  ['2026-11-26', 'Thu 26 Nov', 'Moderate', 4, 'Main set: 5 x 300m at 3k pace feel'],
  ['2026-11-27', 'Fri 27 Nov', 'Easy', 4, 'Own S&C, light, 15 to 20 min'],
  ['2026-11-28', 'Sat 28 Nov', 'Easy', 4, 'Easy alternative, no hard running'],
  ['2026-11-29', 'Sun 29 Nov', 'Easy', 4, 'Easy run 45 min continuous'],
  ['2026-11-30', 'Mon 30 Nov', 'Rest', 5, 'Full rest day'],
  ['2026-12-01', 'Tue 1 Dec', 'Hard', 5, 'Main set: 2 x (3 x 400m at 3k-to-XC race pace)'],
  ['2026-12-02', 'Wed 2 Dec', 'Easy', 5, 'Own S&C, mobility and activation only, 15 to 20 min'],
  ['2026-12-03', 'Thu 3 Dec', 'Easy', 5, 'Easy run 20 min at RPE 3, then 4 x 80m strides'],
  ['2026-12-04', 'Fri 4 Dec', 'Rest', 5, 'OFF. Full rest day, 2 days before the All-Ireland'],
  ['2026-12-05', 'Sat 5 Dec', 'Easy', 5, 'Pre-race shakeout: 15 min very easy jog'],
  ['2026-12-06', 'Sun 6 Dec', 'Race', 5, 'All-Ireland Cross Country Championships'],
].map(([date, label, effort, week, title]) => ({ date, label, effort, week, title }));

let who = 'eabha';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function pct(part, whole) {
  return whole ? Math.round(part / whole * 100) : 0;
}
function countLine(tally, total) {
  return 'Done ' + pct(tally.done, total) + '% · Partly done ' + pct(tally.part, total) +
    '% · Skipped ' + pct(tally.skipped, total) + '% · Swapped ' + pct(tally.swapped, total) +
    '% · Not logged ' + pct(tally.none, total) + '%';
}

function barChart(bars) {
  const width = 320;
  const height = 160;
  const max = 36;
  const group = width / bars.length;
  let svg = '<svg class="bars" viewBox="0 0 ' + width + ' ' + (height + 28) + '" role="img" aria-label="Plan kilometres and logged kilometres">';
  bars.forEach((week, i) => {
    const x = i * group + 8;
    const planH = (week.planKm / max) * height;
    const logH = (week.loggedKm / max) * height;
    svg += '<rect x="' + x + '" y="' + (height - planH) + '" width="14" height="' + planH + '" fill="#CBD5E1"></rect>';
    svg += '<rect x="' + (x + 16) + '" y="' + (height - logH) + '" width="14" height="' + Math.max(logH, 0) + '" fill="#334155"></rect>';
    svg += '<text x="' + (x + 14) + '" y="' + (height + 16) + '" text-anchor="middle" font-size="10" fill="#475569">W' + week.id + '</text>';
  });
  svg += '</svg>';
  return svg;
}

function rpeChart(logs) {
  const points = PLAN.filter(day => logs[day.date]?.rpe).map(day => ({ ...day, rpe: logs[day.date].rpe }));
  const width = 320;
  const height = 140;
  if (!points.length) return '<p>Nothing logged yet, so there is no line to draw.</p>';
  const step = points.length > 1 ? (width - 24) / (points.length - 1) : 0;
  const xy = points.map((row, i) => ({
    ...row,
    x: 12 + i * step,
    y: 10 + ((10 - row.rpe) / 9) * (height - 24),
  }));
  let svg = '<svg class="bars" viewBox="0 0 ' + width + ' ' + (height + 8) + '" role="img" aria-label="How hard you said each session felt">';
  for (let n = 2; n <= 10; n += 2) {
    const y = 10 + ((10 - n) / 9) * (height - 24);
    svg += '<line x1="8" y1="' + y + '" x2="' + (width - 8) + '" y2="' + y + '" stroke="#E2E8F0"></line>';
    svg += '<text x="2" y="' + (y + 3) + '" font-size="9" fill="#94A3B8">' + n + '</text>';
  }
  if (xy.length > 1) {
    svg += '<polyline fill="none" stroke="#334155" stroke-width="2" points="' + xy.map(p => p.x + ',' + p.y).join(' ') + '"></polyline>';
  }
  xy.forEach(p => {
    const hard = p.effort === 'Hard' || p.effort === 'Race';
    svg += hard
      ? '<circle cx="' + p.x + '" cy="' + p.y + '" r="5" fill="none" stroke="#334155" stroke-width="2"></circle>'
      : '<circle cx="' + p.x + '" cy="' + p.y + '" r="5" fill="#334155"></circle>';
  });
  svg += '</svg>';
  return svg;
}

function heatMap(logs) {
  let html = '<div class="heat">';
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(day => { html += '<i>' + day + '</i>'; });
  PLAN.forEach(day => {
    const log = logs[day.date];
    const cls = !log ? 's-none'
      : log.status === 'part' ? 's-part'
      : log.status === 'skipped' ? 's-skip'
      : log.status === 'swapped' ? 's-swap'
      : 's-done';
    const niggle = log && log.pain ? ' s-niggle' : '';
    html += '<div class="cell ' + cls + niggle + '">' + String(Number(day.date.slice(-2))) + '</div>';
  });
  html += '</div>';
  html += '<div class="legend"><span><i class="swatch s-done"></i> Done</span><span><i class="swatch s-part"></i> Part</span><span><i class="swatch s-skip"></i> Skipped</span><span><i class="swatch s-swap"></i> Swapped</span><span><i class="swatch s-niggle"></i> Niggle noted</span></div>';
  return html;
}

function render(logs) {
  const today = todayIso();
  const left = daysBetween(today, RACE);
  const recent = last7Summary(logs, PLAN, today);
  const thisWeek = PLAN.find(day => day.date >= today)?.week || (today > RACE ? 5 : 1);
  const weekDates = PLAN.filter(day => day.week === thisWeek).map(day => day.date);
  const weekTally = sessionCounts(logs, weekDates);
  const allTally = sessionCounts(logs, PLAN.map(day => day.date));
  const weekKm = weeklyBars(logs, PLAN, WEEKS).find(week => week.id === thisWeek)?.loggedKm || 0;
  const datesSoFar = PLAN.map(day => day.date).filter(date => date <= today);
  const next = nextSession(PLAN, today);
  const tomorrow = PLAN.find(day => day.date === addDays(today, 1));
  const todayPlan = PLAN.find(day => day.date === today);
  const remaining = PLAN.filter(day => day.date >= today && day.week === thisWeek);
  const notes = PLAN.filter(day => logs[day.date]?.note).slice(-3).reverse();
  const niggles = niggleItems(logs, PLAN);
  const races = raceEntries(logs, PLAN);
  const anyLog = Object.keys(logs).length > 0;

  let html = '';
  html += '<article class="card"><p class="k">Next session</p>';
  if (!next) html += '<p>The plan has finished.</p>';
  else html += '<p class="next">' + esc(next.label) + '</p><p>' + esc(next.title) + '</p><p class="muted">' + esc(next.effort) + ' on the plan.</p>';
  html += '</article>';
  html += '<div class="pair"><article class="card"><p class="k">Streak</p><p class="big">' + streakCount(logs, datesSoFar) + '</p><p class="muted">Days in a row you logged a session.</p></article>';
  html += '<article class="card"><p class="k">This week</p><p class="big">' + weekKm + '</p><p class="muted">Kilometres you logged.</p></article></div>';

  html += '<article class="card"><p class="k">All-Ireland</p><p class="big">' + (left < 0 ? '0' : left) + '</p><p>' + (left === 0 ? 'Race day is today, Sun 6 Dec.' : left > 0 ? 'days until Sun 6 Dec' : 'Sun 6 Dec has passed.') + '</p>';
  html += '<p class="k">Your last 7 days</p>';
  if (!anyLog) html += '<p>Nothing logged yet. When you log a session on the plan, it will show up here.</p>';
  else {
    html += '<div class="facts"><div><p class="big">' + recent.sessions + '</p><p class="muted">sessions logged</p></div><div><p class="big">' + recent.km + '</p><p class="muted">km</p></div></div>';
    html += '<p>' + (recent.feelings.length ? 'You said you felt ' + esc(recent.feelings.join(', ')) + '.' : 'No feelings logged in these days.') + '</p>';
  }
  html += '</article>';

  html += '<article class="card"><h2>Plan km and logged km</h2><p class="muted">Light bar is the plan estimate (~15 / 29 / 33 / 26 / 19). Dark bar is the kilometres you logged.</p>' + barChart(weeklyBars(logs, PLAN, WEEKS)) + '</article>';

  html += '<article class="card"><h2>Sessions you logged</h2>';
  html += '<p><strong>This week.</strong> ' + weekTally.done + ' done, ' + weekTally.part + ' partly done, ' + weekTally.skipped + ' skipped, ' + weekTally.swapped + ' swapped.</p>';
  html += '<p class="muted">' + countLine(weekTally, weekDates.length) + '</p>';
  html += '<p><strong>Whole plan.</strong> ' + allTally.done + ' done, ' + allTally.part + ' partly done, ' + allTally.skipped + ' skipped, ' + allTally.swapped + ' swapped.</p>';
  html += '<p class="muted">' + countLine(allTally, PLAN.length) + '</p>';
  html += heatMap(logs);
  html += '</article>';

  html += '<article class="card"><h2>How hard it felt</h2><p class="muted">The line is the number you gave, from 1 to 10. A ring is a hard or race day on the plan. A filled dot is any other day.</p>' + rpeChart(logs) + '</article>';

  html += '<article class="card"><h2>Niggles noted</h2>';
  if (!niggles.length) html += '<p>No niggles noted.</p>';
  niggleRepeats(niggles).forEach(line => { html += '<p>' + esc(line) + '</p>'; });
  niggles.forEach(item => {
    html += '<div class="row"><div><strong>' + esc(item.label) + '</strong><div class="muted">' + esc(item.area) + '</div></div><div>' + esc(item.note) + '</div></div>';
  });
  html += '</article>';

  html += '<article class="card"><h2>This week</h2>';
  html += '<p class="k">Today</p><p class="next">' + (todayPlan ? esc(todayPlan.title) : 'No session on the plan today.') + '</p>';
  if (tomorrow) html += '<p class="k">Tomorrow</p><p>' + esc(tomorrow.label) + ' · ' + esc(tomorrow.title) + '</p>';
  html += '<p class="k">Still to come this week</p>';
  if (!remaining.length) html += '<p>Nothing left in this plan week.</p>';
  remaining.forEach(day => { html += '<div class="row"><strong>' + esc(day.label) + '</strong><span>' + esc(day.title) + '</span></div>'; });
  html += '<p class="k">Recent notes</p>';
  if (!notes.length) html += '<p>No notes yet.</p>';
  notes.forEach(day => { html += '<p>' + esc(day.label) + ': ' + esc(logs[day.date].note) + '</p>'; });
  html += '</article>';

  html += '<article class="card"><h2>Races</h2>';
  if (!races.length) html += '<p>No race logged yet.</p>';
  races.forEach(item => {
    html += '<p class="next">' + esc(item.plan.title) + '</p>';
    if (item.log.note) html += '<p>' + esc(item.log.note) + '</p>';
    const bits = [];
    if (item.log.felt) bits.push('you said ' + item.log.felt);
    if (item.log.rpe) bits.push('how hard it felt was ' + item.log.rpe + ' out of 10');
    if (bits.length) html += '<p class="muted">On the day ' + esc(bits.join(', and ')) + '.</p>';
    html += '<p class="k">The days before</p>';
    item.before.forEach(earlier => {
      html += '<div class="row"><div><strong>' + esc(earlier.plan.label) + '</strong><div class="muted">' + esc(earlier.plan.title) + '</div></div><div>' + (earlier.log?.felt ? esc(earlier.log.felt) : 'Not logged') + '</div></div>';
    });
  });
  html += '</article>';
  document.getElementById('dash').innerHTML = html;
  document.getElementById('dash').hidden = false;
  document.getElementById('gate').hidden = true;
}

function showGate(html) {
  document.getElementById('gate').innerHTML = html;
  document.getElementById('gate').hidden = false;
  document.getElementById('dash').hidden = true;
  document.getElementById('dash').innerHTML = '';
}

function signInForm(message) {
  showGate(
    '<form class="card" id="signForm">' +
    '<p>Sign in to see your training. Eabha and Niall use the same page.</p>' +
    '<div class="choices">' +
    '<button type="button" data-who="eabha" aria-pressed="true">Eabha</button>' +
    '<button type="button" data-who="niall" aria-pressed="false">Niall</button>' +
    '</div>' +
    '<label class="k" for="pin">Passcode</label>' +
    '<input id="pin" type="password" inputmode="numeric" autocomplete="current-password">' +
    (message ? '<p class="error">' + esc(message) + '</p>' : '') +
    '<div class="gate-actions"><button class="primary" type="submit">Unlock</button></div>' +
    '</form>'
  );
  document.querySelectorAll('[data-who]').forEach(btn => {
    btn.addEventListener('click', () => {
      who = btn.dataset.who;
      document.querySelectorAll('[data-who]').forEach(other => {
        other.setAttribute('aria-pressed', other === btn ? 'true' : 'false');
      });
    });
  });
  document.getElementById('signForm').addEventListener('submit', async event => {
    event.preventDefault();
    const pin = document.getElementById('pin').value;
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: who, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not sign in.');
      sessionStorage.setItem(TOKEN_KEY, data.token);
      document.getElementById('pin').value = '';
      await loadLogs(data.token);
    } catch (error) {
      signInForm(error.message);
    }
  });
}

async function loadLogs(token) {
  const res = await fetch('/api/logs', { headers: { Authorization: 'Bearer ' + token } });
  if (res.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    signInForm('Sign in again.');
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not load logs.');
  render(data.logs || {});
}

async function boot() {
  const saved = sessionStorage.getItem(TOKEN_KEY) || '';
  let res;
  try {
    res = await fetch('/api/session', { headers: saved ? { Authorization: 'Bearer ' + saved } : {} });
  } catch {
    showGate('<p class="card">Sign in on the training site to see this page. This copy does not keep logs.</p>');
    return;
  }
  if (!res.ok) {
    showGate('<p class="card">Sign in on the training site to see this page. This copy does not keep logs.</p>');
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (data.logging !== true) {
    showGate('<p class="card">Logging is not switched on yet, so there is nothing to show here.</p>');
    return;
  }
  if (!data.role) {
    signInForm('');
    return;
  }
  try {
    await loadLogs(saved);
  } catch (error) {
    signInForm(error.message);
  }
}

boot();
