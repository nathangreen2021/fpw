// Turns an athlete's voice note into a coach-friendly summary.
// 1) Transcription: browser speech-to-text (free) or OpenAI Whisper if OPENAI_API_KEY is set.
// 2) Summary: Claude (ANTHROPIC_API_KEY) if set, otherwise a keyword heuristic.
import fs from 'fs';
import path from 'path';

const POS = ['great', 'good', 'strong', 'awesome', 'amazing', 'smashed', 'fresh', 'easy', 'pb', 'pr', 'personal best',
  'fast', 'loved', 'love', 'happy', 'energised', 'energized', 'fun', 'solid', 'crushed', 'nailed', 'best', 'unbroken', 'confident', 'proud'];
const NEG = ['tired', 'exhausted', 'hard', 'struggled', 'struggle', 'bad', 'slow', 'heavy', 'rough', 'terrible', 'awful', 'dead',
  'flat', 'sick', 'unwell', 'stressed', 'gassed', "couldn't", 'could not', 'failed', 'quit', 'scaled', 'worst', 'drained'];
const FLAGS = {
  injury: ['pain', 'hurt', 'injur', 'tweak', 'strain', 'sprain', 'niggle', 'twinge', 'pulled'],
  illness: ['sick', 'flu', 'cold', 'fever', 'unwell', 'covid', 'nausea', 'vomit'],
  fatigue: ['exhausted', 'no sleep', 'bad sleep', 'slept badly', 'burnt out', 'burned out', 'wrecked', 'drained'],
  life: ['stress', 'work', 'travel', 'busy', 'kids'],
};
const BODY = ['knee', 'back', 'shoulder', 'ankle', 'hamstring', 'calf', 'hip', 'quad', 'achilles', 'wrist', 'elbow', 'neck', 'groin', 'foot', 'shin'];
const MOODS = { 5: 'great', 4: 'good', 3: 'ok', 2: 'tough', 1: 'concern' };

const count = (t, words) => words.reduce((n, w) => n + (t.match(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')) || []).length, 0);

export function summariseHeuristic({ transcript = '', completion } = {}) {
  const t = transcript.toLowerCase();
  if (!t.trim()) {
    return { mood: 'unknown', score: null, headline: 'Voice note (no transcript)', summary: 'Audio only — listen to the recording.',
      flags: [], coachAction: 'Listen to the voice note.', engine: 'heuristic' };
  }
  let pos = count(t, POS);
  let neg = count(t, NEG);
  if (completion?.rpe >= 9) neg += 0.5;
  const flags = Object.entries(FLAGS).filter(([, ws]) => ws.some((w) => t.includes(w))).map(([f]) => f);
  if (/\b(pb|pr|personal best)\b/.test(t)) flags.push('pb');
  const parts = BODY.filter((b) => new RegExp(`\\b${b}`).test(t));

  const ratio = (pos - neg) / Math.max(1, pos + neg);
  let score = ratio > 0.5 ? 5 : ratio > 0.1 ? 4 : ratio >= -0.1 ? 3 : 2;
  if (flags.includes('injury') || flags.includes('illness')) score = 1;

  const first = transcript.split(/(?<=[.!?])\s+/)[0].trim();
  const headline = first.length > 90 ? first.slice(0, 87) + '…' : first;
  const bits = [{ 5: 'Great session', 4: 'Positive session', 3: 'Neutral session', 2: 'Tough session', 1: 'Possible concern' }[score]];
  if (flags.includes('pb')) bits.push('mentions a PB');
  if (flags.includes('injury')) bits.push(`reports pain${parts.length ? ` (${parts.join(', ')})` : ''}`);
  if (flags.includes('illness')) bits.push('may be unwell');
  if (flags.includes('fatigue')) bits.push('signs of fatigue');
  if (flags.includes('life')) bits.push('outside stress mentioned');

  const coachAction = {
    1: `Check in today${parts.length ? ` about the ${parts[0]}` : ''} and consider modifying the next session.`,
    2: 'Send an encouraging message and consider scaling the next session.',
    3: 'No action needed — keep monitoring.',
    4: 'Acknowledge the effort — a quick "nice work" goes a long way.',
    5: 'Celebrate the win publicly — great moment to reinforce momentum.',
  }[score];

  return { mood: MOODS[score], score, headline, summary: bits.join(', ') + '.', flags, coachAction, engine: 'heuristic' };
}

async function summariseLLM({ transcript, athlete, workout, completion }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 400,
      system: 'You help a HYROX / hybrid fitness coach triage athlete feedback. Reply with ONLY a JSON object, no prose.',
      messages: [{
        role: 'user',
        content: `Athlete: ${athlete}
Workout: ${workout.title} on ${workout.date} (${workout.focus || 'n/a'})
Logged: ${completion ? `RPE ${completion.rpe ?? '?'}/10, ${completion.durationMin ?? '?'} min` : 'not marked complete'}
Voice note transcript:
"""${transcript}"""

Return JSON with keys:
"score": integer 1-5 (5 = great session, 3 = okay, 2 = tough, 1 = concern such as pain, injury or illness),
"mood": one of "great","good","ok","tough","concern",
"headline": at most 12 words,
"summary": 1-2 sentences for the coach,
"flags": array using only "injury","illness","fatigue","life","pb",
"coachAction": one short suggested action for the coach.`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const j = await res.json();
  const text = (j.content || []).map((c) => c.text || '').join('');
  const o = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
  const score = Math.min(5, Math.max(1, Math.round(Number(o.score) || 3)));
  return {
    score,
    mood: MOODS[score],
    headline: String(o.headline || '').slice(0, 120),
    summary: String(o.summary || '').slice(0, 500),
    flags: Array.isArray(o.flags) ? o.flags.filter((f) => ['injury', 'illness', 'fatigue', 'life', 'pb'].includes(f)) : [],
    coachAction: String(o.coachAction || '').slice(0, 200),
    engine: 'claude',
  };
}

export async function summarise(input) {
  if (process.env.ANTHROPIC_API_KEY && input.transcript?.trim()) {
    try {
      return await summariseLLM(input);
    } catch (e) {
      console.warn('LLM summary failed, using heuristic:', e.message);
    }
  }
  return summariseHeuristic(input);
}

export async function transcribe(file, mime) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(file)], { type: mime }), path.basename(file));
    fd.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: fd,
    });
    if (!r.ok) return null;
    return (await r.json()).text || null;
  } catch {
    return null;
  }
}
