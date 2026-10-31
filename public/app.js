// FPW — Fitplus Well · athlete app
const state = {
  config: null, user: null, tab: 'today', week: null, summary: null, selected: null,
  planBase: 'monthly', tier: 'fitness', authMode: 'login', lbEvent: 'run_1k', lbPeriod: 'all', openPb: null, changingPlan: false,
  focus: null, finish: null, nut: null, nutDate: null, nutToday: null, food: null,
};
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
const chosenPlanId = () => (state.tier === 'nutrition' ? `${state.planBase}_nutrition` : state.planBase);
const kg = (n) => `${+n} kg`;
const fmtNum = (n) => Number(n || 0).toLocaleString('en-AU');
const evName = (k) => state.config.pbEvents[k]?.name || k;
const evUnit = (k) => state.config.pbEvents[k]?.unit || 'time';
const planOf = (id) => state.config.plans.find((p) => p.id === id);
const firstName = () => (state.user?.name || '').split(' ')[0];
const todayYmd = () => ymd(new Date());
const selWorkout = () => state.week?.workouts.find((w) => w.id === state.selected);

// ---------- Theme (system / light / dark) ----------
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
const savedTheme = () => { try { return localStorage.getItem('fpw-theme') || 'system'; } catch { return 'system'; } };
applyTheme(savedTheme());

async function boot() {
  state.config = await api('/api/config');
  const q = new URLSearchParams(location.search);
  try { state.user = (await api('/api/me')).user; } catch { state.user = null; }
  if (q.get('checkout') === 'success' && state.user) {
    try {
      state.user = (await api(`/api/checkout/verify?session_id=${encodeURIComponent(q.get('session_id') || '')}`)).user;
      toast(state.user.active ? 'Payment confirmed — welcome to FPW!' : 'Payment received — activating your membership…');
    } catch (e) { toast(e.message); }
  } else if (q.get('checkout') === 'cancelled') toast('Checkout cancelled');
  if (q.has('checkout')) history.replaceState({}, '', '/');
  render();
}

function render() {
  const root = $('#app');
  if (!state.user) return renderAuth(root);
  if (!state.user.active || state.changingPlan) return renderPaywall(root);
  renderShell(root);
}

// ---------- Auth ----------
function renderAuth(root) {
  const reg = state.authMode === 'register';
  root.innerHTML = `<div class="auth">
    ${brandHTML(state.config.appName, state.config.appFullName, true)}
    <h1>Hybrid training,<br>coached.</h1>
    <p class="muted">Five coached sessions a week, built for HYROX and everyday athletes. Track your PBs, climb the leaderboard and keep your coach in the loop.</p>
    <form class="card form" data-form="auth">
      ${reg ? '<label>Full name<input name="name" required autocomplete="name"></label>' : ''}
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <label>Password<input name="password" type="password" minlength="8" required autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
      <button class="btn primary block lg" type="submit">${reg ? 'Create account' : 'Log in'}</button>
      <p class="muted small center" style="margin:16px 0 0">${reg ? 'Already a member?' : 'New to FPW?'} <a href="#" data-act="authToggle">${reg ? 'Log in' : 'Create an account'}</a></p>
      ${!reg && state.config.demoHints ? '<p class="muted small center" style="margin:6px 0 0">Demo: sarah@demo.app / demo1234</p>' : ''}
    </form></div>`;
}
actions.authToggle = () => { state.authMode = state.authMode === 'register' ? 'login' : 'register'; render(); };
forms.auth = async (f) => {
  const body = Object.fromEntries(new FormData(f));
  const r = await api(state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body });
  state.user = r.user;
  render();
};

// ---------- Paywall / Apple Pay ----------
function renderPaywall(root) {
  const sub = { weekly: 'Flexible — cancel any week', monthly: 'Most popular', annual: 'Two months free' };
  const plans = state.config.plans.filter((p) => p.tier === state.tier);
  const tierCopy = state.tier === 'nutrition'
    ? 'Everything in Fitness, plus a food diary — snap a photo or say what you ate and calories & macros are worked out for you.'
    : 'The full coached programme, strength progressions, PB tracking, leaderboards and coach feedback.';
  root.innerHTML = `<div class="paywall">
    <div style="display:flex;justify-content:space-between;align-items:center">${brandHTML(state.config.appName, state.config.appFullName)}
      ${state.changingPlan ? '<button class="btn sm ghost" data-act="cancelChange">Back</button>' : '<button class="btn sm ghost" data-act="logout">Log out</button>'}</div>
    <h1>${state.changingPlan ? 'Change your plan' : `Welcome, ${esc(firstName())}.<br>Choose your plan.`}</h1>
    <div class="seg tier-seg">${[['fitness', 'Fitness'], ['nutrition', 'Fitness + Nutrition']].map(([k, l]) => `<button class="${state.tier === k ? 'on' : ''}" data-act="pickTier" data-t="${k}">${l}</button>`).join('')}</div>
    <p class="muted" style="margin:12px 0 0">${tierCopy}</p>
    <div class="plans">${plans.map((p) => `
      <button class="plan ${chosenPlanId() === p.id ? 'sel' : ''}" data-act="pickPlan" data-plan="${p.id.replace('_nutrition', '')}">
        <span class="radio"></span>
        <span class="plan-name">${esc(p.name)}<span class="plan-sub">${sub[p.id] || ''}</span></span>
        <span class="plan-price">${money(p.amount, p.currency)}<small>per ${p.interval}</small></span>
        ${p.id === 'annual' ? '<span class="badge">Best value</span>' : ''}
      </button>`).join('')}</div>
    <div class="eyebrow" style="margin-bottom:12px">How it works</div>
    <ol class="timeline">
      <li><b>Today</b><span>Your programme unlocks and this week's sessions are ready.</span></li>
      <li><b>Every weekday</b><span>A new coached HYROX-style session — run it in Focus Mode.</span></li>
      <li><b>After each session</b><span>Log your effort and voice-note your coach. They see how it went.</span></li>
      ${state.tier === 'nutrition' ? '<li><b>Every meal</b><span>Snap a photo or say what you ate — calories and macros are calculated for you.</span></li>' : ''}
      <li><b>Anytime</b><span>Change or cancel your plan from your profile.</span></li>
    </ol>
    <div class="pay-stack">
      <button class="btn applepay block" data-act="pay" data-method="applepay">Pay with Apple Pay</button>
      <button class="btn outline block lg" data-act="pay" data-method="card">Pay with card</button>
    </div>
    <p class="muted small center" style="margin-top:14px">${state.config.stripe
      ? 'Secure checkout by Stripe. Apple Pay appears on supported Apple devices. Renews automatically — cancel anytime.'
      : 'Demo mode — no Stripe keys configured, so payments are simulated and no money is taken.'}</p>
  </div>`;
}
actions.pickPlan = (el) => { state.planBase = el.dataset.plan; render(); };
actions.pickTier = (el) => { state.tier = el.dataset.t; render(); };
actions.cancelChange = () => { state.changingPlan = false; render(); };
actions.pay = async (el) => {
  el.disabled = true;
  try {
    const r = await api('/api/checkout', { method: 'POST', body: { plan: chosenPlanId() } });
    if (r.url) return (location.href = r.url);
    if (r.demo) demoSheet(el.dataset.method);
  } finally { el.disabled = false; }
};
function demoSheet(method) {
  const p = planOf(chosenPlanId());
  openModal(`
    <div class="s-demo">Demo payment — simulated, no money is taken</div>
    <div class="s-row"><span>${esc(p.tierName)} · ${esc(p.name)}</span><span>${money(p.amount, p.currency)}</span></div>
    <div class="s-row"><span>Billed</span><span>Every ${p.interval}</span></div>
    <div class="s-row"><span>Pay with</span><span>${method === 'card' ? 'Card •••• 4242' : 'Apple Pay (Wallet)'}</span></div>
    <div class="s-row" style="border:0"><span class="s-total">Total</span><span class="s-total">${money(p.amount, p.currency)}</span></div>
    <button class="btn applepay block" data-act="demoPay" data-method="${method}">${method === 'card' ? 'Pay now' : 'Confirm with Apple Pay'}</button>
    <button class="btn ghost block" style="margin-top:6px" data-act="closeModal">Cancel</button>`, { sheet: true });
}
actions.closeModal = () => closeModal();
actions.demoPay = async (el) => {
  el.textContent = 'Processing…'; el.disabled = true;
  await new Promise((r) => setTimeout(r, 700));
  const r = await api('/api/checkout/demo-complete', { method: 'POST', body: { plan: chosenPlanId(), method: el.dataset.method } });
  state.user = r.user; state.changingPlan = false; state.week = null; state.summary = null;
  closeModal(); toast('Payment complete — welcome to FPW'); render();
};
actions.logout = async () => { await api('/api/auth/logout', { method: 'POST' }); Object.assign(state, { user: null, week: null, summary: null, nut: null, nutToday: null, nutDate: null, tab: 'today' }); render(); };

