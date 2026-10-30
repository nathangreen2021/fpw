// Seeds a full Monday–Friday HYROX-style training week (last, this and next week)
// plus optional demo athletes so the CRM, alerts and leaderboards have data.
import bcrypt from 'bcryptjs';
import { db, save, id } from './db.js';
import { mondayYmd, addDays, today, parseYmd } from './dates.js';
import { summariseHeuristic } from './summarize.js';
import { raiseAlert } from './alerts.js';

export function weekTemplate() {
  return [
    {
      day: 0, title: 'Compromised Running', duration: 60, focus: 'Engine + Strength',
      notes: 'Run splits should stay within 10 s of each other. If round 4 is 20 s+ slower, you went out too hot.',
      blocks: [
        { title: 'Warm-up', format: '10 min', details: '500 m easy row\n2 rounds: 10 air squats, 10 walking lunges, 5 inchworms, 10 band pull-aparts\n3 × 20 s strides building to race pace' },
        { title: 'Strength — Back Squat', format: '5 × 5 @ 75% · rest 2:00', details: '3 s lowering, drive up hard\nLog a heavy single if you test your 1RM', pbEvent: 'back_squat_1rm' },
        { title: 'Compromised Runs', format: '4 rounds for time · rest 2:00', details: '1 km run @ HYROX race pace\n20 wall balls (9 kg / 6 kg)\n15 cal SkiErg\nGoal: hold the same run split every round', pbEvent: 'run_1k' },
        { title: 'Cool-down', format: '8 min', details: 'Easy walk 3 min\nCouch stretch 1 min / side\nPigeon 1 min / side' },
      ],
    },
    {
      day: 1, title: 'Threshold + Sled Work', duration: 60, focus: 'Stations',
      notes: 'Threshold = "comfortably hard". You should only manage 3–4 words at a time.',
      blocks: [
        { title: 'Warm-up', format: '10 min', details: '5 min easy SkiErg\nHip airplanes, world’s greatest stretch\n2 × 10 m light sled push + pull' },
        { title: 'Sled Skill', format: '6 sets · rest 1:30', details: '15 m sled push (race weight +10%)\n15 m sled pull, hand-over-hand\nLow hips, short choppy steps, arms locked', pbEvent: 'sled_push_50' },
        { title: 'Threshold Row', format: '5 × 1000 m · rest 1:30', details: 'Pace you could hold for ~20 min\nDamper 5–6, rate 26–30\nLog your fastest 1000 m', pbEvent: 'row_1000' },
        { title: 'Accessory', format: '3 rounds', details: '12 single-arm DB rows / side\n30 s hollow hold\n10 Copenhagen plank lifts / side' },
      ],
    },
    {
      day: 2, title: 'Aerobic Base', duration: 70, focus: 'Zone 2',
      notes: 'Easy means easy. This session builds the engine that makes Friday possible.',
      blocks: [
        { title: 'Zone 2 Flush', format: '45–60 min continuous', details: '15 min run\n15 min SkiErg\n15 min run\nOptional: 15 min row\nNasal breathing only — 60–70% max HR' },
        { title: 'Mobility', format: '15 min', details: '90/90 hip switches 2 × 10\nThoracic openers 2 × 8 / side\nCalf + ankle rocks 2 × 15\nDeep squat hold 2 × 60 s' },
      ],
    },
    {
      day: 3, title: 'Strength Endurance', duration: 65, focus: 'Legs + Lunges',
      notes: 'Lunges: back knee touches the floor every rep — no-reps in the race cost time.',
      blocks: [
        { title: 'Warm-up', format: '10 min', details: '1 km easy jog\nGlute bridges 2 × 15\nLateral band walks 2 × 10 / side' },
        { title: 'Strength — Deadlift', format: '4 × 6 @ 75–80% · rest 2:00', details: 'Brace, push the floor away\nLog a heavy single if you test your 1RM', pbEvent: 'deadlift_1rm' },
        { title: 'Station Grind', format: '3 rounds · rest 2:00', details: '50 m sandbag lunges (20 kg / 10 kg)\n100 m farmers carry (2 × 24 kg / 2 × 16 kg)\n20 burpee broad jumps\n400 m run', pbEvent: 'lunges_100' },
        { title: 'Finisher — 1 km Time Trial', format: '1 × max effort', details: 'Run 1 km as fast as you can on tired legs\nThis is your "compromised 1 km" benchmark', pbEvent: 'run_1k' },
      ],
    },
    {
      day: 4, title: 'Half HYROX Simulation', duration: 75, focus: 'Race Practice',
      notes: 'Treat this like race day: same shoes, same fuel, same warm-up. Use a voice note to tell me where you lost time.',
      blocks: [
        { title: 'Warm-up', format: '15 min', details: '800 m easy run\n2 rounds: 250 m Ski, 250 m row, 5 burpee broad jumps\n2 × 100 m strides' },
        { title: 'Half Simulation', format: 'For time · 50 min cap', details: '1 km run + 1000 m SkiErg\n1 km run + 50 m sled push\n1 km run + 50 m sled pull\n1 km run + 80 m burpee broad jumps\nRecord total time and each station split', pbEvent: 'half_sim' },
        { title: 'Cool-down', format: '10 min', details: 'Easy walk + full-body stretch\nRefuel within 60 min' },
      ],
    },
  ];
}

