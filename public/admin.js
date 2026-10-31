// Coach HQ — admin / CRM
const S = { config: null, view: 'dashboard', weekStart: null, members: [], memberFilter: 'all', memberQuery: '', openAlerts: 0, templates: null, editing: null, progTab: 'week', programs: [], standardWeeks: [], prog: null };
const planName = (pid) => { const p = S.config?.plans.find((x) => x.id === pid); return p ? `${p.tierName} · ${p.name}` : pid || '—'; };
const kg = (n) => `${+n} kg`;
const MOOD_COLORS = { great: 'var(--good)', good: '#7cb342', ok: 'var(--faint)', tough: 'var(--warn)', concern: 'var(--bad)' };
const statusChip = (m) => {
  if (!m.plan || m.subStatus === 'none') return '<span class="chip">Lead</span>';
  if (!m.active) return '<span class="chip bad">Expired</span>';
  return { active: '<span class="chip good">Active</span>', cancelled: '<span class="chip warn">Cancelling</span>', past_due: '<span class="chip bad">Past due</span>', paused: '<span class="chip">Paused</span>' }[m.subStatus] || `<span class="chip">${esc(m.subStatus)}</span>`;
};
const moodChip = (s) => (s ? `<span class="mood ${s.mood || 'unknown'}">${esc(s.mood || 'unknown')}${s.score ? ` · ${s.score}/5` : ''}</span>` : '');
const moodFromAvg = (a) => (a == null ? null : a >= 4.5 ? 'great' : a >= 3.5 ? 'good' : a >= 2.5 ? 'ok' : a >= 1.5 ? 'tough' : 'concern');

async function boot() {
  S.config = await api('/api/config');
  try { S.me = await api('/api/admin/me'); renderApp(); } catch { renderLogin(); }
}

function renderLogin() {
  $('#root').innerHTML = `<div class="login-wrap"><form class="card form" data-form="login">
    ${brandHTML(S.config.appName, 'Coach HQ')}
    <h2 style="margin-bottom:6px">Coach HQ</h2><p class="muted small" style="margin:0 0 18px">Programming, members, feedback & payments.</p>
    <label>Admin password<input type="password" name="password" required autofocus autocomplete="current-password"></label>
    <button class="btn primary block" type="submit">Enter</button>
    ${S.config.demoHints ? '<p class="muted small center" style="margin:12px 0 0">Dev default: coach123 — set ADMIN_PASSWORD in .env</p>' : ''}
    <p class="small center" style="margin:12px 0 0"><a href="/">← Athlete app</a></p></form></div>`;
}
forms.login = async (f) => {
  await api('/api/admin/login', { method: 'POST', body: { password: f.elements.password.value } });
  S.me = await api('/api/admin/me');
  renderApp();
};

const NAV = [['dashboard', 'Dashboard', 'dash'], ['members', 'Members', 'users'], ['programming', 'Programming', 'cal'], ['payments', 'Payments', 'card']];
function renderApp() {
  $('#root').innerHTML = `<div class="admin">
    <aside class="side">${brandHTML(S.config.appName, 'Coach HQ')}
      ${NAV.map(([k, l, i]) => `<button class="nav ${S.view === k ? 'on' : ''}" data-act="nav" data-view="${k}">${ICONS[i]}${l}${k === 'dashboard' && S.openAlerts ? `<span class="count">${S.openAlerts}</span>` : ''}</button>`).join('')}
      <div class="spacer"></div>
      <a class="nav" href="/" target="_blank">${ICONS.train}Athlete app ↗</a>
      <button class="nav" data-act="logout">${ICONS.out}Log out</button>
    </aside><main class="main" id="view"></main></div>`;
  show();
}
actions.nav = (el) => { S.view = el.dataset.view; renderApp(); };
actions.logout = async () => { await api('/api/admin/logout', { method: 'POST' }); renderLogin(); };

async function show() {
  const v = $('#view');
  v.innerHTML = '<div class="loading">Loading…</div>';
  try {
    if (S.view === 'dashboard') await viewDashboard(v);
    else if (S.view === 'members') await viewMembers(v);
    else if (S.view === 'programming') await viewProgramming(v);
    else await viewPayments(v);
  } catch (e) {
    if (e.status === 401) return renderLogin();
    v.innerHTML = `<div class="empty card">${esc(e.message)}</div>`;
  }
}