// ---------- Shell ----------
const tabs = () => [['today', 'Today', 'home'], ['progress', 'Progress', 'progress'],
  ...(state.user.nutrition ? [['nutrition', 'Nutrition', 'food']] : []), ['board', 'Leaderboard', 'board'], ['profile', 'Profile', 'account']];
function renderShell(root) {
  root.innerHTML = `
    <header class="topbar">${brandHTML(state.config.appName, '')}
      <button class="avatar" data-act="tab" data-tab="profile" aria-label="Profile">${initials(state.user.name)}</button></header>
    <main id="view"></main>
    <nav class="tabs">${tabs().map(([k, l, i]) => `<button class="tab ${state.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${ICONS[i]}${l}</button>`).join('')}</nav>`;
  showTab();
}
actions.tab = (el) => { stopRecording(true); state.tab = el.dataset.tab; renderShell($('#app')); window.scrollTo(0, 0); };
async function showTab() {
  const v = $('#view');
  try {
    if (state.tab === 'today') await viewToday(v);
    else if (state.tab === 'progress') await viewProgress(v);
    else if (state.tab === 'board') await viewBoard(v);
    else if (state.tab === 'nutrition') await viewNutrition(v);
    else viewProfile(v);
  } catch (e) {
    if (e.data?.needsPlan) { state.user.active = false; return render(); }
    if (e.data?.needsNutrition) { state.user.nutrition = false; state.tab = 'today'; return renderShell($('#app')); }
    if (e.status === 401) { state.user = null; return render(); }
    v.innerHTML = `<div class="empty card">${esc(e.message)}</div>`;
  }
}

// ---------- Today ----------
async function loadWeek(start) {
  state.week = await api(`/api/week${start ? `?start=${start}` : ''}`);
  const ws = state.week.workouts;
  if (!ws.some((w) => w.id === state.selected)) {
    state.selected = (ws.find((w) => w.date === state.week.today) || ws.find((w) => w.date > state.week.today) || ws[ws.length - 1] || {}).id || null;
  }
}
async function loadSummary() { state.summary = await api('/api/summary').catch(() => null); }
async function loadNutToday() { state.nutToday = state.user.nutrition ? await api('/api/nutrition').catch(() => null) : null; }
async function refresh() {
  await Promise.all([loadWeek(state.week?.start), loadSummary(), loadNutToday()]);
  if (state.tab === 'today') drawToday();
  if (state.focus) drawFocus();
}

async function viewToday(v) {
  if (!state.week || !state.summary) { v.innerHTML = '<div class="loading">Loading your week…</div>'; await Promise.all([state.week ? null : loadWeek(), loadSummary(), loadNutToday()]); }
  drawToday();
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function raceHTML() {
  const u = state.user;
  if (!u.raceDate || u.raceDate < todayYmd()) return '';
  const days = Math.round((parseYmd(u.raceDate) - parseYmd(todayYmd())) / 864e5);
  const pct = Math.max(4, Math.min(100, 100 - (days / 112) * 100)); // 16-week build
  return `<div class="race"><span class="vn-ic" style="width:38px;height:38px">${ICONS.flag}</span>
    <div class="r-name">${esc(u.raceName || 'Race day')}<span>${fmtDate(u.raceDate, { weekday: 'short', day: 'numeric', month: 'long' })}</span>
      <div class="race-bar"><i style="width:${pct}%"></i></div></div>
    <div class="days num">${days}<small>days</small></div></div>`;
}

function drawToday() {
  const W = state.week;
  const thisWeek = W.start <= W.today && W.today <= addDays(W.start, 6);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(W.start, i));
  const strip = days.map((d) => {
    const w = W.workouts.find((x) => x.date === d);
    const st = !w ? 'rest' : w.completion ? 'done' : d < W.today ? 'missed' : d === W.today ? 'today' : 'upcoming';
    return `<button class="day ${st} ${w && w.id === state.selected ? 'sel' : ''}" ${w ? `data-act="selectDay" data-id="${w.id}"` : 'disabled'} aria-label="${dayName(d)} ${st}">
      <span class="dname">${dayName(d)}</span><span class="dnum">${parseYmd(d).getDate()}</span><span class="dot">${st === 'done' ? '✓' : st === 'missed' ? '!' : ''}</span></button>`;
  }).join('');
  const sel = selWorkout();
  $('#view').innerHTML = `
    <div class="greet"><div class="eyebrow">${fmtDate(W.today, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>${greeting()}, ${esc(firstName())}</h1></div>
    ${raceHTML()}
    ${W.missedStreak >= 2 ? `<div class="banner warn">You've missed ${W.missedStreak} sessions in a row — your coach has been notified. Let's get back on track today.</div>` : ''}
    <div class="weekhead"><h3>${thisWeek ? 'This week' : `Week of ${fmtDate(W.start)}`}</h3>
      <div class="wk-nav"><button class="icon-btn" data-act="weekNav" data-d="-7" aria-label="Previous week">‹</button><button class="icon-btn" data-act="weekNav" data-d="7" aria-label="Next week">›</button></div></div>
    <div class="daystrip">${strip}</div>
    ${sel ? sessionHTML(sel) : '<div class="empty card">No sessions programmed for this week yet — check back soon.</div>'}
    ${thisWeek && state.summary ? recapHTML(state.summary) : ''}
    ${nutritionCardHTML()}`;
}
actions.selectDay = (el) => { stopRecording(true); state.selected = el.dataset.id; drawToday(); };
actions.weekNav = async (el) => { stopRecording(true); state.selected = null; await loadWeek(addDays(state.week.start, Number(el.dataset.d))); drawToday(); };

