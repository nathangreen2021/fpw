import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { load, save, db, id, AUDIO_DIR } from './lib/db.js';
import { today, addDays, mondayYmd, isYmd } from './lib/dates.js';
import { PB_EVENTS, bestOf, isBetter } from './lib/events.js';
import { seedIfEmpty, weekTemplate } from './lib/seed.js';
import { createSession, destroySession, requireUser, requireAdmin, requireActive, isActive,
  checkAdminPassword, adminPasswordConfigured, loginLimiter } from './lib/auth.js';
import { runMissedCheck, missedStreak, raiseAlert, resolveAlerts } from './lib/alerts.js';
import { summarise, transcribe } from './lib/summarize.js';
import * as billing from './lib/billing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_NAME = process.env.APP_NAME || 'FPW';
const APP_FULL_NAME = process.env.APP_FULL_NAME || 'Fitplus Well';
const PORT = Number(process.env.PORT || 3000);

load();
seedIfEmpty();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Stripe needs the raw body to verify signatures — register before express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), billing.webhook);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const originOf = (req) => process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
const byDate = (a, b) => a.date.localeCompare(b.date);
const clampNum = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };
const pubUser = (u) => ({ id: u.id, name: u.name, email: u.email, plan: u.plan, subStatus: u.subStatus, subRenews: u.subRenews,
  active: isActive(u), createdAt: u.createdAt, hasBilling: Boolean(u.stripeCustomerId), raceName: u.raceName || '', raceDate: u.raceDate || null });
const displayName = (u) => { const [f, ...r] = (u?.name || 'Athlete').split(' '); return r.length ? `${f} ${r[r.length - 1][0]}.` : f; };

// ---------- Public ----------
app.get('/api/config', (req, res) =>
  res.json({ appName: APP_NAME, appFullName: APP_FULL_NAME, stripe: Boolean(billing.stripe), plans: billing.publicPlans(), pbEvents: PB_EVENTS,
    demoHints: process.env.SEED_DEMO !== 'false' && process.env.NODE_ENV !== 'production' }));

app.post('/api/auth/register', loginLimiter, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8)
    return res.status(400).json({ error: 'Name, a valid email and a password of 8+ characters are required.' });
  if (db().users.some((u) => u.email === email)) return res.status(409).json({ error: 'An account with that email already exists.' });
  const u = { id: id(), name, email, passHash: await bcrypt.hash(password, 10), createdAt: new Date().toISOString(),
    plan: null, subStatus: 'none', subRenews: null, subStartedAt: null, adminNotes: '' };
  db().users.push(u);
  save();
  createSession(res, 'user', u.id);
  res.json({ user: pubUser(u) });
}));

app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const u = db().users.find((x) => x.email === email);
  if (!u || !(await bcrypt.compare(String(req.body?.password || ''), u.passHash)))
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  createSession(res, 'user', u.id);
  res.json({ user: pubUser(u) });
}));

app.post('/api/auth/logout', (req, res) => { destroySession(req, res, 'user'); res.json({ ok: true }); });
app.get('/api/me', requireUser, (req, res) => res.json({ user: pubUser(req.user) }));

// Athlete profile: name + target race (drives the race countdown)
app.patch('/api/me', requireUser, (req, res) => {
  const b = req.body || {};
  if (typeof b.name === 'string' && b.name.trim()) req.user.name = b.name.trim().slice(0, 80);
  if (typeof b.raceName === 'string') req.user.raceName = b.raceName.trim().slice(0, 80);
  if (b.raceDate === null || b.raceDate === '') req.user.raceDate = null;
  else if (isYmd(b.raceDate)) req.user.raceDate = b.raceDate;
  save();
  res.json({ user: pubUser(req.user) });
});

