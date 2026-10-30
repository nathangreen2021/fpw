import crypto from 'crypto';
import { db, save } from './db.js';

const DAY = 864e5;
const TTL = { user: 30 * DAY, admin: 12 * 3600e3 };
const COOKIE = { user: 'sid', admin: 'adm' };
const GRACE_MS = 2 * DAY; // access grace period after a renewal date passes

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const shaHex = (s) => sha(s).toString('hex');

export function createSession(res, role, userId = null) {
  const token = crypto.randomBytes(32).toString('hex');
  const s = db();
  s.sessions = s.sessions.filter((x) => x.exp > Date.now());
  s.sessions.push({ token: shaHex(token), role, userId, exp: Date.now() + TTL[role] });
  save();
  res.cookie(COOKIE[role], token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL[role],
    path: '/',
  });
}

function getSession(req, role) {
  const token = req.cookies?.[COOKIE[role]];
  if (!token) return null;
  const h = shaHex(token);
  return db().sessions.find((s) => s.token === h && s.role === role && s.exp > Date.now()) || null;
}

export function destroySession(req, res, role) {
  const token = req.cookies?.[COOKIE[role]];
  if (token) {
    const h = shaHex(token);
    db().sessions = db().sessions.filter((s) => s.token !== h);
    save();
  }
  res.clearCookie(COOKIE[role], { path: '/' });
}

export function requireUser(req, res, next) {
  const s = getSession(req, 'user');
  const user = s && db().users.find((u) => u.id === s.userId);
  if (!user) return res.status(401).json({ error: 'Please log in.' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!getSession(req, 'admin')) return res.status(401).json({ error: 'Admin login required.' });
  next();
}

export function isActive(u) {
  if (!u || !['active', 'cancelled', 'past_due'].includes(u.subStatus) || !u.subRenews) return false;
  return new Date(u.subRenews).getTime() + GRACE_MS > Date.now();
}

export function requireActive(req, res, next) {
  if (!isActive(req.user)) return res.status(402).json({ error: 'An active membership is required.', needsPlan: true });
  next();
}

export function adminPasswordConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD) || process.env.NODE_ENV !== 'production';
}

export function checkAdminPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'coach123');
  if (!expected || typeof pw !== 'string') return false;
  return crypto.timingSafeEqual(sha(pw), sha(expected));
}

// Basic brute-force protection for login endpoints
const attempts = new Map();
export function loginLimiter(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, reset: now + 15 * 60e3 };
  if (now > a.reset) { a.n = 0; a.reset = now + 15 * 60e3; }
  a.n += 1;
  attempts.set(key, a);
  if (a.n > 10) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  next();
}