function sessionHTML(w) {
  const future = w.date > state.week.today;
  const c = w.completion;
  const pbCount = w.blocks.filter((b) => b.pbEvent || b.strength).length;
  const label = w.date === state.week.today ? "Today's session" : fmtDate(w.date, { weekday: 'long', day: 'numeric', month: 'short' });
  return `
  <section class="hero">
    <div class="eyebrow">${label}</div>
    <h2>${esc(w.title)}</h2>
    ${w.focus ? `<div class="focus">${esc(w.focus)}</div>` : ''}
    <div class="specs">
      <div><b class="num">${w.duration || '—'}</b><span>minutes</span></div>
      <div><b class="num">${w.blocks.length}</b><span>blocks</span></div>
      <div><b class="num">${pbCount}</b><span>to log</span></div>
    </div>
    ${w.notes ? `<p class="coach"><b>Coach:</b> ${esc(w.notes)}</p>` : ''}
    ${c ? `<div class="done-state"><span class="tick">✓</span><div style="flex:1"><b>Session complete</b>
        <div class="small" style="color:var(--ink-muted)">${[c.rpe ? `RPE ${c.rpe}/10` : '', c.durationMin ? `${c.durationMin} min` : '', timeAgo(c.completedAt)].filter(Boolean).join(' · ')}</div></div>
        <button class="btn sm outline" data-act="undoComplete" data-id="${w.id}">Undo</button></div>`
      : future ? `<button class="btn outline block" disabled>Unlocks ${fmtDate(w.date, { weekday: 'long' })}</button>`
      : `<div class="hero-actions"><button class="btn lime lg" data-act="startFocus">${ICONS.play} Start session</button>
          <button class="btn outline lg" data-act="openFinish">Log as done</button></div>`}
  </section>
  <div class="sec-head"><h3>The session</h3><span class="muted small">${w.blocks.length} blocks</span></div>
  <ol class="blocks">${w.blocks.map((b, i) => blockHTML(b, i, future)).join('')}</ol>
  ${c ? voiceCardHTML(w) : ''}`;
}

function blockHTML(b, i, future) {
  return `<li class="block">
    <div class="b-head"><span class="b-letter">${String.fromCharCode(65 + i)}</span>
      <div><h3>${esc(b.title)}</h3>${b.format ? `<div class="b-format">${esc(b.format)}</div>` : ''}</div></div>
    <ul class="b-lines">${lines(b.details)}</ul>
    ${b.strength ? strengthHTML(b.strength, state.selected, future) : ''}
    ${b.pbEvent && !future ? `<div class="b-pb"><button class="btn sm outline" data-act="openLog" data-event="${b.pbEvent}" data-slot="slot-${i}">Log ${esc(evName(b.pbEvent))}</button><div id="slot-${i}"></div></div>` : ''}
  </li>`;
}

function recapHTML(s) {
  const t = s.thisWeek, l = s.lastWeek;
  const C = 2 * Math.PI * 40;
  const pct = t.planned ? Math.min(1, t.sessions / t.planned) : 0;
  return `<section class="card" style="margin-top:22px">
    <div class="sec-head" style="margin:0 0 16px"><h3>Your week</h3>${s.weekStreak ? `<span class="chip lime">${s.weekStreak}-week streak</span>` : ''}</div>
    <div class="recap">
      <div class="ring"><svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="40" fill="none" stroke="var(--surface-2)" stroke-width="9"/>
        <circle cx="46" cy="46" r="40" fill="none" stroke="var(--brand)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
        <div class="lbl"><div><b class="num">${t.sessions}/${t.planned}</b><span>sessions</span></div></div></div>
      <div class="stats">
        <div class="stat"><b class="num">${t.minutes}</b><span>minutes trained</span></div>
        <div class="stat"><b class="num">${t.avgRpe ?? '—'}</b><span>average RPE</span></div>
        <div class="stat"><b class="num">${t.pbs}</b><span>PBs set</span></div>
        <div class="stat"><b class="num">${s.totalSessions}</b><span>all-time sessions</span></div>
      </div>
    </div>
    <p class="muted small" style="margin:16px 0 0">Last week: ${l.sessions}/${l.planned} sessions · ${l.minutes} min${l.pbs ? ` · ${l.pbs} PB${l.pbs === 1 ? '' : 's'}` : ''}</p>
  </section>`;
}

actions.undoComplete = async (el) => {
  await api(`/api/workouts/${el.dataset.id}/complete`, { method: 'DELETE' });
  await refresh();
};

// ---------- Focus Mode ----------
actions.startFocus = () => {
  const w = selWorkout();
  if (!w) return;
  state.focus = { wid: w.id, idx: 0, started: Date.now() };
  const el = document.createElement('div');
  el.className = 'focus-mode'; el.id = 'focus';
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  drawFocus();
  state.focus.timer = setInterval(() => {
    const c = $('#fm-clock');
    if (c && state.focus) c.textContent = fmtTime((Date.now() - state.focus.started) / 1000);
  }, 1000);
};
function drawFocus() {
  const f = state.focus;
  const w = state.week.workouts.find((x) => x.id === f.wid);
  const b = w.blocks[f.idx];
  const last = f.idx === w.blocks.length - 1;
  $('#focus').innerHTML = `
    <div class="fm-top"><button class="icon-btn" data-act="exitFocus" aria-label="Exit">×</button>
      <div class="fm-clock" id="fm-clock">${fmtTime((Date.now() - f.started) / 1000)}</div>
      <span class="small" style="color:var(--ink-muted);min-width:38px;text-align:right">${f.idx + 1}/${w.blocks.length}</span></div>
    <div class="fm-progress">${w.blocks.map((_, i) => `<i class="${i <= f.idx ? 'on' : ''}"></i>`).join('')}</div>
    <div class="fm-body">
      <div class="eyebrow">${esc(w.title)} · Block ${String.fromCharCode(65 + f.idx)}</div>
      <h1>${esc(b.title)}</h1>
      ${b.format ? `<div class="fm-format">${esc(b.format)}</div>` : ''}
      <ul class="fm-lines">${String(b.details || '').split('\n').filter((l) => l.trim()).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${b.strength ? strengthHTML(b.strength, w.id, false, true) : ''}
      ${b.pbEvent ? `<div style="margin-top:18px"><button class="btn lime sm" data-act="openLog" data-event="${b.pbEvent}" data-slot="fslot">Log ${esc(evName(b.pbEvent))}</button><div id="fslot"></div></div>` : ''}
    </div>
    <div class="fm-foot">
      <button class="btn outline lg" data-act="focusStep" data-d="-1" ${f.idx === 0 ? 'disabled' : ''}>Back</button>
      ${last ? '<button class="btn lime lg" data-act="focusFinish">Finish session</button>' : '<button class="btn lime lg" data-act="focusStep" data-d="1">Next block</button>'}
    </div>`;
  $('#focus .fm-body').scrollTop = 0;
}
actions.focusStep = (el) => { state.focus.idx += Number(el.dataset.d); drawFocus(); };
function closeFocus() {
  if (!state.focus) return 0;
  clearInterval(state.focus.timer);
  const mins = Math.max(1, Math.round((Date.now() - state.focus.started) / 60000));
  state.focus = null;
  $('#focus')?.remove();
  document.body.style.overflow = '';
  return mins;
}
actions.exitFocus = () => { if (confirm('Leave Focus Mode? Your session timer will stop.')) closeFocus(); };
actions.focusFinish = () => { const mins = closeFocus(); openFinish(mins); };

