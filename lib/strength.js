// Percentage-based strength progression.
// A coach builds a block (usually 12 weeks) for one lift: each week has sets, reps and a % change.
// An athlete's target each week = the weight they actually logged most recently in that block,
// increased by the coach's % for every week since (compounded), rounded to the nearest plate jump.
//   e.g. last week 8 × 100 kg, this week "6 reps, +20%"  →  6 × 120 kg
import { mondayYmd, parseYmd } from './dates.js';

export const STANDARD_WEEKS = [
  { sets: 4, reps: 8, pct: 0 },     // 1  baseline — athlete picks a working weight
  { sets: 4, reps: 8, pct: 2.5 },   // 2
  { sets: 4, reps: 6, pct: 7.5 },   // 3  fewer reps, heavier
  { sets: 4, reps: 6, pct: 2.5 },   // 4
  { sets: 3, reps: 8, pct: -10 },   // 5  deload
  { sets: 5, reps: 5, pct: 15 },    // 6
  { sets: 5, reps: 5, pct: 2.5 },   // 7
  { sets: 5, reps: 3, pct: 7.5 },   // 8
  { sets: 4, reps: 3, pct: 2.5 },   // 9
  { sets: 3, reps: 5, pct: -10 },   // 10 deload
  { sets: 3, reps: 3, pct: 12.5 },  // 11
  { sets: 3, reps: 1, pct: 7.5 },   // 12 heavy single / test
];

export const roundTo = (x, step = 2.5) => +(Math.round(x / step) * step).toFixed(2);

// 1-based week of the block that `date` falls in (Math.round absorbs daylight-saving hour shifts)
export const weekOf = (prog, date) =>
  Math.round((parseYmd(mondayYmd(date)) - parseYmd(prog.startDate)) / (7 * 864e5)) + 1;

export function prescription(prog, logs, userId, date) {
  if (!prog) return null;
  const week = weekOf(prog, date);
  if (week < 1 || week > prog.weeks.length) return null;
  const spec = prog.weeks[week - 1];
  const mine = logs.filter((l) => l.userId === userId && l.programId === prog.id);
  const current = mine.find((l) => l.week === week) || null;
  const prev = mine.filter((l) => l.week < week).sort((a, b) => b.week - a.week)[0] || null;

  let target = null;
  let pctApplied = null;
  if (prev) {
    let factor = 1;
    for (let w = prev.week + 1; w <= week; w++) factor *= 1 + (Number(prog.weeks[w - 1]?.pct) || 0) / 100;
    target = roundTo(prev.weight * factor, prog.roundTo || 2.5);
    pctApplied = +((factor - 1) * 100).toFixed(1);
  }
  return {
    programId: prog.id, name: prog.name, lift: prog.lift, week, totalWeeks: prog.weeks.length,
    sets: spec.sets, reps: spec.reps, pct: spec.pct,
    base: prev ? { week: prev.week, sets: prev.sets, reps: prev.reps, weight: prev.weight } : null,
    target, pctApplied,
    log: current ? { sets: current.sets, reps: current.reps, weight: current.weight, loggedAt: current.loggedAt } : null,
  };
}

export function sanitizeProgram(b, mondayOf) {
  const name = String(b?.name || '').trim().slice(0, 80);
  const lift = String(b?.lift || '').trim().slice(0, 60);
  if (!name || !lift) throw Object.assign(new Error('Name and lift are required.'), { status: 400 });
  const weeks = (Array.isArray(b.weeks) ? b.weeks : []).slice(0, 16).map((w) => ({
    sets: Math.min(20, Math.max(1, Math.round(Number(w.sets) || 1))),
    reps: Math.min(50, Math.max(1, Math.round(Number(w.reps) || 1))),
    pct: Math.min(100, Math.max(-50, +(Number(w.pct) || 0).toFixed(1))),
  }));
  if (!weeks.length) throw Object.assign(new Error('Add at least one week.'), { status: 400 });
  return {
    name, lift, weeks,
    startDate: mondayOf(b.startDate),
    roundTo: [1, 1.25, 2, 2.5, 5].includes(Number(b.roundTo)) ? Number(b.roundTo) : 2.5,
  };
}