export function seedIfEmpty() {
  const s = db();
  if (s.workouts.length || s.users.length) return;

  const thisMon = mondayYmd();
  const weeks = [addDays(thisMon, -7), thisMon, addDays(thisMon, 7)];
  for (const wk of weeks) {
    for (const t of weekTemplate()) {
      s.workouts.push({ id: id(), date: addDays(wk, t.day), title: t.title, focus: t.focus, notes: t.notes, duration: t.duration,
        blocks: t.blocks.map((b) => ({ ...b })), published: true, createdAt: new Date().toISOString() });
    }
  }
  console.log('Seeded 3 weeks of HYROX programming.');

  if (process.env.SEED_DEMO === 'false') return save();

  const hash = bcrypt.hashSync('demo1234', 8);
  const t0 = today();
  const joined = parseYmd(addDays(weeks[0], -1)).toISOString();
  const mk = (name, email, plan) => {
    const days = { weekly: 4, monthly: 18, annual: 300 }[plan];
    const u = { id: id(), name, email, passHash: hash, createdAt: joined, subStartedAt: plan ? joined : null, plan: plan || null,
      subStatus: plan ? 'active' : 'none', subRenews: plan ? new Date(Date.now() + days * 864e5).toISOString() : null, adminNotes: '' };
    s.users.push(u);
    return u;
  };
  const sarah = mk('Sarah Mitchell', 'sarah@demo.app', 'monthly');
  sarah.raceName = 'HYROX Sydney';
  sarah.raceDate = addDays(t0, 56);
  const josh = mk('Josh Nguyen', 'josh@demo.app', 'weekly');
  const mia = mk('Mia Rossi', 'mia@demo.app', 'annual');
  mk('Tom Baker', 'tom@demo.app', null); // a lead who never paid

  const t = today();
  const past = s.workouts.filter((w) => w.date < t).sort((a, b) => a.date.localeCompare(b.date));
  const at = (date, h) => new Date(parseYmd(date).getTime() + h * 3600e3).toISOString();
  const complete = (u, w, rpe, durationMin, notes = '') =>
    s.completions.push({ id: id(), userId: u.id, workoutId: w.id, date: w.date, rpe, durationMin, notes, completedAt: at(w.date, 18) });

  past.forEach((w, i) => complete(sarah, w, 6 + (i % 3), 55 + (i % 4) * 5));
  past.slice(0, Math.max(0, past.length - 2)).forEach((w) => complete(josh, w, 7, 50)); // last 2 missed → alert
  past.forEach((w, i) => { if (i !== 2) complete(mia, w, 5 + (i % 4), 50); });

  const note = (u, w, transcript) => {
    const v = { id: id(), userId: u.id, workoutId: w.id, transcript, audioFile: null,
      summary: summariseHeuristic({ transcript }), createdAt: at(w.date, 19) };
    s.voiceNotes.push(v);
    return v;
  };
  if (past.length) {
    const last = past[past.length - 1];
    note(sarah, last, 'Felt really strong today. Smashed the wall balls unbroken and I think I got a PB on the 1k, legs felt fresh the whole way.');
    const v = note(mia, last, 'Struggled a bit today, got a twinge of pain in my left knee on the lunges so I scaled the last round. Not sure if I should run tomorrow.');
    raiseAlert(mia, 'wellbeing', `Mia Rossi flagged a possible concern after "${last.title}": ${v.summary.headline}`, `wellbeing:${v.id}`);
    if (past.length >= 3) note(josh, past[past.length - 3], 'Pretty tired, work has been super busy and stressful this week. Got through it but the runs felt heavy.');
  }

  const r = (u, event, value, date) => s.results.push({ id: id(), userId: u.id, event, value, date, createdAt: at(date, 19) });
  const d = (n) => addDays(weeks[0], n);
  r(sarah, 'run_1k', 220, d(0)); r(sarah, 'run_1k', 205, d(3)); r(sarah, 'row_1000', 225, d(1)); r(sarah, 'ski_1000', 245, d(4));
  r(sarah, 'half_sim', 2300, d(4)); r(sarah, 'back_squat_1rm', 85, d(0)); r(sarah, 'lunges_100', 340, d(3));
  r(josh, 'run_1k', 190, d(0)); r(josh, 'row_1000', 210, d(1)); r(josh, 'ski_1000', 235, d(4)); r(josh, 'half_sim', 2145, d(4));
  r(josh, 'back_squat_1rm', 120, d(0)); r(josh, 'deadlift_1rm', 170, d(3));
  r(mia, 'run_1k', 228, d(3)); r(mia, 'row_1000', 242, d(1)); r(mia, 'ski_1000', 260, d(4)); r(mia, 'wall_balls_100', 390, d(0));

  const pay = (u, plan, amount, daysAgo) => s.payments.push({ id: id(), userId: u.id, plan, amount, currency: 'aud', status: 'paid',
    source: 'demo', ref: null, createdAt: new Date(Date.now() - daysAgo * 864e5).toISOString() });
  pay(sarah, 'monthly', 9900, 9); pay(josh, 'weekly', 2900, 10); pay(josh, 'weekly', 2900, 3); pay(mia, 'annual', 99900, 9);

  console.log('Seeded demo athletes (password: demo1234).');
  save();
}