// ---------- Finish flow (log → voice note) ----------
actions.openFinish = () => openFinish();
function openFinish(mins) {
  const w = selWorkout();
  state.finish = { wid: w.id, step: 1, rpe: 7, durationMin: mins || w.duration || '', notes: '' };
  drawFinish();
}
function drawFinish() {
  const f = state.finish;
  const w = state.week.workouts.find((x) => x.id === f.wid);
  if (f.step === 1) {
    openModal(`<div class="steps"><i class="on"></i><i></i></div>
      <div class="eyebrow">${esc(w.title)}</div><h2 style="margin:4px 0 18px">How hard was it?</h2>
      <div class="rpe">${Array.from({ length: 10 }, (_, i) => `<button class="${f.rpe === i + 1 ? 'on' : ''}" data-act="setRpe" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>
      <div class="rpe-legend"><span>Easy</span><span>Moderate</span><span>All out</span></div>
      <form class="form" data-form="finish">
        <label>Total time (min)<input type="number" name="durationMin" min="1" max="600" inputmode="numeric" value="${f.durationMin}"></label>
        <label>Notes for yourself<textarea name="notes" rows="2" placeholder="Weights used, scaling, splits…">${esc(f.notes)}</textarea></label>
        <button class="btn primary block lg" type="submit">Save session</button>
      </form>`, { sheet: true });
  } else {
    openModal(`<div class="steps"><i class="on"></i><i class="on"></i></div>
      <h2 style="margin:4px 0 6px">Nice work. Tell your coach how it went.</h2>
      <p class="muted small" style="margin:0">What felt good, what didn't, anything sore? Your coach gets a summary.</p>
      ${recorderHTML()}
      <button class="btn primary block lg" data-act="sendVoice" data-id="${w.id}">Send to coach</button>
      <button class="btn ghost block" style="margin-top:6px" data-act="skipVoice">Skip for now</button>`, { sheet: true });
  }
}
actions.setRpe = (el) => {
  const form = $('[data-form=finish]');
  state.finish.durationMin = form.elements.durationMin.value; state.finish.notes = form.elements.notes.value;
  state.finish.rpe = Number(el.dataset.v);
  $$('.rpe button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === state.finish.rpe));
};
forms.finish = async (form) => {
  const f = state.finish;
  await api(`/api/workouts/${f.wid}/complete`, { method: 'POST',
    body: { rpe: f.rpe, durationMin: form.elements.durationMin.value, notes: form.elements.notes.value } });
  f.step = 2;
  drawFinish();
  refresh();
};
actions.skipVoice = () => { closeModal(); state.finish = null; toast('Session saved 💪'); };

// ---------- PB logging ----------
actions.openLog = (el) => {
  const slot = $(`#${el.dataset.slot}`);
  if (slot.innerHTML) return (slot.innerHTML = '');
  const ev = el.dataset.event;
  const unit = evUnit(ev);
  slot.innerHTML = `<form class="logform" data-form="logInline" data-event="${ev}">
    <input name="value" required placeholder="${unit === 'time' ? 'mm:ss (e.g. 3:42)' : 'kg'}" inputmode="${unit === 'time' ? 'text' : 'decimal'}">
    <button class="btn sm primary" type="submit">Save</button></form>`;
  $('input', slot).focus();
};
forms.logInline = async (f) => {
  const w = selWorkout();
  await logResult(f.dataset.event, f.elements.value.value, w?.date, w?.id);
  f.parentElement.innerHTML = '';
  loadSummary();
};
async function logResult(event, raw, date, workoutId) {
  const unit = evUnit(event);
  const value = unit === 'time' ? parseTime(raw) : Number(raw);
  if (!value || Number.isNaN(value)) throw new Error(unit === 'time' ? 'Enter a time like 3:42 or 1:02:15' : 'Enter a number');
  const r = await api('/api/results', { method: 'POST', body: { event, value, date, workoutId } });
  toast(r.isPB
    ? `🏆 New PB — ${evName(event)} ${fmtVal(unit, value)}${r.previous ? ` (was ${fmtVal(unit, r.previous.value)})` : ''}`
    : `Logged ${fmtVal(unit, value)} · PB is ${fmtVal(unit, r.previous.value)}`);
  return r;
}

// ---------- Voice notes ----------
let rec = null;
const baseCloseModal = closeModal;
// eslint-disable-next-line no-global-assign
closeModal = function () { stopRecording(true); stopFoodMic(); baseCloseModal(); };

function recorderHTML() {
  const canRecord = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  return `${canRecord ? `<div class="recorder"><button class="rec-btn" id="rec-btn" data-act="rec" aria-label="Record voice note"><span class="rec-dot"></span></button>
      <div><div id="rec-status">Tap to record</div><div class="small muted" id="rec-time">We'll transcribe as you talk</div></div></div>
      <audio id="rec-preview" controls hidden></audio>` : '<p class="small muted">Voice recording isn\'t supported in this browser — type your note instead.</p>'}
    <textarea id="vn-text" rows="3" placeholder="Your words appear here as you speak — or just type."></textarea>`;
}
function voiceCardHTML(w) {
  return `<section class="card voice-card" style="margin-top:14px">
    <h3>Notes to your coach</h3>
    ${w.voiceNotes.length ? w.voiceNotes.map((n) => `<div class="vn"><span class="vn-ic">${ICONS.mic}</span><div><div class="small muted">${timeAgo(n.createdAt)}${n.hasAudio ? ' · voice' : ''}</div><p>${esc(n.transcript || 'Voice note')}</p></div></div>`).join('')
      : '<p class="muted small" style="margin:4px 0 0">How did it feel? Send a quick voice note.</p>'}
    ${recorderHTML()}
    <button class="btn primary block" data-act="sendVoice" data-id="${w.id}">Send to coach</button>
  </section>`;
}

actions.rec = async () => {
  if (rec?.mr?.state === 'recording') return stopRecording();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { throw new Error('Microphone access was blocked. Allow it in your browser settings.'); }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  const r = { mr, chunks, blob: null, started: Date.now(), stream };
  rec = r;
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (r.discard) return;
    r.blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
    const a = $('#rec-preview');
    if (a) { a.src = URL.createObjectURL(r.blob); a.hidden = false; }
  };
  mr.start(250);

  // Live speech-to-text (Chrome, Edge, Safari). Text stays editable.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const sr = new SR();
    sr.continuous = true; sr.interimResults = true; sr.lang = navigator.language || 'en-AU';
    const ta = $('#vn-text');
    let finalText = ta.value ? ta.value.trim() + ' ' : '';
    sr.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript.trim() + ' ';
        else interim += e.results[i][0].transcript;
      }
      if (ta.isConnected) ta.value = (finalText + interim).trim();
    };
    sr.onerror = () => {};
    try { sr.start(); r.sr = sr; } catch {}
  }
  $('#rec-btn').classList.add('on');
  $('#rec-status').textContent = 'Recording — tap to stop';
  r.timer = setInterval(() => {
    const s = Math.floor((Date.now() - r.started) / 1000);
    const t = $('#rec-time');
    if (t) t.textContent = fmtTime(s);
    if (s >= 300) stopRecording(); // 5 min cap
  }, 500);
};

function stopRecording(discard = false) {
  if (!rec || rec.mr.state !== 'recording') { if (discard) rec = null; return; }
  rec.discard = discard;
  rec.mr.stop();
  try { rec.sr?.stop(); } catch {}
  clearInterval(rec.timer);
  if (discard) { rec = null; return; }
  $('#rec-btn')?.classList.remove('on');
  if ($('#rec-status')) $('#rec-status').textContent = 'Recorded — check the text, then send';
}

actions.sendVoice = async (el) => {
  if (rec?.mr?.state === 'recording') { stopRecording(); await new Promise((r) => setTimeout(r, 400)); }
  const text = $('#vn-text').value.trim();
  if (!rec?.blob && !text) throw new Error('Record a voice note or type a message first.');
  const fd = new FormData();
  if (rec?.blob) fd.append('audio', rec.blob, `note.${/mp4|aac/.test(rec.blob.type) ? 'm4a' : 'webm'}`);
  fd.append('transcript', text);
  el.disabled = true; el.textContent = 'Sending…';
  try {
    await api(`/api/workouts/${el.dataset.id}/voice`, { method: 'POST', body: fd });
    rec = null;
    if ($('#overlay')) { baseCloseModal(); state.finish = null; }
    await refresh();
    toast('Sent to your coach 🎙️');
  } finally { if (el.isConnected) { el.disabled = false; el.textContent = 'Send to coach'; } }
};

