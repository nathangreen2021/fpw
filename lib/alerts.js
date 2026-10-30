import { db, save, id } from './db.js';
import { today, ymd } from './dates.js';
import { isActive } from './auth.js';

// How many consecutive programmed workouts (most recent first, excluding today)
// has this athlete not completed?
export function missedStreak(u) {
  const s = db();
  const start = u.subStartedAt || u.createdAt;
  if (!start) return { count: 0, missed: [] };
  const since = ymd(start);
  const t = today();
  const past = s.workouts
    .filter((w) => w.published && w.date < t && w.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date));
  const done = new Set(s.completions.filter((c) => c.userId === u.id).map((c) => c.workoutId));
  const missed = [];
  for (const w of past) {
    if (done.has(w.id)) break;
    missed.push(w);
  }
  return { count: missed.length, missed };
}

async function notify(text) {
  // Optional: Slack / Discord / Zapier / Make webhook so the coach gets pinged
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
    });
  } catch (e) {
    console.warn('Alert webhook failed:', e.message);
  }
}

export function raiseAlert(user, type, message, key) {
  const s = db();
  if (key && s.alerts.some((a) => a.key === key)) return null;
  const alert = { id: id(), key: key || id(), userId: user.id, type, message, createdAt: new Date().toISOString(), resolved: false };
  s.alerts.push(alert);
  save();
  notify(`[${type.toUpperCase()}] ${message}`);
  return alert;
}

export function resolveAlerts(userId, type, by) {
  for (const a of db().alerts) {
    if (a.userId === userId && a.type === type && !a.resolved) {
      a.resolved = true;
      a.resolvedAt = new Date().toISOString();
      a.resolvedBy = by;
    }
  }
}

export const MISSED_THRESHOLD = Number(process.env.MISSED_THRESHOLD || 2);

export function runMissedCheck() {
  const s = db();
  let created = 0;
  for (const u of s.users) {
    if (!isActive(u)) continue;
    const { count, missed } = missedStreak(u);
    if (count < MISSED_THRESHOLD) continue;
    const oldest = missed[missed.length - 1];
    const key = `missed:${u.id}:${oldest.id}`; // stable for this run of misses
    const titles = missed.slice(0, 4).map((w) => `${w.title} (${w.date})`).join(', ');
    const message = `${u.name} has missed ${count} workouts in a row: ${titles}${count > 4 ? '…' : ''}`;
    const existing = s.alerts.find((a) => a.key === key);
    if (existing) {
      if (!existing.resolved && existing.message !== message) { existing.message = message; existing.count = count; }
    } else if (raiseAlert(u, 'missed', message, key)) {
      created++;
    }
  }
  save();
  return created;
}
