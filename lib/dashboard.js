export function daysBetween(fromIso, toIso) {
  const parse = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toIso) - parse(fromIso)) / 86400000);
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function loggedOn(logs, day) {
  return logs && logs[day.date] ? logs[day.date] : null;
}

export function last7Summary(logs, plan, today) {
  const start = addDays(today, -6);
  const rows = plan.filter(day => day.date >= start && day.date <= today && loggedOn(logs, day));
  const sessions = rows.filter(day => ['done', 'part', 'swapped'].includes(loggedOn(logs, day).status)).length;
  const km = round1(rows.reduce((sum, day) => sum + (Number(loggedOn(logs, day).km) || 0), 0));
  const feelings = rows.filter(day => loggedOn(logs, day).felt).map(day => day.label.split(' ')[0] + ' ' + loggedOn(logs, day).felt);
  return { sessions, km, feelings };
}

export function weeklyBars(logs, plan, weeks) {
  return weeks.map(week => {
    const loggedKm = plan.filter(day => day.week === week.id && loggedOn(logs, day))
      .reduce((sum, day) => sum + (Number(loggedOn(logs, day).km) || 0), 0);
    return { id: week.id, planKm: week.planKm, loggedKm: round1(loggedKm) };
  });
}

export function sessionCounts(logs, dates) {
  const tally = { done: 0, part: 0, skipped: 0, swapped: 0, none: 0 };
  dates.forEach(date => {
    const status = logs?.[date]?.status;
    if (tally[status] !== undefined) tally[status] += 1;
    else tally.none += 1;
  });
  return tally;
}

export function streakCount(logs, datesOnOrBeforeToday) {
  let n = 0;
  for (let i = datesOnOrBeforeToday.length - 1; i >= 0; i -= 1) {
    const log = logs?.[datesOnOrBeforeToday[i]];
    if (!log || log.status === 'skipped') break;
    n += 1;
  }
  return n;
}

export function niggleItems(logs, plan) {
  return plan.filter(day => loggedOn(logs, day)?.pain).map(day => {
    const log = loggedOn(logs, day);
    return {
      date: day.date,
      label: day.label,
      area: log.painWhere || 'niggle',
      note: log.painNote || '',
    };
  });
}

export function niggleRepeats(items) {
  const lines = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (!items[i].area || items[i].area === 'niggle' || items[i].area !== items[j].area) continue;
      const gap = daysBetween(items[i].date, items[j].date);
      if (gap > 0 && gap <= 3) {
        lines.push('You noted ' + items[i].area + ' on ' + items[i].label + ' and again on ' + items[j].label + '.');
      }
    }
  }
  return lines;
}

export function nextSession(plan, today) {
  return plan.find(day => day.date >= today) || null;
}

export function raceEntries(logs, plan) {
  return plan.filter(day => day.effort === 'Race' && loggedOn(logs, day)).map(day => ({
    plan: day,
    log: loggedOn(logs, day),
    before: plan.slice(Math.max(0, plan.indexOf(day) - 2), plan.indexOf(day)).map(earlier => ({
      plan: earlier,
      log: loggedOn(logs, earlier),
    })),
  }));
}