// ---------- Progress (PBs) ----------
async function viewProgress(v) {
  v.innerHTML = '<div class="loading">Loading your progress…</div>';
  const [{ events }] = await Promise.all([api('/api/pbs'), state.summary ? null : loadSummary()]);
  const s = state.summary;
  const groups = [...new Set(events.map((e) => e.group))];
  const recent = (d) => d && (Date.now() - parseYmd(d)) / 864e5 <= 14;
  const totalPbs = events.filter((e) => e.best).length;
  v.innerHTML = `
    <div class="page-title"><h1>Progress</h1><p class="muted" style="margin:4px 0 0">Your benchmarks, like segments — beat your best.</p></div>
    <div class="statrow">
      <div class="card stat"><b class="num">${s?.totalSessions ?? '—'}</b><span>sessions</span></div>
      <div class="card stat"><b class="num">${s?.weekStreak ?? '—'}</b><span>week streak</span></div>
      <div class="card stat"><b class="num">${totalPbs}</b><span>benchmarks set</span></div>
    </div>
    <form class="card form pb-log" data-form="logPb">
      <h3 style="margin-bottom:14px">Log an effort</h3>
      <div class="row3">
        <label>Effort<select name="event">${events.map((e) => `<option value="${e.key}">${esc(e.name)}</option>`).join('')}</select></label>
        <label>Result<input name="value" required placeholder="mm:ss or kg"></label>
        <label>Date<input name="date" type="date" value="${todayYmd()}"></label>
      </div>
      <button class="btn primary block" type="submit">Save effort</button>
    </form>
    ${groups.map((g) => `<div class="group-title">${esc(g)}</div><div class="pb-grid">${events.filter((e) => e.group === g).map((e) => `
      <button class="pb" data-act="togglePb" data-key="${e.key}">
        ${e.best && recent(e.best.date) ? '<span class="chip lime new">New PB</span>' : ''}
        <div class="pb-name">${esc(e.name)}</div>
        <div class="pb-val ${e.best ? '' : 'none'}">${e.best ? fmtVal(e.unit, e.best.value) : '—'}</div>
        <div class="small muted">${e.best ? `${fmtDate(e.best.date)} · ${e.attempts} effort${e.attempts === 1 ? '' : 's'}` : 'No efforts yet'}</div>
        ${sparkline(e.history.map((h) => h.value), e.unit === 'time')}
        ${state.openPb === e.key && e.history.length ? `<div class="hist">${[...e.history].reverse().map((h) => `<div><span>${fmtDate(h.date)}</span><b>${fmtVal(e.unit, h.value)}</b></div>`).join('')}</div>` : ''}
      </button>`).join('')}</div>`).join('')}`;
  const sel = $('select[name=event]', v);
  const inp = $('input[name=value]', v);
  sel.onchange = () => { inp.placeholder = evUnit(sel.value) === 'time' ? 'mm:ss' : 'kg'; };
  sel.onchange();
}
actions.togglePb = (el) => { state.openPb = state.openPb === el.dataset.key ? null : el.dataset.key; viewProgress($('#view')); };
forms.logPb = async (f) => {
  await logResult(f.elements.event.value, f.elements.value.value, f.elements.date.value);
  await loadSummary();
  await viewProgress($('#view'));
};

