const STATUSES = new Set(['done', 'part', 'skipped', 'swapped']);
const FELT = new Set(['', 'Fine', 'OK', 'Tired', 'Heavy']);
const PAIN_WHERE = new Set(['', 'calf', 'back', 'other']);
const FIRST = '2026-11-02';
const LAST = '2026-12-06';

function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function optionalNumber(value, max) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return Math.round(n * 10) / 10;
}

export function validateEntry(input, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < FIRST || date > LAST) {
    return { error: 'That day is not on this plan.' };
  }
  const status = input?.status;
  if (!STATUSES.has(status)) return { error: 'Choose done, partly done, skipped, or swapped.' };
  const km = optionalNumber(input.km, 40);
  const minutes = optionalNumber(input.minutes, 180);
  if (km === undefined || minutes === undefined) return { error: 'Check the km or minutes.' };
  let rpe = null;
  if (input.rpe !== null && input.rpe !== undefined && input.rpe !== '') {
    rpe = Number(input.rpe);
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return { error: 'RPE is from 1 to 10.' };
  }
  const felt = cleanText(input.felt, 20);
  if (!FELT.has(felt)) return { error: 'Choose how she felt.' };
  const pain = Boolean(input.pain);
  const painWhere = cleanText(input.painWhere, 12);
  if (!PAIN_WHERE.has(painWhere)) return { error: 'Pain is calf, back, or other.' };
  return {
    entry: {
      date,
      status,
      km,
      minutes,
      rpe,
      felt,
      pain,
      painWhere: pain ? painWhere : '',
      painNote: pain ? cleanText(input.painNote, 200) : '',
      note: cleanText(input.note, 500),
    },
  };
}