// Weekly recap ("wrapped") + streaks for the Today screen
app.get('/api/summary', requireUser, requireActive, (req, res) => {
  const s = db();
  const uid = req.user.id;
  const t = today();
  const recap = (start) => {
    const end = addDays(start, 6);
    const ws = s.workouts.filter((w) => w.published && w.date >= start && w.date <= end);
    const ids = new Set(ws.map((w) => w.id));
    const comps = s.completions.filter((c) => c.userId === uid && ids.has(c.workoutId));
    const rpes = comps.map((c) => c.rpe).filter(Boolean);
    const mine = s.results.filter((r) => r.userId === uid);
    const pbs = mine.filter((r) => r.date >= start && r.date <= end &&
      !mine.some((o) => o.event === r.event && o.id !== r.id && (o.date < r.date || (o.date === r.date && o.createdAt < r.createdAt)) && !isBetter(r.event, r.value, o.value))).length;
    return { start, sessions: comps.length, planned: ws.length, minutes: comps.reduce((a, c) => a + (c.durationMin || 0), 0),
      avgRpe: rpes.length ? +(rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null, pbs };
  };
  const thisWeek = mondayYmd();
  // consecutive weeks (ending this week or last) with at least one session
  const weeksWithWork = new Set(s.completions.filter((c) => c.userId === uid).map((c) => mondayYmd(c.date)));
  let streak = 0;
  let wk = weeksWithWork.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  while (weeksWithWork.has(wk)) { streak++; wk = addDays(wk, -7); }
  res.json({ today: t, thisWeek: recap(thisWeek), lastWeek: recap(addDays(thisWeek, -7)), weekStreak: streak,
    totalSessions: s.completions.filter((c) => c.userId === uid).length });
});

// ---------- Athlete: programme ----------
app.get('/api/week', requireUser, requireActive, (req, res) => {
  const start = mondayYmd(req.query.start);
  const end = addDays(start, 6);
  const s = db();
  const uid = req.user.id;
  const workouts = s.workouts.filter((w) => w.published && w.date >= start && w.date <= end).sort(byDate).map((w) => ({
    ...w,
    completion: s.completions.find((c) => c.userId === uid && c.workoutId === w.id) || null,
    voiceNotes: s.voiceNotes.filter((v) => v.userId === uid && v.workoutId === w.id)
      .map((v) => ({ id: v.id, transcript: v.transcript, hasAudio: Boolean(v.audioFile), createdAt: v.createdAt })),
  }));
  res.json({ start, today: today(), workouts, missedStreak: missedStreak(req.user).count });
});

const getWorkout = (wid) => db().workouts.find((w) => w.id === wid && w.published);

app.post('/api/workouts/:id/complete', requireUser, requireActive, (req, res) => {
  const w = getWorkout(req.params.id);
  if (!w) return res.status(404).json({ error: 'Workout not found.' });
  if (w.date > today()) return res.status(400).json({ error: 'This workout is not available yet.' });
  const s = db();
  let c = s.completions.find((x) => x.userId === req.user.id && x.workoutId === w.id);
  if (!c) { c = { id: id(), userId: req.user.id, workoutId: w.id, date: w.date }; s.completions.push(c); }
  Object.assign(c, {
    rpe: clampNum(req.body?.rpe, 1, 10),
    durationMin: clampNum(req.body?.durationMin, 1, 600),
    notes: String(req.body?.notes || '').slice(0, 1000),
    completedAt: new Date().toISOString(),
  });
  resolveAlerts(req.user.id, 'missed', 'auto: athlete completed a workout');
  save();
  res.json({ completion: c });
});

app.delete('/api/workouts/:id/complete', requireUser, requireActive, (req, res) => {
  const s = db();
  s.completions = s.completions.filter((c) => !(c.userId === req.user.id && c.workoutId === req.params.id));
  save();
  res.json({ ok: true });
});

// ---------- Athlete: voice notes ----------
const extFor = (m = '') => (/mp4|m4a|aac/.test(m) ? '.m4a' : /ogg/.test(m) ? '.ogg' : /wav/.test(m) ? '.wav' : /mpeg|mp3/.test(m) ? '.mp3' : '.webm');
const upload = multer({
  storage: multer.diskStorage({ destination: AUDIO_DIR, filename: (req, f, cb) => cb(null, id() + extFor(f.mimetype)) }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /^audio\//.test(f.mimetype) || f.mimetype === 'video/webm'),
});

app.post('/api/workouts/:id/voice', requireUser, requireActive, upload.single('audio'), wrap(async (req, res) => {
  const w = getWorkout(req.params.id);
  if (!w) return res.status(404).json({ error: 'Workout not found.' });
  let transcript = String(req.body?.transcript || '').trim().slice(0, 5000);
  if (!transcript && req.file) transcript = (await transcribe(path.join(AUDIO_DIR, req.file.filename), req.file.mimetype)) || '';
  if (!transcript && !req.file) return res.status(400).json({ error: 'Record a voice note or type a message first.' });

  const s = db();
  const completion = s.completions.find((c) => c.userId === req.user.id && c.workoutId === w.id);
  const summary = await summarise({ transcript, athlete: req.user.name, workout: w, completion });
  const v = { id: id(), userId: req.user.id, workoutId: w.id, transcript, audioFile: req.file?.filename || null, summary,
    createdAt: new Date().toISOString() };
  s.voiceNotes.push(v);
  if (summary.score === 1 || summary.flags.includes('injury'))
    raiseAlert(req.user, 'wellbeing', `${req.user.name} flagged a possible concern after "${w.title}": ${summary.headline}`, `wellbeing:${v.id}`);
  save();
  res.json({ voiceNote: { id: v.id, transcript, hasAudio: Boolean(v.audioFile), createdAt: v.createdAt } });
}));

// ---------- Athlete: PBs + leaderboards ----------
app.get('/api/pbs', requireUser, (req, res) => {
  const mine = db().results.filter((r) => r.userId === req.user.id);
  const events = Object.entries(PB_EVENTS).map(([key, ev]) => ({
    key, ...ev,
    best: bestOf(mine, key),
    attempts: mine.filter((r) => r.event === key).length,
    history: mine.filter((r) => r.event === key).sort(byDate).slice(-12),
  }));
  res.json({ events });
});

app.post('/api/results', requireUser, requireActive, (req, res) => {
  const event = String(req.body?.event || '');
  const value = Number(req.body?.value);
  if (!PB_EVENTS[event]) return res.status(400).json({ error: 'Unknown event.' });
  if (!Number.isFinite(value) || value <= 0 || value > 86400) return res.status(400).json({ error: 'Enter a valid result.' });
  const date = isYmd(req.body?.date) ? req.body.date : today();
  const s = db();
  const prev = bestOf(s.results.filter((r) => r.userId === req.user.id), event);
  const r = { id: id(), userId: req.user.id, event, value, date, workoutId: req.body?.workoutId || null, createdAt: new Date().toISOString() };
  s.results.push(r);
  save();
  res.json({ result: r, isPB: !prev || isBetter(event, value, prev.value), previous: prev });
});

app.delete('/api/results/:id', requireUser, (req, res) => {
  const s = db();
  s.results = s.results.filter((r) => !(r.id === req.params.id && r.userId === req.user.id));
  save();
  res.json({ ok: true });
});

app.get('/api/leaderboard/:event', requireUser, (req, res) => {
  const ev = req.params.event;
  if (!PB_EVENTS[ev]) return res.status(404).json({ error: 'Unknown event.' });
  const s = db();
  const from = req.query.period === 'month' ? addDays(today(), -30) : '0000';
  const pool = s.results.filter((r) => r.event === ev && r.date >= from);
  const byUser = new Map();
  for (const r of pool) {
    const b = byUser.get(r.userId);
    if (!b || isBetter(ev, r.value, b.value)) byUser.set(r.userId, r);
  }
  const rows = [...byUser.values()]
    .sort((a, b) => (isBetter(ev, a.value, b.value) ? -1 : 1))
    .map((r, i) => ({ rank: i + 1, name: displayName(s.users.find((u) => u.id === r.userId)), value: r.value, date: r.date, me: r.userId === req.user.id }));
  res.json({ event: ev, rows });
});

// ---------- Athlete: memberships ----------
app.post('/api/checkout', requireUser, wrap(async (req, res) => {
  const plan = req.body?.plan;
  if (!billing.PLANS[plan]) return res.status(400).json({ error: 'Choose a plan.' });
  if (!billing.stripe) return res.json({ demo: true });
  res.json({ url: await billing.createCheckout(req.user, plan, originOf(req)) });
}));

app.post('/api/checkout/demo-complete', requireUser, (req, res) => {
  if (billing.stripe) return res.status(400).json({ error: 'Demo payments are disabled when Stripe is configured.' });
  const plan = req.body?.plan;
  if (!billing.PLANS[plan]) return res.status(400).json({ error: 'Choose a plan.' });
  billing.activate(req.user, plan, { source: `demo (${req.body?.method === 'card' ? 'card' : 'Apple Pay'} simulated)` });
  res.json({ user: pubUser(req.user) });
});

app.get('/api/checkout/verify', requireUser, wrap(async (req, res) => {
  if (billing.stripe && req.query.session_id) await billing.verifySession(req.user, String(req.query.session_id));
  res.json({ user: pubUser(req.user) });
}));

app.post('/api/billing/portal', requireUser, wrap(async (req, res) => {
  if (!billing.stripe || !req.user.stripeCustomerId) return res.json({ demo: true });
  res.json({ url: await billing.portalUrl(req.user, originOf(req)) });
}));

app.post('/api/billing/cancel', requireUser, (req, res) => {
  if (billing.stripe && req.user.stripeCustomerId) return res.status(400).json({ error: 'Use Manage billing to cancel.' });
  if (req.user.subStatus === 'active') req.user.subStatus = 'cancelled';
  save();
  res.json({ user: pubUser(req.user) });
});

// ---------- Admin ----------
app.post('/api/admin/login', loginLimiter, (req, res) => {
  if (!adminPasswordConfigured()) return res.status(503).json({ error: 'Set ADMIN_PASSWORD on the server to enable admin.' });
  if (!checkAdminPassword(req.body?.password)) return res.status(401).json({ error: 'Incorrect password.' });
  createSession(res, 'admin');
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { destroySession(req, res, 'admin'); res.json({ ok: true }); });
app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ ok: true, stripe: Boolean(billing.stripe),
  llm: Boolean(process.env.ANTHROPIC_API_KEY), transcription: Boolean(process.env.OPENAI_API_KEY) }));