// ---------- Leaderboard ----------
async function viewBoard(v) {
  const evs = state.config.pbEvents;
  v.innerHTML = `<div class="page-title" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
      <div><h1>Leaderboard</h1><p class="muted" style="margin:4px 0 0">Best effort per athlete.</p></div>
      <div class="seg"><button class="${state.lbPeriod === 'all' ? 'on' : ''}" data-act="lbPeriod" data-p="all">All time</button><button class="${state.lbPeriod === 'month' ? 'on' : ''}" data-act="lbPeriod" data-p="month">30 days</button></div></div>
    <div class="chips-scroll">${Object.entries(evs).map(([k, e]) => `<button class="${k === state.lbEvent ? 'on' : ''}" data-act="lbEvent" data-ev="${k}">${esc(e.name)}</button>`).join('')}</div>
    <div id="lb"><div class="loading">Loading…</div></div>`;
  $('.chips-scroll button.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  await drawBoard();
}
actions.lbEvent = (el) => { state.lbEvent = el.dataset.ev; $$('.chips-scroll button').forEach((b) => b.classList.toggle('on', b === el)); drawBoard(); };
actions.lbPeriod = (el) => { state.lbPeriod = el.dataset.p; $$('.seg button').forEach((b) => b.classList.toggle('on', b === el)); drawBoard(); };
async function drawBoard() {
  const { rows } = await api(`/api/leaderboard/${state.lbEvent}?period=${state.lbPeriod}`);
  const unit = evUnit(state.lbEvent);
  const box = $('#lb');
  if (!rows.length) { box.innerHTML = '<div class="empty card">No efforts logged yet. Be the first on the board.</div>'; return; }
  const top = rows.length >= 3 ? rows.slice(0, 3) : [];
  const rest = rows.length >= 3 ? rows.slice(3) : rows;
  const pod = (r) => `<div class="pod p${r.rank} ${r.me ? 'me' : ''}"><span class="medal m${r.rank}">${r.rank}</span>
    <div class="p-val">${fmtVal(unit, r.value)}</div><div class="p-name">${esc(r.name)}${r.me ? ' (you)' : ''}</div></div>`;
  box.innerHTML = `${top.length ? `<div class="podium">${pod(top[1])}${pod(top[0])}${pod(top[2])}</div>` : ''}
    ${rest.length ? `<div class="card" style="padding:4px 10px"><table class="lb">${rest.map((r) => `
      <tr class="${r.me ? 'me' : ''}"><td class="rk">${r.rank}</td>
      <td><strong>${esc(r.name)}</strong>${r.me ? ' <span class="chip accent">You</span>' : ''}<div class="small muted">${fmtDate(r.date)}</div></td>
      <td class="val">${fmtVal(unit, r.value)}</td></tr>`).join('')}</table></div>` : ''}`;
}

// ---------- Profile ----------
function viewProfile(v) {
  const u = state.user;
  const p = planOf(u.plan);
  const status = { active: ['good', 'Active'], cancelled: ['warn', 'Cancels at period end'], past_due: ['bad', 'Payment failed'] }[u.subStatus] || ['', u.subStatus];
  const theme = savedTheme();
  v.innerHTML = `
    <div class="profile-head"><span class="avatar lg">${initials(u.name)}</span><div><h2>${esc(u.name)}</h2><div class="muted small">${esc(u.email)}</div></div></div>
    <div class="stack">
      <section class="card">
        <h3>Membership</h3>
        <dl class="kv" style="margin-top:14px">
          <dt>Plan</dt><dd>${p ? `${esc(p.tierName)} · ${esc(p.name)}<div class="small muted" style="font-weight:500">${money(p.amount, p.currency)} per ${p.interval}</div>` : '—'}</dd>
          <dt>Status</dt><dd><span class="chip ${status[0]}">${esc(status[1])}</span></dd>
          <dt>${u.subStatus === 'cancelled' ? 'Access until' : 'Renews'}</dt><dd>${fmtDate(u.subRenews, { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
          <dt>Member since</dt><dd>${fmtDate(u.createdAt, { month: 'long', year: 'numeric' })}</dd>
        </dl>
        <div class="btn-row">
          <button class="btn" data-act="changePlan">Change plan</button>
          ${state.config.stripe && u.hasBilling ? '<button class="btn" data-act="portal">Manage billing</button>'
            : u.subStatus === 'active' ? '<button class="btn danger" data-act="cancelSub">Cancel membership</button>' : ''}
        </div>
      </section>
      ${u.nutrition ? `<form class="card form" data-form="targets">
        <h3>Nutrition targets</h3><p class="muted small" style="margin:4px 0 14px">Your coach may set these for you.</p>
        <div class="row2"><label>Calories per day<input type="number" name="calorieTarget" min="800" max="8000" value="${u.calorieTarget || ''}" placeholder="e.g. 2200"></label>
          <label>Protein (g) per day<input type="number" name="proteinTarget" min="20" max="500" value="${u.proteinTarget || ''}" placeholder="e.g. 140"></label></div>
        <button class="btn primary" type="submit">Save targets</button>
      </form>` : `<section class="card upsell"><div><h3>Add nutrition coaching</h3><p class="muted small" style="margin:4px 0 0">Photo or voice food logging with calories worked out for you.</p></div><button class="btn dark sm" data-act="upgradeNutrition">See plans</button></section>`}
      <form class="card form" data-form="race">
        <h3>Race goal</h3><p class="muted small" style="margin:4px 0 14px">Add your next event to get a countdown on your Today screen.</p>
        <div class="row2"><label>Event<input name="raceName" value="${esc(u.raceName)}" placeholder="e.g. HYROX Sydney"></label>
          <label>Date<input type="date" name="raceDate" value="${u.raceDate || ''}"></label></div>
        <button class="btn primary" type="submit">Save goal</button>
      </form>
      <section class="card">
        <h3 style="margin-bottom:12px">Appearance</h3>
        <div class="seg">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button class="${theme === k ? 'on' : ''}" data-act="theme" data-t="${k}">${l}</button>`).join('')}</div>
      </section>
      <button class="btn ghost block" data-act="logout">Log out</button>
    </div>`;
}
forms.race = async (f) => {
  state.user = (await api('/api/me', { method: 'PATCH', body: { raceName: f.elements.raceName.value, raceDate: f.elements.raceDate.value } })).user;
  toast('Race goal saved');
};
actions.theme = (el) => {
  try { localStorage.setItem('fpw-theme', el.dataset.t); } catch {}
  applyTheme(el.dataset.t);
  $$('.seg button').forEach((b) => b.classList.toggle('on', b === el));
};
forms.targets = async (f) => {
  state.user = (await api('/api/me', { method: 'PATCH', body: { calorieTarget: f.elements.calorieTarget.value, proteinTarget: f.elements.proteinTarget.value } })).user;
  state.nut = null; toast('Targets saved');
};
function setPlanFromUser() {
  const cur = state.user.plan || 'monthly';
  state.planBase = cur.replace('_nutrition', '');
  state.tier = cur.endsWith('_nutrition') ? 'nutrition' : 'fitness';
}
actions.changePlan = () => { state.changingPlan = true; setPlanFromUser(); render(); };
actions.upgradeNutrition = () => { state.changingPlan = true; setPlanFromUser(); state.tier = 'nutrition'; render(); window.scrollTo(0, 0); };
actions.portal = async () => { const r = await api('/api/billing/portal', { method: 'POST' }); if (r.url) location.href = r.url; };
actions.cancelSub = async () => {
  if (!confirm('Cancel your membership? You keep access until the end of the current period.')) return;
  state.user = (await api('/api/billing/cancel', { method: 'POST' })).user;
  viewProfile($('#view')); toast('Membership cancelled');
};

// ---------- Strength progression ----------
function strengthHTML(st, wid, future, dark = false) {
  const tgt = st.target;
  const pctTxt = st.pct ? `${st.pct > 0 ? '+' : ''}${st.pct}% this week` : 'Baseline week';
  const line = st.base && tgt != null
    ? `Week ${st.base.week}: ${st.base.sets} × ${st.base.reps} @ ${kg(st.base.weight)} → ${st.pctApplied > 0 ? '+' : ''}${st.pctApplied}% = <b>${kg(tgt)}</b>`
    : `No weight logged yet — pick one you can lift for ${st.sets} × ${st.reps} with 1–2 reps in reserve. Next week's weight is calculated from it.`;
  const log = st.log;
  return `<div class="strength ${dark ? 'dark' : ''}">
    <div class="st-top"><span class="chip ${dark ? 'lime' : 'accent'}">${esc(st.lift)} · Week ${st.week} of ${st.totalWeeks}</span><span class="small st-pct">${pctTxt}</span></div>
    <div class="st-target"><span class="num">${st.sets} × ${st.reps}</span>${tgt != null ? `<span class="at">@</span><span class="num">${kg(tgt)}</span>` : '<span class="at">@ your weight</span>'}</div>
    <div class="st-line">${line}</div>
    ${log ? `<div class="st-done"><span>✓ Logged ${log.sets} × ${log.reps} @ ${kg(log.weight)}</span>${future ? '' : '<button class="btn sm ghost" type="button" data-act="editLift">Edit</button>'}</div>` : ''}
    ${future ? '' : `<form class="st-form ${log ? 'hidden' : ''}" data-form="logLift" data-wid="${wid}" data-pid="${st.programId}">
      <label>Sets<input name="sets" type="number" inputmode="numeric" min="1" max="30" value="${log?.sets ?? st.sets}"></label>
      <label>Reps<input name="reps" type="number" inputmode="numeric" min="1" max="100" value="${log?.reps ?? st.reps}"></label>
      <label>Weight kg<input name="weight" type="number" inputmode="decimal" step="0.5" min="0.5" required value="${log?.weight ?? tgt ?? ''}" placeholder="kg"></label>
      <button class="btn ${dark ? 'lime' : 'primary'}" type="submit">Save</button></form>`}
  </div>`;
}
actions.editLift = (el) => el.closest('.strength').querySelector('.st-form')?.classList.toggle('hidden');
forms.logLift = async (f) => {
  const e = f.elements;
  const r = await api('/api/lifts', { method: 'POST', body: { workoutId: f.dataset.wid, programId: f.dataset.pid,
    sets: e.sets.value, reps: e.reps.value, weight: e.weight.value } });
  const n = r.next;
  toast(n && n.target != null ? `Saved. Next week: ${n.sets} × ${n.reps} @ ${kg(n.target)}` : 'Lift saved 💪');
  await refresh();
};

// ---------- Nutrition ----------
function nutritionCardHTML() {
  if (!state.user.nutrition) {
    return `<section class="card upsell" style="margin-top:14px"><div><span class="chip lime">Nutrition</span>
      <h3 style="margin-top:10px">Fuel your training</h3><p class="muted small" style="margin:4px 0 0">Snap a photo or voice-note your meals and get calories and macros worked out for you.</p></div>
      <button class="btn dark sm" data-act="upgradeNutrition">See plans</button></section>`;
  }
  const n = state.nutToday;
  if (!n) return '';
  const k = n.totals.kcal, t = n.target.kcal;
  return `<section class="card nut-card" style="margin-top:14px">
    <div class="sec-head" style="margin:0 0 12px"><h3>Nutrition today</h3><button class="btn sm" data-act="tab" data-tab="nutrition">Log a meal</button></div>
    <div class="nut-line"><b class="num">${fmtNum(k)}</b><span>${t ? `of ${fmtNum(t)} kcal` : 'kcal'}</span>
      <span class="muted small" style="margin-left:auto">P ${Math.round(n.totals.protein)}g · C ${Math.round(n.totals.carbs)}g · F ${Math.round(n.totals.fat)}g</span></div>
    ${t ? `<div class="race-bar" style="height:8px"><i style="width:${Math.min(100, (k / t) * 100)}%;${k > t ? 'background:var(--warn)' : ''}"></i></div>` : ''}
  </section>`;
}