// ---------- Dashboard ----------
async function viewDashboard(v) {
  const d = await api('/api/admin/dashboard');
  const k = d.kpis;
  if (S.openAlerts !== k.openAlerts) { S.openAlerts = k.openAlerts; const c = $('.nav[data-view=dashboard]'); if (c) c.innerHTML = `${ICONS.dash}Dashboard${k.openAlerts ? `<span class="count">${k.openAlerts}</span>` : ''}`; }
  const totalMood = Object.values(d.moods).reduce((a, b) => a + b, 0);
  v.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${fmtDate(ymd(new Date()), { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Dashboard</h1></div>
      <button class="btn sm" data-act="runCheck">Run missed-workout check</button></div>
    <div class="kpis">
      <div class="card kpi"><div class="eyebrow">Active members</div><div class="k-val">${k.activeMembers}</div><div class="k-sub">${k.leads} lead${k.leads === 1 ? '' : 's'} / lapsed</div></div>
      <div class="card kpi"><div class="eyebrow">Est. MRR</div><div class="k-val">${money(k.mrr, k.currency)}</div><div class="k-sub">monthly-equivalent revenue</div></div>
      <div class="card kpi"><div class="eyebrow">This week</div><div class="k-val">${k.compliance == null ? '—' : `${k.compliance}%`}</div><div class="k-sub">${k.completionsThisWeek} sessions completed</div></div>
      <div class="card kpi"><div class="eyebrow">Open alerts</div><div class="k-val" style="color:${k.openAlerts ? 'var(--bad)' : 'inherit'}">${k.openAlerts}</div><div class="k-sub">missed sessions & wellbeing</div></div>
    </div>
    <div class="grid2">
      <section class="card">
        <div class="section-title"><h3>Alerts</h3></div>
        ${d.alerts.length ? d.alerts.map((a) => `<div class="alert">
            <span class="al-ic ${a.type}">${{ missed: '!', wellbeing: '+', billing: '$' }[a.type] || '!'}</span>
            <div class="al-body"><div>${esc(a.message)}</div><div class="small muted">${{ missed: 'Missed workouts', wellbeing: 'Wellbeing', billing: 'Billing' }[a.type] || a.type} · ${timeAgo(a.createdAt)}</div>
              <div class="al-actions"><button class="btn sm" data-act="openMember" data-id="${a.userId}">View member</button><button class="btn sm ghost" data-act="resolve" data-id="${a.id}">Resolve</button></div></div></div>`).join('')
          : '<div class="empty" style="padding:24px">All clear — nobody needs chasing.</div>'}
        <div style="margin-top:18px"><div class="eyebrow">Squad mood · last 7 days</div>
          ${totalMood ? `<div class="moodbar">${Object.entries(d.moods).map(([m, n]) => (n ? `<span style="width:${(n / totalMood) * 100}%;background:${MOOD_COLORS[m]}" title="${m}: ${n}"></span>` : '')).join('')}</div>
            <div class="legend">${Object.entries(d.moods).map(([m, n]) => `<span><i style="background:${MOOD_COLORS[m]}"></i>${m} ${n}</span>`).join('')}</div>`
          : '<p class="muted small">No voice notes this week yet.</p>'}</div>
      </section>
      <section class="card">
        <div class="section-title"><h3>Athlete feedback</h3><span class="muted small">Summaries by ${S.me.llm ? 'Claude' : 'keyword analysis'}</span></div>
        ${d.feedback.length ? d.feedback.map(fbHTML).join('') : '<div class="empty" style="padding:24px">Voice notes from athletes will appear here.</div>'}
      </section>
    </div>`;
}
function fbHTML(f) {
  const s = f.summary || {};
  return `<div class="fb">
    <div class="fb-top">${moodChip(s)}<a href="#" data-act="openMember" data-id="${f.user.id}"><strong>${esc(f.user.name)}</strong></a>
      <span class="muted small">${f.workout ? `${esc(f.workout.title)} · ${fmtDate(f.workout.date, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}${f.rpe ? ` · RPE ${f.rpe}` : ''} · ${timeAgo(f.createdAt)}</span></div>
    <div class="fb-head">${esc(s.headline || '')}</div>
    <p>${esc(s.summary || '')} ${(s.flags || []).map((fl) => `<span class="chip ${fl === 'pb' ? 'good' : fl === 'injury' || fl === 'illness' ? 'bad' : 'warn'}">${esc(fl)}</span>`).join(' ')}</p>
    ${s.coachAction ? `<div class="action">→ ${esc(s.coachAction)}</div>` : ''}
    ${f.audioUrl ? `<audio controls preload="none" src="${f.audioUrl}"></audio>` : ''}
    ${f.transcript ? `<details><summary>Transcript</summary><p>${esc(f.transcript)}</p></details>` : ''}
  </div>`;
}
actions.runCheck = async () => { const r = await api('/api/admin/alerts/run', { method: 'POST' }); toast(r.created ? `${r.created} new alert(s)` : 'No new missed-workout alerts'); show(); };
actions.resolve = async (el) => { await api(`/api/admin/alerts/${el.dataset.id}/resolve`, { method: 'POST' }); toast('Alert resolved'); if ($('#overlay')) closeModal(); show(); };

// ---------- Members / CRM ----------
async function viewMembers(v) {
  S.members = (await api('/api/admin/members')).members;
  v.innerHTML = `<div class="page-head"><div><div class="eyebrow">CRM</div><h1>Members</h1></div><a class="btn sm" href="/api/admin/members.csv">Export CSV</a></div>
    <div class="toolbar"><input id="m-q" placeholder="Search name or email" value="${esc(S.memberQuery)}">
      <select id="m-f">${[['all', 'All'], ['active', 'Active'], ['risk', 'At risk (missed 2+)'], ['leads', 'Leads / lapsed']].map(([k, l]) => `<option value="${k}" ${S.memberFilter === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>Renews</th><th>Last session</th><th>14-day compliance</th><th>Missed streak</th><th>Mood</th><th>LTV</th></tr></thead><tbody id="m-body"></tbody></table></div>`;
  $('#m-q').oninput = (e) => { S.memberQuery = e.target.value; drawMembers(); };
  $('#m-f').onchange = (e) => { S.memberFilter = e.target.value; drawMembers(); };
  drawMembers();
}
function drawMembers() {
  const q = S.memberQuery.toLowerCase();
  const rows = S.members.filter((m) => (!q || m.name.toLowerCase().includes(q) || m.email.includes(q)) &&
    (S.memberFilter === 'all' || (S.memberFilter === 'active' && m.active) || (S.memberFilter === 'risk' && m.missedStreak >= 2) || (S.memberFilter === 'leads' && !m.active)));
  $('#m-body').innerHTML = rows.length ? rows.map((m) => `<tr data-act="openMember" data-id="${m.id}">
    <td><strong>${esc(m.name)}</strong>${m.openAlerts ? ' <span class="chip bad">alert</span>' : ''}<div class="sub">${esc(m.email)}</div></td>
    <td>${m.plan ? esc(planName(m.plan)) : '—'}</td><td>${statusChip(m)}</td>
    <td>${m.subRenews ? fmtDate(m.subRenews) : '—'}</td>
    <td>${m.lastWorkout ? fmtDate(m.lastWorkout, { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}</td>
    <td>${m.compliance == null ? '—' : `<span class="bar"><i style="width:${m.compliance}%;background:${m.compliance < 50 ? 'var(--bad)' : m.compliance < 80 ? 'var(--warn)' : 'var(--good)'}"></i></span>${m.compliance}%`}</td>
    <td><span class="streak ${m.missedStreak >= 2 ? 'hot' : ''}">${m.missedStreak}</span></td>
    <td>${m.mood == null ? '—' : `<span class="mood ${moodFromAvg(m.mood)}">${m.mood}</span>`}</td>
    <td>${money(m.ltv)}</td></tr>`).join('') : '<tr><td colspan="9" class="center muted" style="padding:28px">No members match.</td></tr>';
}

actions.openMember = async (el) => {
  const d = await api(`/api/admin/members/${el.dataset.id}`);
  const m = d.member;
  openModal(`
    <div class="modal-head"><div><div class="eyebrow">Member since ${fmtDate(m.createdAt, { month: 'long', year: 'numeric' })}</div><h2>${esc(m.name)}</h2>
      <div class="muted small"><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></div></div><button class="icon-btn" data-act="close">×</button></div>
    <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      <div class="card kpi"><div class="eyebrow">Sessions</div><div class="k-val" style="font-size:30px">${m.completions}</div></div>
      <div class="card kpi"><div class="eyebrow">Compliance</div><div class="k-val" style="font-size:30px">${m.compliance == null ? '—' : m.compliance + '%'}</div></div>
      <div class="card kpi"><div class="eyebrow">Missed streak</div><div class="k-val" style="font-size:30px;color:${m.missedStreak >= 2 ? 'var(--bad)' : 'inherit'}">${m.missedStreak}</div></div>
      <div class="card kpi"><div class="eyebrow">LTV</div><div class="k-val" style="font-size:30px">${money(m.ltv)}</div></div>
    </div>
    ${d.alerts.filter((a) => !a.resolved).map((a) => `<div class="banner warn" style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span>${esc(a.message)}</span><button class="btn sm" data-act="resolve" data-id="${a.id}">Resolve</button></div>`).join('')}
    <form class="card form" data-form="saveMember" data-id="${m.id}" style="margin-bottom:14px">
      <div class="row2">
        <label>Plan<select name="plan"><option value="">None</option>${S.config.plans.map((p) => `<option value="${p.id}" ${m.plan === p.id ? 'selected' : ''}>${esc(p.tierName)} · ${esc(p.name)}</option>`).join('')}</select></label>
        <label>Status<select name="subStatus">${['active', 'cancelled', 'past_due', 'paused', 'none'].map((s) => `<option ${m.subStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      </div>
      <label>Access until / renews<input type="date" name="subRenews" value="${m.subRenews ? ymd(new Date(m.subRenews)) : ''}"></label>
      <div class="row2"><label>Daily calorie target<input type="number" name="calorieTarget" min="800" max="8000" value="${d.targets.kcal || ''}" placeholder="e.g. 2200"></label>
        <label>Daily protein target (g)<input type="number" name="proteinTarget" min="20" max="500" value="${d.targets.protein || ''}" placeholder="e.g. 140"></label></div>
      <label>Coach notes (private)<textarea name="adminNotes" rows="3" placeholder="Goals, race date, injuries, preferences…">${esc(m.adminNotes)}</textarea></label>
      <button class="btn primary sm" type="submit">Save member</button>
    </form>
    <div class="detail-grid">
      <section class="card"><h3 style="margin-bottom:6px">Feedback</h3>${d.feedback.length ? d.feedback.map(fbHTML).join('') : '<p class="muted small">No voice notes yet.</p>'}</section>
      <div class="stack">
        <section class="card mini"><h3 style="margin-bottom:6px">Recent sessions</h3>${d.completions.length ? d.completions.slice(0, 10).map((c) => `<div class="row"><span>${fmtDate(c.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(c.title || '')}</span><span class="muted">${c.rpe ? `RPE ${c.rpe}` : ''}${c.durationMin ? ` · ${c.durationMin}m` : ''}</span></div>`).join('') : '<p class="muted small">None yet.</p>'}</section>
        <section class="card mini"><h3 style="margin-bottom:6px">Strength blocks</h3>${d.strength.length ? d.strength.map((x) => `
          <div style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between"><strong>${esc(x.lift)}</strong>
            <span class="muted small">${x.next ? `Week ${x.next.week}: ${x.next.sets} × ${x.next.reps}${x.next.target != null ? ` @ ${kg(x.next.target)}` : ''}` : 'Block finished'}</span></div>
            <div class="small muted" style="margin-top:4px">${x.logs.map((l) => `W${l.week} ${l.sets}×${l.reps} @ ${kg(l.weight)}`).join(' · ')}</div></div>`).join('') : '<p class="muted small">No lifts logged.</p>'}</section>
        ${d.nutrition.enabled || d.nutrition.recent.length ? `<section class="card mini"><h3 style="margin-bottom:6px">Nutrition</h3>
          <div class="row"><span>Avg calories (days logged, last 7)</span><strong>${d.nutrition.avgKcal7 ? `${d.nutrition.avgKcal7.toLocaleString()} kcal` : '—'}${d.targets.kcal ? ` <span class="muted small">/ ${d.targets.kcal.toLocaleString()}</span>` : ''}</strong></div>
          <div class="row"><span>Days logged (last 7)</span><strong>${d.nutrition.daysLogged7}/7</strong></div>
          ${d.nutrition.recent.map((l) => `<div class="row" style="align-items:center">
            <span style="display:flex;gap:10px;align-items:center;min-width:0">${l.photoUrl ? `<img src="${l.photoUrl}" alt="" style="width:34px;height:34px;border-radius:8px;object-fit:cover">` : ''}
            <span style="min-width:0"><span class="small muted">${fmtDate(l.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(l.meal)}</span><br>${esc(l.items.map((i) => i.name).join(', '))}</span></span>
            <strong style="white-space:nowrap">${l.totals.kcal.toLocaleString()} kcal</strong></div>`).join('')}
          ${d.nutrition.enabled ? '' : '<p class="muted small">Not on a nutrition plan.</p>'}</section>` : ''}
        <section class="card mini"><h3 style="margin-bottom:6px">PBs</h3>${d.pbs.length ? d.pbs.map((p) => `<div class="row"><span>${esc(p.name)}</span><strong>${fmtVal(p.unit, p.best.value)}</strong></div>`).join('') : '<p class="muted small">No efforts logged.</p>'}</section>
        <section class="card mini"><h3 style="margin-bottom:6px">Payments</h3>${d.payments.length ? d.payments.map((p) => `<div class="row"><span>${fmtDate(p.createdAt)} · ${esc(planName(p.plan))}</span><span>${p.status === 'paid' ? '' : '<span class="chip bad">failed</span> '}${money(p.amount, p.currency)}</span></div>`).join('') : '<p class="muted small">No payments.</p>'}</section>
      </div>
    </div>`);
};
actions.close = () => closeModal();
forms.saveMember = async (f) => {
  const b = Object.fromEntries(new FormData(f));
  b.plan = b.plan || null;
  if (!b.subRenews) delete b.subRenews;
  await api(`/api/admin/members/${f.dataset.id}`, { method: 'PATCH', body: b });
  toast('Member saved');
  if (S.view === 'members') { S.members = (await api('/api/admin/members')).members; drawMembers(); }
};

// ---------- Programming ----------
const progTabs = () => `<div class="seg" style="margin-bottom:18px">${[['week', 'Weekly sessions'], ['strength', 'Strength blocks']].map(([k, l]) => `<button class="${S.progTab === k ? 'on' : ''}" data-act="progTab" data-t="${k}">${l}</button>`).join('')}</div>`;
actions.progTab = (el) => { S.progTab = el.dataset.t; show(); };
async function loadPrograms() { const r = await api('/api/admin/programs'); S.programs = r.programs; S.standardWeeks = r.standardWeeks; }
async function viewProgramming(v) {
  if (S.progTab === 'strength') return viewStrength(v);
  const [d] = await Promise.all([api(`/api/admin/workouts${S.weekStart ? `?start=${S.weekStart}` : ''}`), loadPrograms()]);
  S.weekStart = d.start; S.week = d;
  const days = [0, 1, 2, 3, 4].map((i) => addDays(d.start, i));
  v.innerHTML = `<div class="page-head"><div><div class="eyebrow">Monday – Friday</div><h1>Programming</h1></div>
      <div class="btn-row"><button class="btn sm" data-act="copyWeek">Copy week → next week</button><button class="btn sm primary" data-act="fillTemplate">Fill empty days from HYROX template</button></div></div>
    ${progTabs()}
    <div class="weekbar" style="max-width:420px;margin:0 auto 18px"><button class="icon-btn" data-act="pWeek" data-d="-7">‹</button>
      <div><div class="eyebrow">${d.start <= d.today && d.today <= addDays(d.start, 6) ? 'This week' : 'Week of'}</div><strong>${fmtDate(d.start)} – ${fmtDate(addDays(d.start, 4))}</strong></div>
      <button class="icon-btn" data-act="pWeek" data-d="7">›</button></div>
    <div class="weekgrid">${days.map((day) => {
      const ws = d.workouts.filter((w) => w.date === day);
      return `<div class="wcol"><div class="wday">${dayName(day)} <b>${parseYmd(day).getDate()}</b>${day === d.today ? ' · today' : ''}</div>
        ${ws.map((w) => `<button class="wcard ${w.published ? '' : 'draft'}" data-act="editWorkout" data-id="${w.id}">
          ${w.focus ? `<span class="chip accent" style="align-self:flex-start">${esc(w.focus)}</span>` : ''}<h3>${esc(w.title)}</h3>
          <div class="small muted">${w.duration ? `${w.duration} min · ` : ''}${w.blocks.map((b) => esc(b.title)).join(' · ')}</div>
          ${w.blocks.filter((b) => b.programId).map((b) => { const p = S.programs.find((x) => x.id === b.programId); return p ? `<span class="chip" style="align-self:flex-start">↗ ${esc(p.lift)} · wk ${Math.max(1, Math.round((parseYmd(w.date) - parseYmd(p.startDate)) / 6048e5) + 1)}</span>` : ''; }).join('')}
          <div class="meta"><span>${w.published ? '● Published' : '○ Draft'}</span><span>✓ ${w.completions}</span><span>🎙 ${w.voiceNotes}</span></div></button>`).join('')}
        ${ws.length ? '' : `<button class="wcard new" data-act="newWorkout" data-date="${day}">+ Create workout</button>`}</div>`;
    }).join('')}</div>`;
}
actions.pWeek = (el) => { S.weekStart = addDays(S.weekStart, Number(el.dataset.d)); show(); };
actions.copyWeek = async () => {
  const to = addDays(S.weekStart, 7);
  const r = await api('/api/admin/workouts/copy-week', { method: 'POST', body: { from: S.weekStart, to } });
  toast(r.copied ? `Copied ${r.copied} workout(s) to week of ${fmtDate(to)}` : 'Nothing copied — next week already has workouts on those days');
};
async function templates() { if (!S.templates) S.templates = (await api('/api/admin/templates')).templates; return S.templates; }
actions.fillTemplate = async () => {
  const t = await templates();
  let n = 0;
  for (const tpl of t) {
    const date = addDays(S.weekStart, tpl.day);
    if (S.week.workouts.some((w) => w.date === date)) continue;
    await api('/api/admin/workouts', { method: 'POST', body: { ...tpl, date, published: false } });
    n++;
  }
  toast(n ? `Added ${n} draft workout(s) — review and publish` : 'Every day already has a workout');
  show();
};
actions.newWorkout = (el) => openEditor({ date: el.dataset.date, title: '', focus: '', notes: '', published: true, blocks: [{ title: 'Warm-up', format: '10 min', details: '' }] });
actions.editWorkout = (el) => openEditor(structuredClone(S.week.workouts.find((w) => w.id === el.dataset.id)));

function openEditor(w) {
  S.editing = w;
  const evOpts = (sel) => `<option value="">— none —</option>${Object.entries(S.config.pbEvents).map(([k, e]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}`;
  openModal(`<form class="form" data-form="saveWorkout">
    <div class="modal-head"><div><div class="eyebrow">${w.id ? 'Edit workout' : 'New workout'}</div><h2>${fmtDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div><button class="icon-btn" type="button" data-act="close">×</button></div>
    <div class="row2"><label>Title<input name="title" required value="${esc(w.title)}" placeholder="e.g. Compromised Running"></label>
      <label>Focus<input name="focus" value="${esc(w.focus)}" placeholder="e.g. Engine + Strength"></label></div>
    <div class="row2"><label>Date<input type="date" name="date" required value="${w.date}"></label>
      <label>Est. duration (min)<input type="number" name="duration" min="5" max="300" value="${w.duration || ''}" placeholder="60"></label></div>
    <div class="row2">
      <label>Start from template<select id="tpl"><option value="">—</option>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => `<option value="${i}">${d} HYROX template</option>`).join('')}</select></label></div>
    <label>Coach notes (shown to athletes)<textarea name="notes" rows="2">${esc(w.notes)}</textarea></label>
    <label class="check-label"><input type="checkbox" name="published" ${w.published ? 'checked' : ''}>Published (visible to athletes)</label>
    <div class="section-title" style="margin-top:6px"><h3>Blocks</h3><button class="btn sm" type="button" data-act="addBlock">+ Add block</button></div>
    <div id="blocks">${w.blocks.map((b, i) => `<div class="block-ed" data-i="${i}">
      <div class="be-head"><strong>Block ${String.fromCharCode(65 + i)}</strong><div class="be-tools">
        <button type="button" data-act="moveBlock" data-i="${i}" data-d="-1" title="Move up">↑</button><button type="button" data-act="moveBlock" data-i="${i}" data-d="1" title="Move down">↓</button><button type="button" data-act="removeBlock" data-i="${i}" title="Remove">×</button></div></div>
      <div class="row2"><label>Title<input data-k="title" value="${esc(b.title)}"></label><label>Format / scheme<input data-k="format" value="${esc(b.format)}" placeholder="e.g. 4 rounds for time"></label></div>
      <label>Details (one movement per line)<textarea data-k="details" rows="4">${esc(b.details)}</textarea></label>
      <div class="row2"><label>Strength progression<select data-k="programId"><option value="">— none —</option>${S.programs.map((p) => `<option value="${p.id}" ${b.programId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>Track as PB effort<select data-k="pbEvent">${evOpts(b.pbEvent)}</select></label></div></div>`).join('')}</div>
    <div class="modal-foot">${w.id ? '<button class="btn danger" type="button" data-act="deleteWorkout">Delete</button>' : '<span></span>'}
      <div class="btn-row"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save workout</button></div></div>
  </form>`);
  $('#tpl').onchange = async (e) => {
    if (e.target.value === '') return;
    const t = (await templates())[Number(e.target.value)];
    syncEditor();
    Object.assign(S.editing, { title: t.title, focus: t.focus, notes: t.notes, duration: t.duration, blocks: structuredClone(t.blocks) });
    openEditor(S.editing);
  };
}
// Pull current form values back into S.editing before re-rendering the editor
function syncEditor() {
  const f = $('[data-form=saveWorkout]');
  if (!f) return;
  const w = S.editing;
  const el = f.elements;
  w.title = el.title.value; w.focus = el.focus.value; w.notes = el.notes.value; w.date = el.date.value; w.duration = el.duration.value; w.published = el.published.checked;
  w.blocks = $$('.block-ed', f).map((el) => Object.fromEntries($$('[data-k]', el).map((i) => [i.dataset.k, i.value])));
}
actions.addBlock = () => { syncEditor(); S.editing.blocks.push({ title: '', format: '', details: '' }); openEditor(S.editing); };
actions.removeBlock = (el) => { syncEditor(); S.editing.blocks.splice(Number(el.dataset.i), 1); openEditor(S.editing); };
actions.moveBlock = (el) => {
  syncEditor();
  const i = Number(el.dataset.i), j = i + Number(el.dataset.d), b = S.editing.blocks;
  if (j < 0 || j >= b.length) return;
  [b[i], b[j]] = [b[j], b[i]];
  openEditor(S.editing);
};
forms.saveWorkout = async () => {
  syncEditor();
  const w = S.editing;
  const body = { ...w, blocks: w.blocks.map((b) => ({ ...b, pbEvent: b.pbEvent || undefined })) };
  if (w.id) await api(`/api/admin/workouts/${w.id}`, { method: 'PUT', body });
  else await api('/api/admin/workouts', { method: 'POST', body });
  closeModal(); toast('Workout saved'); show();
};
actions.deleteWorkout = async () => {
  if (!confirm('Delete this workout? Athlete completions for it are removed too.')) return;
  await api(`/api/admin/workouts/${S.editing.id}`, { method: 'DELETE' });
  closeModal(); toast('Workout deleted'); show();
};

// ---------- Strength blocks ----------
async function viewStrength(v) {
  await loadPrograms();
  v.innerHTML = `<div class="page-head"><div><div class="eyebrow">Percentage progressions</div><h1>Programming</h1></div>
      <button class="btn sm primary" data-act="newProgram">+ New strength block</button></div>
    ${progTabs()}
    <p class="muted" style="margin:-6px 0 18px;max-width:720px">Set sets, reps and a % change for each week. Each athlete's weight is calculated from what they logged the week before —
      e.g. last week 8 × 100 kg, this week “6 reps, +20%” → 6 × 120 kg. Link a block to a session block in <b>Weekly sessions</b>.</p>
    ${S.programs.length ? `<div class="stack">${S.programs.map((p) => `
      <section class="card">
        <div class="section-title"><div><h3>${esc(p.name)}</h3><div class="small muted" style="margin-top:4px">${esc(p.lift)} · starts ${fmtDate(p.startDate, { day: 'numeric', month: 'short', year: 'numeric' })} ·
          ${p.currentWeek < 1 ? 'not started' : p.currentWeek > p.weeks.length ? 'finished' : `now in week ${p.currentWeek}`} · ${p.athletes} athlete${p.athletes === 1 ? '' : 's'} logging · linked to ${p.sessions} session${p.sessions === 1 ? '' : 's'}</div></div>
          <button class="btn sm" data-act="editProgram" data-id="${p.id}">Edit</button></div>
        <div class="table-wrap" style="box-shadow:none"><table class="prog-table">
          <tr><th style="text-align:left">Week</th>${p.weeks.map((_, i) => `<th class="${i + 1 === p.currentWeek ? 'cur' : ''}">${i + 1}</th>`).join('')}</tr>
          <tr><td style="text-align:left" class="muted">Sets × reps</td>${p.weeks.map((w, i) => `<td class="${i + 1 === p.currentWeek ? 'cur' : ''}">${w.sets}×${w.reps}</td>`).join('')}</tr>
          <tr><td style="text-align:left" class="muted">Change</td>${p.weeks.map((w, i) => `<td class="${i + 1 === p.currentWeek ? 'cur' : w.pct > 0 ? 'pct-up' : w.pct < 0 ? 'pct-down' : ''}">${w.pct > 0 ? '+' : ''}${w.pct}%</td>`).join('')}</tr>
          <tr><td style="text-align:left" class="muted">From 100 kg</td>${previewWeights(p.weeks, 100, p.roundTo).map((x, i) => `<td class="${i + 1 === p.currentWeek ? 'cur' : 'muted'}">${x}</td>`).join('')}</tr>
        </table></div>
      </section>`).join('')}</div>` : '<div class="empty card">No strength blocks yet. Create one to start percentage-based progressions.</div>'}`;
}
function previewWeights(weeks, start, step = 2.5) {
  let w = start;
  return weeks.map((x, i) => { if (i > 0) w *= 1 + (Number(x.pct) || 0) / 100; return +(Math.round(w / step) * step).toFixed(2); });
}
actions.newProgram = () => openProgram({ name: '', lift: '', startDate: addDays(ymd(new Date()), (8 - new Date().getDay()) % 7 || 7), roundTo: 2.5,
  weeks: S.standardWeeks.map((w) => ({ ...w })) });
actions.editProgram = (el) => openProgram(structuredClone(S.programs.find((p) => p.id === el.dataset.id)));
function openProgram(p) {
  S.prog = p;
  openModal(`<form class="form" data-form="saveProgram">
    <div class="modal-head"><div><div class="eyebrow">${p.id ? 'Edit strength block' : 'New strength block'}</div><h2>${esc(p.name || 'Strength block')}</h2></div><button class="icon-btn" type="button" data-act="close">×</button></div>
    <div class="row2"><label>Block name<input name="name" required value="${esc(p.name)}" placeholder="e.g. Back Squat — 12-week block"></label>
      <label>Lift<input name="lift" required value="${esc(p.lift)}" placeholder="e.g. Back Squat"></label></div>
    <div class="row2"><label>Week 1 starts (Monday)<input type="date" name="startDate" required value="${p.startDate}"></label>
      <label>Round weights to<select name="roundTo">${[1, 1.25, 2, 2.5, 5].map((r) => `<option value="${r}" ${Number(p.roundTo) === r ? 'selected' : ''}>${r} kg</option>`).join('')}</select></label></div>
    <div class="section-title" style="margin-top:4px"><h3>Weeks</h3><div class="btn-row">
      <button class="btn sm ghost" type="button" data-act="progStandard">Load standard 12 weeks</button>
      <button class="btn sm" type="button" data-act="progWeek" data-d="-1">− Week</button><button class="btn sm" type="button" data-act="progWeek" data-d="1">+ Week</button></div></div>
    <p class="small muted" style="margin:0 0 8px">% change is applied to the weight the athlete logged the week before. Use a negative % for a deload. Week 1 is their starting weight.</p>
    <div class="table-wrap" style="box-shadow:none"><table class="prog-table prog-ed">
      <tr><th>Week</th><th>Sets</th><th>Reps</th><th>% change</th><th>e.g. from 100 kg</th></tr>
      ${p.weeks.map((w, i) => `<tr data-i="${i}"><td><b>${i + 1}</b></td>
        <td><input type="number" data-k="sets" min="1" max="20" value="${w.sets}"></td>
        <td><input type="number" data-k="reps" min="1" max="50" value="${w.reps}"></td>
        <td><input type="number" data-k="pct" step="0.5" min="-50" max="100" value="${w.pct}" ${i === 0 ? 'title="Week 1 is the starting weight"' : ''}></td>
        <td class="pv" data-pv="${i}"></td></tr>`).join('')}
    </table></div>
    <div class="modal-foot">${p.id ? '<button class="btn danger" type="button" data-act="deleteProgram">Delete block</button>' : '<span></span>'}
      <div class="btn-row"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save block</button></div></div>
  </form>`);
  const f = $('[data-form=saveProgram]');
  f.addEventListener('input', progPreview);
  progPreview();
}
function syncProgram() {
  const f = $('[data-form=saveProgram]');
  if (!f) return;
  const e = f.elements;
  Object.assign(S.prog, { name: e.name.value, lift: e.lift.value, startDate: e.startDate.value, roundTo: Number(e.roundTo.value) });
  S.prog.weeks = $$('tr[data-i]', f).map((tr) => Object.fromEntries($$('[data-k]', tr).map((i) => [i.dataset.k, Number(i.value)])));
}
function progPreview() {
  syncProgram();
  const xs = previewWeights(S.prog.weeks, 100, S.prog.roundTo);
  xs.forEach((x, i) => { const td = $(`[data-pv="${i}"]`); if (td) td.textContent = `${S.prog.weeks[i].sets} × ${S.prog.weeks[i].reps} @ ${kg(x)}`; });
}
actions.progStandard = () => { syncProgram(); S.prog.weeks = S.standardWeeks.map((w) => ({ ...w })); openProgram(S.prog); };
actions.progWeek = (el) => {
  syncProgram();
  const w = S.prog.weeks;
  if (Number(el.dataset.d) > 0 && w.length < 16) w.push({ ...(w[w.length - 1] || { sets: 3, reps: 5 }), pct: 2.5 });
  if (Number(el.dataset.d) < 0 && w.length > 1) w.pop();
  openProgram(S.prog);
};
forms.saveProgram = async () => {
  syncProgram();
  const p = S.prog;
  if (p.id) await api(`/api/admin/programs/${p.id}`, { method: 'PUT', body: p });
  else await api('/api/admin/programs', { method: 'POST', body: p });
  closeModal(); toast('Strength block saved'); show();
};
actions.deleteProgram = async () => {
  if (!confirm('Delete this strength block? Athletes\' logged lifts for it are removed and it is unlinked from sessions.')) return;
  await api(`/api/admin/programs/${S.prog.id}`, { method: 'DELETE' });
  closeModal(); toast('Strength block deleted'); show();
};

// ---------- Payments ----------
async function viewPayments(v) {
  const d = await api('/api/admin/payments');
  v.innerHTML = `<div class="page-head"><div><div class="eyebrow">Revenue</div><h1>Payments</h1></div>
      <div class="card kpi" style="padding:12px 18px"><div class="eyebrow">Collected</div><div class="k-val" style="font-size:30px">${money(d.total, d.currency)}</div></div></div>
    ${S.me.stripe ? '' : '<div class="banner warn">Demo mode — add STRIPE_SECRET_KEY to take real payments (Apple Pay, Google Pay & cards via Stripe Checkout).</div>'}
    <div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Member</th><th>Plan</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>
    ${d.payments.length ? d.payments.map((p) => `<tr data-act="openMember" data-id="${p.userId}"><td>${fmtDate(p.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td>${esc(p.userName)}</td>
      <td>${esc(planName(p.plan))}</td><td>${money(p.amount, p.currency)}</td><td class="sub">${esc(p.source)}</td>
      <td>${p.status === 'paid' ? '<span class="chip good">Paid</span>' : '<span class="chip bad">Failed</span>'}</td></tr>`).join('')
      : '<tr><td colspan="6" class="center muted" style="padding:28px">No payments yet.</td></tr>'}</tbody></table></div>`;
}

boot().catch((e) => { $('#root').innerHTML = `<div class="empty">Couldn't load: ${esc(e.message)}</div>`; });