function memberRow(u) {
  const s = db();
  const t = today();
  const comps = s.completions.filter((c) => c.userId === u.id);
  const done = new Set(comps.map((c) => c.workoutId));
  const since = (u.subStartedAt || u.createdAt).slice(0, 10);
  const window = s.workouts.filter((w) => w.published && w.date >= addDays(t, -14) && w.date < t && w.date >= since);
  const notes = s.voiceNotes.filter((v) => v.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const scored = notes.slice(0, 5).filter((n) => n.summary?.score);
  return {
    id: u.id, name: u.name, email: u.email, plan: u.plan, subStatus: u.subStatus, subRenews: u.subRenews, createdAt: u.createdAt,
    active: isActive(u), adminNotes: u.adminNotes || '',
    lastWorkout: comps.map((c) => c.date).sort().pop() || null,
    completions: comps.length,
    compliance: u.subStartedAt && window.length ? Math.round((window.filter((w) => done.has(w.id)).length / window.length) * 100) : null,
    missedStreak: isActive(u) ? missedStreak(u).count : 0,
    mood: scored.length ? +(scored.reduce((a, n) => a + n.summary.score, 0) / scored.length).toFixed(1) : null,
    latestFeedback: notes[0]?.summary?.headline || null,
    ltv: s.payments.filter((p) => p.userId === u.id && p.status === 'paid').reduce((a, p) => a + p.amount, 0),
    openAlerts: s.alerts.filter((a) => a.userId === u.id && !a.resolved).length,
  };
}

const feedbackItem = (v) => {
  const s = db();
  const u = s.users.find((x) => x.id === v.userId);
  const w = s.workouts.find((x) => x.id === v.workoutId);
  const c = s.completions.find((x) => x.userId === v.userId && x.workoutId === v.workoutId);
  return { id: v.id, user: { id: u?.id, name: u?.name || 'Deleted user' }, workout: w ? { id: w.id, title: w.title, date: w.date } : null,
    transcript: v.transcript, summary: v.summary, audioUrl: v.audioFile ? `/api/admin/audio/${v.audioFile}` : null,
    rpe: c?.rpe ?? null, createdAt: v.createdAt };
};

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  runMissedCheck();
  const s = db();
  const t = today();
  const active = s.users.filter(isActive);
  const wkStart = mondayYmd();
  const due = s.workouts.filter((w) => w.published && w.date >= wkStart && w.date <= t);
  const dueIds = new Set(due.map((w) => w.id));
  const activeIds = new Set(active.map((u) => u.id));
  const doneThisWeek = s.completions.filter((c) => dueIds.has(c.workoutId) && activeIds.has(c.userId)).length;
  const recent = s.voiceNotes.filter((v) => v.createdAt >= new Date(Date.now() - 7 * 864e5).toISOString());
  const moods = { great: 0, good: 0, ok: 0, tough: 0, concern: 0 };
  recent.forEach((v) => { if (moods[v.summary?.mood] !== undefined) moods[v.summary.mood]++; });
  res.json({
    kpis: {
      activeMembers: active.length,
      leads: s.users.filter((u) => !isActive(u)).length,
      mrr: active.reduce((a, u) => a + billing.monthlyValue(u.plan), 0),
      currency: billing.CURRENCY,
      completionsThisWeek: doneThisWeek,
      compliance: due.length && active.length ? Math.round((doneThisWeek / (due.length * active.length)) * 100) : null,
      openAlerts: s.alerts.filter((a) => !a.resolved).length,
    },
    alerts: s.alerts.filter((a) => !a.resolved).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => ({ ...a, userName: s.users.find((u) => u.id === a.userId)?.name })),
    feedback: [...s.voiceNotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20).map(feedbackItem),
    moods,
  });
});