async function viewNutrition(v) {
  state.nutDate = state.nutDate || todayYmd();
  if (!state.nut || state.nut.date !== state.nutDate) {
    v.innerHTML = '<div class="loading">Loading your food diary…</div>';
    state.nut = await api(`/api/nutrition?date=${state.nutDate}`);
  }
  drawNutrition();
}
async function reloadNutrition() {
  state.nut = await api(`/api/nutrition?date=${state.nutDate || todayYmd()}`);
  if (state.nut.date === state.nut.today) state.nutToday = state.nut;
  if (state.tab === 'nutrition') drawNutrition();
  else if (state.tab === 'today') drawToday();
}
function drawNutrition() {
  const n = state.nut;
  const t = n.totals, target = n.target.kcal, pTarget = n.target.protein;
  const C = 2 * Math.PI * 52;
  const pct = target ? Math.min(1, t.kcal / target) : 0;
  const left = target ? target - t.kcal : null;
  const isToday = n.date === n.today;
  const macro = (label, g, goal, color) => `<div class="macro"><div class="m-top"><span>${label}</span><b class="num">${Math.round(g)}${goal ? `<small>/${goal}g</small>` : 'g'}</b></div>
    <div class="m-bar"><i style="width:${goal ? Math.min(100, (g / goal) * 100) : Math.min(100, g / 3)}%;background:${color}"></i></div></div>`;
  const maxK = Math.max(target || 0, ...n.week.map((d) => d.kcal), 1);
  const byMeal = (m) => n.logs.filter((l) => l.meal === m);
  $('#view').innerHTML = `
    <div class="page-title" style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px">
      <div><h1>Nutrition</h1><p class="muted" style="margin:4px 0 0">${isToday ? 'Today' : fmtDate(n.date, { weekday: 'long', day: 'numeric', month: 'short' })}</p></div>
      <div class="wk-nav" style="display:flex;gap:6px"><button class="icon-btn" data-act="nutDay" data-d="-1" aria-label="Previous day">‹</button>
        <button class="icon-btn" data-act="nutDay" data-d="1" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button></div></div>
    <section class="card nut-summary">
      <div class="ring big"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="11"/>
        <circle cx="60" cy="60" r="52" fill="none" stroke="${left != null && left < 0 ? 'var(--warn)' : 'var(--brand)'}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
        <div class="lbl"><div><b class="num">${fmtNum(t.kcal)}</b><span>${target ? `of ${fmtNum(target)} kcal` : 'kcal eaten'}</span></div></div></div>
      <div class="nut-side">
        <div class="left-kcal">${left == null ? '<span class="muted small">Set a daily target in Profile</span>' : left >= 0 ? `<b class="num">${fmtNum(left)}</b> kcal left` : `<b class="num" style="color:var(--warn)">${fmtNum(-left)}</b> kcal over`}</div>
        ${macro('Protein', t.protein, pTarget, 'var(--brand)')}
        ${macro('Carbs', t.carbs, null, '#e0a33a')}
        ${macro('Fat', t.fat, null, '#7a8cf0')}
      </div>
    </section>
    <button class="btn primary block lg" style="margin:14px 0 4px" data-act="addFood">${ICONS.camera} Log a meal</button>
    ${n.meals.map((m) => {
      const logs = byMeal(m);
      const kcal = logs.reduce((a, l) => a + l.totals.kcal, 0);
      return `<div class="sec-head"><h3>${MEAL_LABEL[m]}</h3><span class="muted small">${kcal ? `${fmtNum(kcal)} kcal · ` : ''}<a href="#" data-act="addFood" data-meal="${m}">+ Add</a></span></div>
        ${logs.length ? `<div class="card food-list">${logs.map(foodRowHTML).join('')}</div>` : ''}`;
    }).join('')}
    <section class="card" style="margin-top:22px">
      <div class="sec-head" style="margin:0 0 12px"><h3>Last 7 days</h3>${target ? `<span class="muted small">Target ${fmtNum(target)} kcal</span>` : ''}</div>
      <div class="kbars">${target ? `<div class="kline" style="bottom:${(target / maxK) * 100}%"></div>` : ''}${n.week.map((d) => `
        <div class="kbar ${d.date === n.date ? 'on' : ''}" title="${fmtNum(d.kcal)} kcal"><i style="height:${(d.kcal / maxK) * 100}%"></i><span>${dayName(d.date).slice(0, 2)}</span></div>`).join('')}</div>
    </section>`;
}
function foodRowHTML(l) {
  const names = l.items.map((i) => i.name).join(', ');
  return `<div class="food-row">
    ${l.photoUrl ? `<img class="food-thumb" src="${l.photoUrl}" alt="">` : `<span class="food-thumb ic">${l.source === 'voice' ? ICONS.micLg : ICONS.food}</span>`}
    <div class="food-body"><div class="food-name">${esc(names)}</div>
      <div class="small muted">P ${Math.round(l.totals.protein)}g · C ${Math.round(l.totals.carbs)}g · F ${Math.round(l.totals.fat)}g</div></div>
    <div class="food-kcal num">${fmtNum(l.totals.kcal)}<small>kcal</small></div>
    <button class="icon-btn sm-x" data-act="delFood" data-id="${l.id}" aria-label="Delete">×</button>
  </div>`;
}
actions.nutDay = async (el) => {
  const d = addDays(state.nutDate || todayYmd(), Number(el.dataset.d));
  if (d > todayYmd()) return;
  state.nutDate = d;
  await viewNutrition($('#view'));
};
actions.delFood = async (el) => {
  if (!confirm('Delete this entry?')) return;
  await api(`/api/nutrition/logs/${el.dataset.id}`, { method: 'DELETE' });
  await reloadNutrition();
};

