const QUALITY_WEIGHT = 1.5;

function decode(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(value) {
  const text = decode(value);
  const cut = text.split(/(?<=\.)\s/)[0] || text;
  return cut.length > 120 ? cut.slice(0, 117).trim() + '…' : cut;
}

function sessionLine(label, session) {
  const text = decode(session);
  const main = text.match(/Main set:\s*(.+?)(?:\.\s|$)/);
  const detail = main ? main[1].trim() : firstSentence(text);
  const day = label.split(' ')[0];
  const line = day + ': ' + detail;
  return line.length > 110 ? line.slice(0, 107).trim() + '…' : line;
}

function kilometres(duration, session, effort) {
  if (effort === 'Rest') return 0;
  const text = decode(duration);
  const words = decode(session);
  if (!/km/i.test(text)) return 0;
  if (/Option A:[^.]{0,140}cross trainer/i.test(words) && /Option B/i.test(words)) return 0;
  const approx = [...text.matchAll(/~(\d+(?:\.\d+)?)\s*km/gi)].map(match => Number(match[1]));
  if (effort === 'Race' && approx.length) return approx[approx.length - 1];
  const range = text.match(/(\d+(?:\.\d+)?)\s*to\s*(\d+(?:\.\d+)?)\s*km/i);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  if (approx.length) return approx[0];
  const plain = text.match(/(\d+(?:\.\d+)?)\s*km/i);
  return plain ? Number(plain[1]) : 0;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function kindFor(effort, km) {
  if (!km) return 'none';
  if (effort === 'Race') return 'race';
  if (effort === 'Hard' || effort === 'Moderate') return 'quality';
  return 'easy';
}

function field(block, className) {
  const match = block.match(new RegExp(`<p class="${className}">([\\s\\S]*?)</p>`));
  return match ? decode(match[1]) : '';
}

function sentences(note, count) {
  return note.split(/(?<=\.)\s/).filter(Boolean).slice(0, count).join(' ');
}

export function readPlan(html) {
  const chunks = String(html).split('<section class="week"').slice(1);
  const weeks = [];
  const days = [];
  chunks.forEach(chunk => {
    const id = Number((chunk.match(/id="week-(\d+)"/) || [])[1] || weeks.length + 1);
    const dates = decode((chunk.match(/<h2>[^<]*<span>([^<]+)<\/span>/) || [])[1] || '');
    const phase = field(chunk, 'phase');
    const kmLine = field(chunk, 'km-line');
    const note = field(chunk, 'week-note');
    const dayBlocks = chunk.match(/<article class="day[\s\S]*?<\/article>/g) || [];
    let easy = 0;
    let quality = 0;
    let race = 0;
    const weekDays = dayBlocks.map(block => {
      const date = (block.match(/data-date="([^"]+)"/) || [])[1] || '';
      const label = (block.match(/data-label="([^"]+)"/) || [])[1] || '';
      const effort = (block.match(/data-effort="([^"]+)"/) || [])[1] || '';
      const duration = (block.match(/Duration or km<\/span>([^<]*)/) || [])[1] || '';
      const session = (block.match(/<div class="session"><p>([\s\S]*?)<\/p>/) || [])[1] || '';
      const km = kilometres(duration, session, effort);
      const kind = kindFor(effort, km);
      if (kind === 'easy') easy += km;
      if (kind === 'quality') quality += km;
      if (kind === 'race') race += km;
      const day = {
        date,
        label,
        effort,
        week: id,
        km: round1(km),
        kind,
        title: sessionLine(label, session).replace(/^[A-Za-z]+:\s*/, ''),
      };
      days.push(day);
      return day;
    });
    const lineFor = day => day.label.split(' ')[0] + ': ' + day.title;
    const sessions = weekDays
      .filter(day => day.kind !== 'none' || /^OFF\b/.test(day.title))
      .map(lineFor);
    const qualitySessions = weekDays.filter(day => day.kind === 'quality').map(lineFor);
    weeks.push({
      id,
      name: phase.split('(')[0].trim() || ('Week ' + id),
      dates,
      phase,
      kmLine,
      purpose: phase + '. ' + sentences(note, 2),
      sessions,
      easyKm: round1(easy),
      qualityKm: round1(quality),
      raceKm: round1(race),
      km: round1(easy + quality + race),
      load: round1(easy + quality * QUALITY_WEIGHT + race * QUALITY_WEIGHT),
      raceDay: weekDays.some(day => day.kind === 'race'),
      qualityCount: weekDays.filter(day => day.kind === 'quality').length,
      qualitySessions,
    });
  });
  return { weeks, days };
}

export function strategyLines(weeks) {
  if (weeks.length < 5) return [];
  const [race, build, peak, sharpen, taper] = weeks;
  const harder = weeks.flatMap(week => week.qualitySessions);
  return [
    'Your block runs from Mon 2 Nov to the All-Ireland on Sun 6 Dec.',
    race.phase + '. The running written on the days adds up to ' + race.km + ' km. ' + sentences(race.purpose.replace(race.phase + '. ', ''), 1),
    build.name + ' (' + build.dates + ', ' + build.km + ' km) then ' + peak.phase + ' (' + peak.dates + ', ' + peak.km + ' km). ' + sentences(peak.purpose.replace(peak.phase + '. ', ''), 1),
    'The harder sessions, in the plan\'s words: ' + harder.join('; ') + '.',
    sharpen.phase + ' (' + sharpen.km + ' km). ' + taper.phase + ' (' + taper.km + ' km).',
  ];
}

export const LOAD_FORMULA = 'Easy kilometres count once. Hard running and races count 1.5 times their kilometres, so those days stand a little taller. The 1.5 is only a way to show them, not a score. Rest days and strength-only days add no running. A faint mark is kilometres you logged, and only in a week where you logged some.';

export function planStory(html) {
  const { weeks, days } = readPlan(html);
  return { strategy: strategyLines(weeks), phases: weeks, days, formula: LOAD_FORMULA };
}

export function whereWeAre(phases, days, today, raceDate) {
  const current = phases.find(phase => {
    const inWeek = days.filter(day => day.week === phase.id);
    const start = inWeek[0]?.date;
    const end = inWeek[inWeek.length - 1]?.date;
    return start && end && today >= start && today <= end;
  }) || (today < (days[0]?.date || '') ? phases[0] : phases[phases.length - 1]);
  const next = current ? phases.find(phase => phase.id === current.id + 1) : null;
  const lastId = phases[phases.length - 1]?.id || 0;
  const weeksAway = current ? Math.max(0, lastId - current.id) : 0;
  let away = 'The All-Ireland week is this week.';
  if (raceDate && today > raceDate) away = 'The All-Ireland week has passed.';
  else if (weeksAway === 1) away = 'The All-Ireland week is next week.';
  else if (weeksAway > 1) away = 'The All-Ireland week is ' + weeksAway + ' weeks away.';
  return {
    phase: current?.phase || '',
    purpose: current?.purpose || '',
    next: next ? 'Next is ' + next.purpose : 'This is the last week of the block.',
    away,
  };
}

export function loggedKmByWeek(days, logs) {
  const totals = {};
  days.forEach(day => {
    const km = Number(logs?.[day.date]?.km);
    if (!Number.isFinite(km) || km <= 0) return;
    totals[day.week] = round1((totals[day.week] || 0) + km);
  });
  return totals;
}

export const NOT_YET = 'This appears once a few sessions are logged.';

export function feltByType(days, logs) {
  const groups = { easy: [], quality: [], race: [] };
  days.forEach(day => {
    const rpe = Number(logs?.[day.date]?.rpe);
    if (!groups[day.kind] || !rpe) return;
    groups[day.kind].push(rpe);
  });
  const used = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
  if (used < 2) return NOT_YET;
  const names = { easy: 'easy running', quality: 'the harder running', race: 'races' };
  const bits = Object.entries(groups)
    .filter(([, list]) => list.length)
    .map(([kind, list]) => names[kind] + ' around ' + average(list) + ' out of 10');
  return 'Where you wrote down how hard it felt, you put ' + bits.join(', and ') + '.';
}

export function sameSessionTrend(days, logs) {
  const groups = new Map();
  days.forEach(day => {
    const log = logs?.[day.date];
    if (!log || day.kind === 'none' || (!log.km && !log.rpe)) return;
    const key = day.label.split(' ')[0] + ' ' + day.kind;
    if (!groups.has(key)) groups.set(key, []);
    const bits = [day.label];
    if (log.km) bits.push(log.km + ' km');
    if (log.rpe) bits.push('felt ' + log.rpe + ' out of 10');
    groups.get(key).push(bits.join(', '));
  });
  const repeated = [...groups.values()].find(list => list.length >= 2);
  if (!repeated) return NOT_YET;
  return 'The same kind of day, as you logged it: ' + repeated.join('; ') + '.';
}

function average(values) {
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

export function fitnessLine(phases, loggedTotal) {
  if (!phases.length) return '';
  const place = { 'Race week': 'race week', Build: 'the build week', 'Peak load': 'the peak week', Sharpen: 'the sharpening week', Taper: 'the taper' };
  const trend = phases.map(phase => phase.km + ' km in ' + (place[phase.name] || phase.name.toLowerCase())).join(', ');
  const logged = loggedTotal > 0 ? ' You have logged ' + round1(loggedTotal) + ' km along the way.' : '';
  return 'Across the block the running written on the days is ' + trend + '.' + logged;
}

export function speedLine(phases) {
  const counts = phases.map(phase => phase.qualityCount + ' in ' + phase.name.toLowerCase()).join(', ');
  const names = phases.flatMap(phase => phase.qualitySessions);
  return 'Quality sessions on the plan: ' + counts + '. In the plan\'s words: ' + names.join('; ') + '.';
}
