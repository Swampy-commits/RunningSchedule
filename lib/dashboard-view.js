import { daysBetween, last7Summary, niggleItems, niggleRepeats, streakCount } from './dashboard.js';
import {
  feltByType,
  fitnessLine,
  loggedKmByWeek,
  sameSessionTrend,
  speedLine,
  whereWeAre,
} from './insights.js';

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadChart(phases, loggedByWeek) {
  const width = 340;
  const plot = 150;
  const top = 18;
  const max = Math.max(...phases.map(phase => phase.load), 1);
  const group = width / Math.max(phases.length, 1);
  const washes = ['#F1F5F9', '#EDE9FE', '#E0E7FF', '#EEF2FF', '#F8FAFC'];
  let svg = '<svg class="bars" viewBox="0 0 ' + width + ' ' + (top + plot + 32) + '" role="img" aria-label="Weekly load from the start of the plan to race day">';
  phases.forEach((phase, i) => {
    const x = i * group;
    svg += '<rect x="' + x + '" y="' + top + '" width="' + group + '" height="' + plot + '" fill="' + washes[i % washes.length] + '"></rect>';
    const barW = Math.min(26, group - 14);
    const bx = x + (group - barW) / 2;
    let y = top + plot - 6;
    const add = (km, weight, fill) => {
      const h = (km * weight / max) * (plot - 22);
      y -= h;
      if (h > 0.5) svg += '<rect x="' + bx + '" y="' + y + '" width="' + barW + '" height="' + h + '" fill="' + fill + '"></rect>';
    };
    add(phase.easyKm, 1, '#CBD5E1');
    add(phase.qualityKm, 1.5, '#5B21B6');
    add(phase.raceKm, 1.5, '#0F766E');
    if (phase.thisWeek) {
      svg += '<text x="' + (x + group / 2) + '" y="12" text-anchor="middle" font-size="9" font-weight="700" fill="#1E293B">This week</text>';
    }
    const foot = phase.raceDay ? 'Race' : phase.name;
    svg += '<text x="' + (x + group / 2) + '" y="' + (top + plot + 14) + '" text-anchor="middle" font-size="8" fill="#475569">' + esc(foot) + '</text>';
    svg += '<text x="' + (x + group / 2) + '" y="' + (top + plot + 26) + '" text-anchor="middle" font-size="9" fill="#64748B">' + phase.km + '</text>';
    const logged = loggedByWeek[phase.id];
    if (logged) {
      const hy = top + plot - 6 - (logged / max) * (plot - 22);
      svg += '<line x1="' + (bx - 3) + '" y1="' + hy + '" x2="' + (bx + barW + 3) + '" y2="' + hy + '" stroke="#64748B" stroke-width="3" stroke-linecap="round" opacity="0.45"></line>';
    }
  });
  svg += '</svg>';
  return svg;
}

function markThisWeek(phases, days, today) {
  return phases.map(phase => {
    const inWeek = days.filter(day => day.week === phase.id);
    const start = inWeek[0]?.date;
    const end = inWeek[inWeek.length - 1]?.date;
    return { ...phase, thisWeek: Boolean(start && end && today >= start && today <= end) };
  });
}