// Add-food sheet: photo, voice or type → estimate → review → save
const defaultMeal = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : 'dinner'; };
actions.addFood = (el) => {
  state.food = { meal: el.dataset.meal || defaultMeal(), text: '', source: 'text', photoBlob: null, photoUrl: null, est: null, photoId: null };
  drawFoodSheet();
};
function syncFoodText() { const t = $('#food-text'); if (t && state.food) state.food.text = t.value; }
function drawFoodSheet() {
  const f = state.food;
  const canTalk = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const chips = `<div class="meal-chips">${Object.keys(MEAL_LABEL).map((m) => `<button class="${m === f.meal ? 'on' : ''}" data-act="foodMeal" data-m="${m}">${MEAL_LABEL[m].replace('Snacks', 'Snack')}</button>`).join('')}</div>`;
  if (!f.est) {
    openModal(`<h2 style="margin-bottom:14px">Log a meal</h2>${chips}
      <div class="capture">
        <label class="cap-btn">${ICONS.camera}<span>Photo</span><input type="file" accept="image/*" id="food-photo" hidden></label>
        ${canTalk ? `<button class="cap-btn" id="food-mic" data-act="foodMic">${ICONS.micLg}<span>Say it</span></button>` : ''}
        <button class="cap-btn" data-act="foodType">${ICONS.type}<span>Type it</span></button>
      </div>
      ${f.photoUrl ? `<div class="food-photo"><img src="${f.photoUrl}" alt="Meal photo"><button class="icon-btn" data-act="foodNoPhoto" aria-label="Remove photo">×</button></div>` : ''}
      <textarea id="food-text" rows="3" placeholder="e.g. 2 slices of brown bread, butter, 150g chicken with mayo">${esc(f.text)}</textarea>
      <p class="small muted" style="margin:0 0 14px">${state.config.aiFood
        ? 'Snap it, say it or type it — calories and macros are worked out for you.'
        : 'Say it or type it — add amounts like “150g” or “2 slices” for a better estimate. Photos are saved with the meal.'}</p>
      <button class="btn primary block lg" data-act="foodEstimate">Calculate calories</button>`, { sheet: true });
    $('#food-photo').onchange = (e) => onFoodPhoto(e.target.files?.[0]);
    return;
  }
  const items = f.est.items;
  openModal(`<h2 style="margin-bottom:6px">Check & save</h2>
    <p class="small muted" style="margin:0 0 14px">${esc(f.est.notes || '')} Tap a number to adjust it.</p>
    ${chips}
    ${f.photoUrl ? `<img class="food-hero" src="${f.photoUrl}" alt="">` : ''}
    <div class="est-list">${items.map((i, idx) => `
      <div class="est-row ${i.unknown ? 'unknown' : ''}" data-i="${idx}">
        <div class="est-name"><input data-k="name" value="${esc(i.name)}" aria-label="Food"><span class="small muted">${[i.quantity, i.unknown ? 'not recognised — enter calories' : ''].filter(Boolean).map(esc).join(' · ')}</span></div>
        <label class="est-kcal"><input data-k="kcal" type="number" inputmode="numeric" min="0" value="${i.kcal ?? ''}" placeholder="kcal"><span>kcal</span></label>
        <button class="icon-btn sm-x" data-act="foodDropItem" data-i="${idx}" aria-label="Remove">×</button>
      </div>`).join('') || '<p class="muted small">Nothing recognised — go back and add more detail.</p>'}</div>
    <button class="btn sm ghost" data-act="foodAddItem" style="margin:6px 0 10px">+ Add item</button>
    <div class="est-total"><span>Total</span><b class="num" id="est-total"></b></div>
    <button class="btn primary block lg" data-act="foodSave">Save to ${MEAL_LABEL[f.meal].replace('Snacks', 'snacks').toLowerCase()}</button>
    <button class="btn ghost block" style="margin-top:6px" data-act="foodBack">Back</button>`, { sheet: true });
  updateEstTotal();
  $('.est-list')?.addEventListener('input', () => { readEstItems(); updateEstTotal(); });
}
function readEstItems() {
  for (const row of $$('.est-row')) {
    const it = state.food.est.items[Number(row.dataset.i)];
    it.name = $('[data-k=name]', row).value;
    const v = $('[data-k=kcal]', row).value;
    const newK = v === '' ? null : Math.max(0, Math.round(Number(v)));
    if (it.kcal && newK != null && newK !== it.kcal) { const r = newK / it.kcal; it.protein *= r; it.carbs *= r; it.fat *= r; }
    it.kcal = newK;
    if (newK != null) it.unknown = false;
  }
}
function updateEstTotal() {
  const k = state.food.est.items.reduce((a, i) => a + (Number(i.kcal) || 0), 0);
  const el = $('#est-total');
  if (el) el.innerHTML = `${fmtNum(k)} kcal <small class="muted">≈ ${fmtNum(Math.round(k * 4.184))} kJ</small>`;
}
actions.foodMeal = (el) => {
  if (state.food.est) readEstItems(); else syncFoodText();
  state.food.meal = el.dataset.m; drawFoodSheet();
};
actions.foodType = () => { const t = $('#food-text'); t.focus(); };
actions.foodNoPhoto = () => { syncFoodText(); Object.assign(state.food, { photoBlob: null, photoUrl: null, source: 'text' }); drawFoodSheet(); };
actions.foodBack = () => { readEstItems(); state.food.est = null; drawFoodSheet(); };
actions.foodDropItem = (el) => { readEstItems(); state.food.est.items.splice(Number(el.dataset.i), 1); drawFoodSheet(); };
actions.foodAddItem = () => { readEstItems(); state.food.est.items.push({ name: '', quantity: '', kcal: null, protein: 0, carbs: 0, fat: 0, unknown: true }); drawFoodSheet(); $$('.est-row [data-k=name]').pop()?.focus(); };

async function resizeImage(file, max = 1280) {
  try {
    const img = await createImageBitmap(file);
    const sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', 0.82));
  } catch { return file; }
}
async function onFoodPhoto(file) {
  if (!file) return;
  syncFoodText();
  const blob = await resizeImage(file);
  Object.assign(state.food, { photoBlob: blob, photoUrl: URL.createObjectURL(blob), source: 'photo' });
  drawFoodSheet();
  if (state.config.aiFood) actions.foodEstimate($('[data-act=foodEstimate]'));
  else $('#food-text')?.focus();
}

let foodSR = null;
function stopFoodMic() { if (foodSR) { try { foodSR.stop(); } catch {} foodSR = null; } }
actions.foodMic = (el) => {
  if (foodSR) { stopFoodMic(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const sr = new SR();
  sr.continuous = true; sr.interimResults = true; sr.lang = navigator.language || 'en-AU';
  const ta = $('#food-text');
  let finalText = ta.value ? ta.value.trim() + ' ' : '';
  sr.onresult = (e) => {
    state.food.spoken = true;
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript.trim() + ' ';
      else interim += e.results[i][0].transcript;
    }
    if (ta.isConnected) ta.value = (finalText + interim).trim();
  };
  sr.onend = () => {
    $('#food-mic')?.classList.remove('on');
    const spoke = foodSR === sr;
    foodSR = null;
    if (spoke && ta.isConnected && ta.value.trim()) { state.food.source = state.food.photoBlob ? 'photo' : 'voice'; actions.foodEstimate($('[data-act=foodEstimate]')); }
  };
  sr.onerror = (e) => { if (e.error === 'not-allowed') toast('Microphone access was blocked. Allow it in your browser settings.'); };
  try { sr.start(); foodSR = sr; el.classList.add('on'); el.querySelector('span').textContent = 'Listening… tap to stop'; } catch {}
};
actions.foodEstimate = async (el) => {
  stopFoodMic();
  syncFoodText();
  const f = state.food;
  if (!f.text.trim() && !f.photoBlob) throw new Error('Add a photo, say it or type what you ate.');
  if (el) { el.disabled = true; el.textContent = 'Calculating…'; }
  try {
    const fd = new FormData();
    fd.append('text', f.text);
    if (f.photoBlob) fd.append('photo', f.photoBlob, 'meal.jpg');
    const r = await api('/api/nutrition/estimate', { method: 'POST', body: fd });
    if (r.mealGuess) f.meal = r.mealGuess;
    if (!f.photoBlob) f.source = f.spoken ? 'voice' : 'text';
    f.photoId = r.photo;
    f.est = r;
    drawFoodSheet();
  } finally { if (el?.isConnected) { el.disabled = false; el.textContent = 'Calculate calories'; } }
};
actions.foodSave = async (el) => {
  readEstItems();
  const f = state.food;
  const items = f.est.items.filter((i) => i.name.trim() || i.kcal);
  const missing = items.find((i) => i.kcal == null);
  if (missing) throw new Error(`Add calories for “${missing.name || 'item'}” or remove it.`);
  if (!items.length) throw new Error('Add at least one food.');
  el.disabled = true;
  try {
    const r = await api('/api/nutrition/logs', { method: 'POST', body: { date: state.nutDate || todayYmd(), meal: f.meal,
      description: f.text, source: f.source, photo: f.photoId, items } });
    baseCloseModal(); state.food = null;
    toast(`Added to ${MEAL_LABEL[r.log.meal].toLowerCase()} · ${fmtNum(r.log.totals.kcal)} kcal`);
    await reloadNutrition();
  } finally { if (el.isConnected) el.disabled = false; }
};

boot().catch((e) => { $('#app').innerHTML = `<div class="empty">Couldn't load the app: ${esc(e.message)}</div>`; });