app.get('/api/admin/members', requireAdmin, (req, res) =>
  res.json({ members: db().users.map(memberRow).sort((a, b) => b.missedStreak - a.missedStreak || a.name.localeCompare(b.name)) }));

app.get('/api/admin/members.csv', requireAdmin, (req, res) => {
  const cols = ['name', 'email', 'plan', 'subStatus', 'subRenews', 'createdAt', 'lastWorkout', 'completions', 'compliance', 'missedStreak', 'mood', 'ltv'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = db().users.map(memberRow).map((m) => cols.map((c) => q(c === 'ltv' ? (m.ltv / 100).toFixed(2) : m[c])).join(','));
  res.type('text/csv').attachment('members.csv').send([cols.join(','), ...rows].join('\n'));
});

app.get('/api/admin/members/:id', requireAdmin, (req, res) => {
  const s = db();
  const u = s.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'Member not found.' });
  const mine = s.results.filter((r) => r.userId === u.id);
  res.json({
    member: memberRow(u),
    completions: s.completions.filter((c) => c.userId === u.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
      .map((c) => ({ ...c, title: s.workouts.find((w) => w.id === c.workoutId)?.title })),
    feedback: s.voiceNotes.filter((v) => v.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(feedbackItem),
    pbs: Object.keys(PB_EVENTS).map((k) => ({ key: k, ...PB_EVENTS[k], best: bestOf(mine, k) })).filter((p) => p.best),
    payments: s.payments.filter((p) => p.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    alerts: s.alerts.filter((a) => a.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
});

app.patch('/api/admin/members/:id', requireAdmin, (req, res) => {
  const u = db().users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'Member not found.' });
  const b = req.body || {};
  if (typeof b.adminNotes === 'string') u.adminNotes = b.adminNotes.slice(0, 5000);
  if (['active', 'cancelled', 'past_due', 'none', 'paused'].includes(b.subStatus)) u.subStatus = b.subStatus;
  if (b.plan === null || billing.PLANS[b.plan]) u.plan = b.plan;
  if (isYmd(b.subRenews)) u.subRenews = new Date(`${b.subRenews}T23:59:00`).toISOString();
  if (u.subStatus === 'active' && !u.subStartedAt) u.subStartedAt = new Date().toISOString();
  save();
  res.json({ member: memberRow(u) });
});

function sanitizeWorkout(b) {
  if (!isYmd(b?.date)) throw Object.assign(new Error('A valid date is required.'), { status: 400 });
  const title = String(b.title || '').trim().slice(0, 120);
  if (!title) throw Object.assign(new Error('A title is required.'), { status: 400 });
  return {
    date: b.date, title,
    focus: String(b.focus || '').trim().slice(0, 60),
    notes: String(b.notes || '').trim().slice(0, 2000),
    duration: Number(b.duration) > 0 ? Math.min(300, Math.round(Number(b.duration))) : null,
    published: b.published !== false,
    blocks: (Array.isArray(b.blocks) ? b.blocks : []).slice(0, 20).map((x) => ({
      title: String(x.title || '').trim().slice(0, 120) || 'Block',
      format: String(x.format || '').trim().slice(0, 120),
      details: String(x.details || '').slice(0, 3000),
      ...(PB_EVENTS[x.pbEvent] ? { pbEvent: x.pbEvent } : {}),
    })),
  };
}

app.get('/api/admin/workouts', requireAdmin, (req, res) => {
  const start = mondayYmd(req.query.start);
  const end = addDays(start, 6);
  const s = db();
  res.json({ start, today: today(), workouts: s.workouts.filter((w) => w.date >= start && w.date <= end).sort(byDate)
    .map((w) => ({ ...w, completions: s.completions.filter((c) => c.workoutId === w.id).length,
      voiceNotes: s.voiceNotes.filter((v) => v.workoutId === w.id).length })) });
});
app.get('/api/admin/templates', requireAdmin, (req, res) => res.json({ templates: weekTemplate() }));

app.post('/api/admin/workouts', requireAdmin, (req, res) => {
  const w = { id: id(), ...sanitizeWorkout(req.body), createdAt: new Date().toISOString() };
  db().workouts.push(w);
  save();
  res.json({ workout: w });
});
app.put('/api/admin/workouts/:id', requireAdmin, (req, res) => {
  const w = db().workouts.find((x) => x.id === req.params.id);
  if (!w) return res.status(404).json({ error: 'Workout not found.' });
  Object.assign(w, sanitizeWorkout(req.body), { updatedAt: new Date().toISOString() });
  save();
  res.json({ workout: w });
});
app.delete('/api/admin/workouts/:id', requireAdmin, (req, res) => {
  const s = db();
  s.workouts = s.workouts.filter((w) => w.id !== req.params.id);
  s.completions = s.completions.filter((c) => c.workoutId !== req.params.id);
  save();
  res.json({ ok: true });
});
app.post('/api/admin/workouts/copy-week', requireAdmin, (req, res) => {
  const from = mondayYmd(req.body?.from);
  const to = mondayYmd(req.body?.to);
  if (from === to) return res.status(400).json({ error: 'Choose a different target week.' });
  const s = db();
  const offset = Math.round((new Date(to) - new Date(from)) / 864e5);
  let copied = 0;
  for (const w of s.workouts.filter((x) => x.date >= from && x.date <= addDays(from, 6))) {
    const date = addDays(w.date, offset);
    if (!req.body?.overwrite && s.workouts.some((x) => x.date === date)) continue;
    if (req.body?.overwrite) s.workouts = s.workouts.filter((x) => x.date !== date);
    s.workouts.push({ ...structuredClone(w), id: id(), date, createdAt: new Date().toISOString() });
    copied++;
  }
  save();
  res.json({ copied });
});

app.get('/api/admin/payments', requireAdmin, (req, res) => {
  const s = db();
  const payments = [...s.payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => ({ ...p, userName: s.users.find((u) => u.id === p.userId)?.name || '—' }));
  res.json({ payments, total: payments.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0), currency: billing.CURRENCY });
});

app.post('/api/admin/alerts/:id/resolve', requireAdmin, (req, res) => {
  const a = db().alerts.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Alert not found.' });
  Object.assign(a, { resolved: true, resolvedAt: new Date().toISOString(), resolvedBy: 'coach' });
  save();
  res.json({ ok: true });
});
app.post('/api/admin/alerts/run', requireAdmin, (req, res) => res.json({ created: runMissedCheck() }));

app.get('/api/admin/audio/:file', requireAdmin, (req, res) => {
  const f = path.join(AUDIO_DIR, path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.status(404).end();
  res.sendFile(f);
});

// ---------- Errors ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  if (err.status !== 400) console.error(err);
  res.status(err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500)).json({ error: err.message || 'Something went wrong.' });
});

runMissedCheck();
setInterval(runMissedCheck, 60 * 60 * 1000); // hourly

app.listen(PORT, () => {
  console.log(`\n${APP_NAME} running → http://localhost:${PORT}`);
  console.log(`Admin / CRM       → http://localhost:${PORT}/admin`);
  console.log(`Payments: ${billing.stripe ? 'Stripe (live/test keys)' : 'DEMO mode (no STRIPE_SECRET_KEY)'}`);
  if (!process.env.ADMIN_PASSWORD) console.warn('⚠  ADMIN_PASSWORD not set — using dev default "coach123" (disabled in production).');
});