export function renderDashboard({ story, plan, logs, today }) {
  const phases = markThisWeek(story.phases || [], story.days || [], today);
  const days = story.days || [];
  const race = [...(plan || [])].reverse().find(day => day.effort === 'Race') || days.filter(day => day.kind === 'race').at(-1);
  const raceDate = race?.date || today;
  const where = whereWeAre(phases, days, today, raceDate);
  const loggedByWeek = loggedKmByWeek(days, logs);
  const loggedTotal = Object.values(loggedByWeek).reduce((sum, km) => sum + km, 0);
  const recent = last7Summary(logs, plan || [], today);
  const datesSoFar = (plan || []).map(day => day.date).filter(date => date <= today);
  const streak = streakCount(logs, datesSoFar);
  const niggles = niggleItems(logs, plan || []);
  const left = daysBetween(today, raceDate);
  const anyLog = Object.keys(logs || {}).length > 0;

  let html = '<p class="muted">Prototype. The chart is the plan. A faint mark is a week you logged.</p>';
  html += '<article class="card strategy"><h2>The plan\'s strategy</h2>';
  (story.strategy || []).forEach(line => { html += '<p>' + esc(line) + '</p>'; });
  html += '<div class="strip" id="phaseStrip">';
  phases.forEach(phase => {
    html += '<button type="button" class="phase-btn' + (phase.thisWeek ? ' is-now' : '') + '" data-phase="' + phase.id + '" aria-pressed="false">' +
      esc(phase.name) + '<small>' + esc(phase.dates) + '</small></button>';
  });
  html += '</div><div id="phaseDetail" class="detail" hidden></div>';
  html += loadChart(phases, loggedByWeek);
  html += '<p class="legend"><span><i class="swatch" style="background:#CBD5E1"></i>Easy</span><span><i class="swatch" style="background:#5B21B6"></i>Quality</span><span><i class="swatch" style="background:#0F766E"></i>Race</span><span><i class="swatch" style="background:#64748B;opacity:.45"></i>Logged</span></p>';
  html += '<p class="muted">' + esc(story.formula || '') + '</p></article>';

  html += '<article class="card"><h2>Where we are in the plan</h2>';
  html += '<p class="next">' + esc(where.phase) + '</p>';
  html += '<p>' + esc(where.purpose) + '</p>';
  html += '<p>' + esc(where.next) + '</p>';
  html += '<p class="muted">' + esc(where.away) + '</p></article>';

  html += '<article class="card"><h2>How the running builds</h2><p>' + esc(fitnessLine(phases, loggedTotal)) + '</p></article>';
  html += '<article class="card"><h2>Speed work</h2><p>' + esc(speedLine(phases)) + '</p></article>';
  html += '<article class="card"><h2>How hard it felt</h2><p>' + esc(feltByType(days, logs)) + '</p></article>';
  html += '<article class="card"><h2>The same session over time</h2><p>' + esc(sameSessionTrend(days, logs)) + '</p></article>';

  html += '<article class="card late"><p class="k">' + esc(race?.title || 'Race day') + '</p>';
  html += '<p class="big">' + (left < 0 ? '0' : left) + '</p>';
  html += '<p class="muted">' + (left > 0 ? 'days to go' : left === 0 ? 'Race day is today.' : 'The race day has passed.') + '</p>';
  html += '<p class="k">Your last 7 days</p>';
  if (!anyLog) html += '<p>Nothing logged in these days yet.</p>';
  else {
    html += '<p>' + recent.sessions + ' sessions logged, ' + recent.km + ' km.';
    if (recent.feelings.length) html += ' You said you felt ' + esc(recent.feelings.join(', ')) + '.';
    html += '</p>';
    if (streak > 1) html += '<p class="muted">You have logged a session ' + streak + ' days in a row.</p>';
  }
  html += '</article>';

  html += '<article class="card late"><h2>Niggles noted</h2>';
  if (!niggles.length) html += '<p>No niggles noted.</p>';
  niggleRepeats(niggles).forEach(line => { html += '<p>' + esc(line) + '</p>'; });
  niggles.forEach(item => {
    html += '<div class="row"><div><strong>' + esc(item.label) + '</strong><div class="muted">' + esc(item.area) + '</div></div><div>' + esc(item.note) + '</div></div>';
  });
  html += '</article>';
  return html;
}

export function phaseDetail(phase) {
  if (!phase) return '';
  return '<h3>' + esc(phase.phase) + '</h3><p>' + esc(phase.purpose) + '</p>' +
    (phase.kmLine ? '<p class="muted">' + esc(phase.kmLine) + '</p>' : '') +
    '<ul>' + (phase.sessions || []).map(line => '<li>' + esc(line) + '</li>').join('') + '</ul>';
}
