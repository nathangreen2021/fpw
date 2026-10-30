// Tiny JSON-file datastore. Good for a single coach / small gym.
// Swap for Postgres (e.g. Supabase / Neon) when you outgrow it — every
// read/write goes through db(), so the change is contained.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const FILE = path.join(DATA_DIR, 'db.json');

const empty = () => ({
  users: [],        // athletes + CRM fields
  workouts: [],     // programmed sessions
  completions: [],  // athlete marked a workout done
  voiceNotes: [],   // transcripts + AI/heuristic summaries
  results: [],      // PB attempts (Strava-style efforts)
  payments: [],     // membership payments
  alerts: [],       // coach alerts (missed workouts, wellbeing, billing)
  sessions: [],     // login sessions (hashed tokens)
});

let state = empty();
let timer = null;

export function load() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    state = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  }
  state.sessions = state.sessions.filter((s) => s.exp > Date.now());
  return state;
}

// Debounced atomic write
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 40);
}
export function flush() {
  clearTimeout(timer);
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

export const db = () => state;
export const id = () => crypto.randomUUID();
