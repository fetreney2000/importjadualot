'use strict';
/* ============================================================
   JadualOT — aplikasi roster (vanilla JS, tiada kebergantungan)
   ============================================================ */

const API = '/.netlify/functions/roster';
const LS_PERIOD = 'jadualot:period';
const LS_NAME = 'jadualot:myName';

const DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const DAYS_SHORT = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'];
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const UNITS = ['AMBU', 'INPA', 'AE', 'PREPACK'];

const STATUS_LABELS = {
  PUBLISHED: 'Akan datang',
  ACTIVE: 'Semasa',
  CLAIM_OPEN: 'Tuntutan dibuka',
  CLAIM_CLOSED: 'Tuntutan ditutup',
  ARCHIVED: 'Arkib',
};

const AVATAR_HUES = [230, 190, 160, 0, 300, 35, 205, 265, 90, 330];

const state = {
  data: null,
  period: localStorage.getItem(LS_PERIOD) || null,
  tab: 'agenda',
  query: '',
  units: new Set(),
  changedOnly: false,
  myKey: localStorage.getItem(LS_NAME) || '',
  offline: false,
  openStaff: new Set(),
};

const $ = (id) => document.getElementById(id);
const el = {
  periodSelect: $('periodSelect'), railMeta: $('railMeta'),
  search: $('searchInput'), today: $('todayBtn'), refresh: $('refreshBtn'),
  statusPill: $('statusPill'), periodLine: $('periodLine'), pageTitle: $('pageTitle'),
  updated: $('updatedLine'), toast: $('toast'), kpis: $('kpis'),
  unitChips: $('unitChips'), changedOnly: $('changedOnly'), dateStrip: $('dateStrip'),
  filterBar: $('filterBar'),
  agenda: $('agendaList'), staffGrid: $('staffGrid'),
  mePicker: $('mePicker'), meSelect: $('meSelect'), meSave: $('meSave'),
  meContent: $('meContent'), meAvatar: $('meAvatar'), meName: $('meName'),
  meChange: $('meChange'), meSummary: $('meSummary'), meList: $('meList'),
  sourceLink: $('sourceLink'), crumb: $('crumbPeriod'),
};

/* ---------------- util ---------------- */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statusLabel = (s) => STATUS_LABELS[String(s || '').toUpperCase()] || s || '—';
const pad = (n) => String(n).padStart(2, '0');

function parseDate(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd);
}
function fmtLong(d) {
  const t = parseDate(d);
  return `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`;
}
function fmtShort(d) {
  const t = parseDate(d);
  return `${t.getDate()} ${MONTHS[t.getMonth()]}`;
}
const weekday = (d) => DAYS[parseDate(d).getDay()];
const weekdayShort = (d) => DAYS_SHORT[parseDate(d).getDay()];

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** Tempoh syif dalam jam, termasuk syif merentas tengah malam. */
function durationHours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const h = mins / 60;
  return Number.isInteger(h) ? `${h}j` : `${h.toFixed(1)}j`;
}

function initials(name) {
  const parts = String(name).trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';
}

function avatarStyle(name) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `--av-h:${AVATAR_HUES[h % AVATAR_HUES.length]}`;
}

function avatarHtml(name, cls = '') {
  return `<span class="avatar ${cls}" style="${avatarStyle(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
}

let toastTimer;
function toast(msg, ms = 6000) {
  if (!msg) { el.toast.hidden = true; return; }
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

/* ---------------- data ---------------- */

function sortAssignments(list) {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

function filtered(extra = {}) {
  const q = (extra.query ?? state.query).trim().toLowerCase();
  const units = extra.units || state.units;
  const changedOnly = extra.changedOnly ?? state.changedOnly;
  const staffKey = extra.staffKey;
  return state.data.assignments.filter((a) => {
    if (staffKey && a.staffKey !== staffKey) return false;
    if (units.size && !units.has(a.unitCode)) return false;
    if (changedOnly && !a.changed) return false;
    if (q && !a.staffName.toLowerCase().includes(q)) return false;
    return true;
  });
}

/* ---------------- render ---------------- */

function renderHeader() {
  const r = state.data.roster;
  const today = todayStr();
  const mine = state.myKey && state.data.staff.some((p) => p.staffKey === state.myKey);
  el.pageTitle.textContent = state.tab === 'me' && mine
    ? 'Tugas Saya'
    : r.status === 'ACTIVE' ? 'Roster Kerja Lebih Masa'
      : r.status === 'PUBLISHED' ? 'Roster Akan Datang' : 'Roster Kerja Lebih Masa';

  el.statusPill.textContent = statusLabel(r.status);
  el.statusPill.dataset.status = r.status;
  el.periodLine.textContent = `Tempoh ${r.periodKey} · versi ${r.effectiveVersion}`;
  el.updated.textContent = state.offline
    ? `Data sandaran · ${r.lastUpdated}`
    : `Dikemas kini ${r.lastUpdated}`;
  el.railMeta.textContent = state.offline ? 'Mod luar talian' : `Data langsung · ${r.periodKey}`;
  el.crumb.textContent = `${r.periodKey} · ${statusLabel(r.status)}`;
  el.sourceLink.href = state.data.viewUrl || '#';
}

function renderKpis() {
  const d = state.data;
  const holidayDays = new Set(d.assignments.filter((a) => a.dayType === 'PUBLIC_HOLIDAY').map((a) => a.date)).size;
  const people = new Set(d.assignments.map((a) => a.staffKey)).size;
  const tiles = [
    { label: 'Slot', value: d.roster.assignmentCount },
    { label: 'Berubah', value: d.roster.changedCount, cls: 'accent' },
    { label: 'Cuti umum', value: holidayDays, cls: 'holiday' },
    { label: 'Staf', value: people },
  ];
  el.kpis.innerHTML = tiles.map((t) => `
    <div class="kpi ${t.cls || ''}">
      <span class="kpi-label">${esc(t.label)}</span>
      <strong class="kpi-value">${t.value}</strong>
    </div>`).join('');
}

function renderFilters() {
  const opts = [['SEMUA', 'Semua'], ...UNITS.map((u) => [u, u])];
  el.unitChips.innerHTML = opts.map(([value, label]) => {
    const active = value === 'SEMUA' ? state.units.size === 0 : state.units.has(value);
    return `<button class="seg${active ? ' active' : ''}" data-unit="${value}" type="button" aria-pressed="${active}">${label}</button>`;
  }).join('');
  requestAnimationFrame(syncFades);
}

/** Tunjuk pudaran tepi hanya pada jalur tarikh yang benar-benar boleh ditatal. */
function syncFades() {
  document.querySelectorAll('.datestrip').forEach((node) => {
    node.classList.toggle('fade', node.scrollWidth > node.clientWidth + 2);
  });
}

function renderDateStrip(list) {
  const dates = [...new Set(list.map((a) => a.date))].sort();
  if (!dates.length) { el.dateStrip.innerHTML = ''; el.dateStrip.classList.remove('fade'); return; }
  const today = todayStr();
  el.dateStrip.innerHTML = dates.map((d) => {
    const slots = list.filter((a) => a.date === d);
    const holiday = slots.some((a) => a.dayType === 'PUBLIC_HOLIDAY');
    return `<button class="dchip${d === today ? ' today' : ''}${holiday ? ' holiday' : ''}" data-jump="${esc(d)}" type="button" aria-label="${esc(weekday(d))} ${esc(fmtLong(d))}, ${slots.length} slot">
      <span class="dw">${weekdayShort(d)}</span>
      <span class="dn">${parseDate(d).getDate()}</span>
      <span class="dc">${slots.length}</span>
    </button>`;
  }).join('');
  // pudarkan tepi hanya apabila jalur boleh ditatal
  syncFades();
}

function shiftCard(a) {
  const orig = a.changed
    ? `<span class="shift-orig">Asal: ${esc(a.originalStaffName)}</span>` : '';
  return `<article class="shift u-${esc(a.unitCode)}${a.changed ? ' changed' : ''}">
    <div class="shift-time">
      <b>${esc(a.startTime)}</b>
      <span>${esc(a.endTime)}</span>
    </div>
    <div class="shift-body">
      ${avatarHtml(a.staffName)}
      <div class="shift-id">
        <span class="shift-name">${esc(a.staffName)}</span>
        <span class="shift-sub">${esc(durationHours(a.startTime, a.endTime))} · ${esc(weekday(a.date))}</span>
        ${orig}
      </div>
    </div>
    <div class="shift-side">
      <span class="unit">${esc(a.unitCode)}</span>
    </div>
  </article>`;
}

function dayBlock(date, slots) {
  const holiday = slots.some((a) => a.dayType === 'PUBLIC_HOLIDAY');
  const weekend = slots[0].dayType === 'WEEKEND';
  const isToday = date === todayStr();
  const tags = [
    isToday ? '<span class="tag today">Hari ini</span>' : '',
    holiday ? '<span class="tag holiday">Cuti umum</span>' : weekend ? '<span class="tag weekend">Hujung minggu</span>' : '',
  ].filter(Boolean).join('');
  return `<section class="day${holiday ? ' holiday' : ''}" data-date="${esc(date)}">
    <header class="day-head">
      <h2 class="day-title">${esc(weekday(date))}</h2>
      <span class="day-date">${esc(fmtShort(date))}</span>
      ${tags}
      <span class="day-count">${slots.length} slot</span>
    </header>
    <div class="shifts">${slots.map(shiftCard).join('')}</div>
  </section>`;
}

function renderAgenda(mount, list) {
  if (!list.length) {
    mount.innerHTML = `<div class="empty"><strong>Tiada syif ditemui</strong>Cuba longgarkan tapisan atau padam carian.</div>`;
    return;
  }
  const byDate = new Map();
  for (const a of list) {
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date).push(a);
  }
  mount.innerHTML = [...byDate.keys()].sort().map((d) => dayBlock(d, byDate.get(d))).join('');
}

function renderStaff() {
  const q = state.query.trim().toLowerCase();
  const people = state.data.staff.filter((p) => !q || p.staffName.toLowerCase().includes(q));
  if (!people.length) {
    el.staffGrid.innerHTML = `<div class="empty"><strong>Tiada staf ditemui</strong>Padam carian untuk melihat semua.</div>`;
    return;
  }
  el.staffGrid.innerHTML = people.map((p) => {
    const duties = sortAssignments(state.data.assignments.filter((a) => a.staffKey === p.staffKey));
    const open = state.openStaff.has(p.staffKey);
    const unitCount = new Set(duties.map((d) => d.unitCode)).size;
    const rows = duties.map((d) => {
      const holiday = d.dayType === 'PUBLIC_HOLIDAY';
      return `<div class="duty">
        <span class="duty-date">${holiday ? '★ ' : ''}${esc(fmtShort(d.date))}</span>
        <span class="duty-time"><b>${esc(d.startTime)}</b>–${esc(d.endTime)}${d.changed ? ' · berubah' : ''}</span>
        <span class="unit u-${esc(d.unitCode)}">${esc(d.unitCode)}</span>
      </div>`;
    }).join('');
    return `<article class="staff-card${open ? ' open' : ''}" data-staff="${esc(p.staffKey)}">
      <button class="staff-head" type="button" aria-expanded="${open}">
        ${avatarHtml(p.staffName)}
        <span>
          <span class="staff-name">${esc(p.staffName)}</span>
          <span class="staff-meta">${duties.length} slot · ${unitCount} unit${duties.some((d) => d.changed) ? ' · berubah' : ''}</span>
        </span>
        <svg class="staff-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="staff-body">${rows}</div>
    </article>`;
  }).join('');
}

function renderMe() {
  if (!el.meSelect.options.length) {
    el.meSelect.innerHTML = '<option value="">— Pilih nama anda —</option>' +
      [...state.data.staff].sort((a, b) => a.staffName.localeCompare(b.staffName))
        .map((p) => `<option value="${esc(p.staffKey)}">${esc(p.staffName)}</option>`).join('');
  }

  const me = state.data.staff.find((p) => p.staffKey === state.myKey);
  if (!state.myKey || !me) {
    if (state.myKey) { state.myKey = ''; localStorage.removeItem(LS_NAME); }
    el.mePicker.hidden = false;
    el.meContent.hidden = true;
    el.meSelect.value = '';
    return;
  }

  el.mePicker.hidden = true;
  el.meContent.hidden = false;
  el.meSelect.value = state.myKey;
  el.meAvatar.textContent = initials(me.staffName);
  el.meAvatar.setAttribute('style', avatarStyle(me.staffName));
  el.meName.textContent = me.staffName;

  const mine = sortAssignments(state.data.assignments.filter((a) => a.staffKey === state.myKey));
  const byUnit = {};
  let hours = 0;
  for (const a of mine) {
    byUnit[a.unitCode] = (byUnit[a.unitCode] || 0) + 1;
    hours += parseFloat(durationHours(a.startTime, a.endTime));
  }
  const changed = mine.filter((a) => a.changed).length;
  el.meSummary.innerHTML = [
    { label: 'Slot', value: mine.length },
    { label: 'Jam', value: Number.isInteger(hours) ? hours : hours.toFixed(1) },
    { label: 'Berubah', value: changed, cls: changed ? 'accent' : '' },
    { label: 'Cuti umum', value: mine.filter((a) => a.dayType === 'PUBLIC_HOLIDAY').length, cls: 'holiday' },
  ].map((t) => `<div class="kpi ${t.cls || ''}"><span class="kpi-label">${t.label}</span><strong class="kpi-value">${t.value}</strong></div>`).join('');

  renderAgenda(el.meList, mine);
  renderHeader();
}

function renderAll() {
  renderHeader();
  renderKpis();
  renderFilters();
  renderPeriodSelect();
  const list = sortAssignments(filtered());
  renderDateStrip(list);
  renderAgenda(el.agenda, list);
  renderStaff();
  renderMe();
  syncKpis();
  syncFilterBar();
}

/** KPI roster global hanya relevan pada Senarai/Staf. */
function syncKpis() {
  el.kpis.hidden = state.tab === 'me';
}

/** Carian dikongsi; tapisan unit/perubahan hanya relevan pada Senarai. */
function syncFilterBar() {
  el.filterBar.hidden = state.tab === 'me';
  el.unitChips.hidden = state.tab !== 'agenda';
  el.changedOnly.hidden = state.tab !== 'agenda';
}

function renderPeriodSelect() {
  const opts = state.data.rosterOptions || [];
  el.periodSelect.innerHTML = opts.map((o) =>
    `<option value="${esc(o.periodKey)}">${esc(o.periodKey)} · ${esc(statusLabel(o.status))}</option>`).join('');
  el.periodSelect.value = state.period;
}

/* ---------------- data loading ---------------- */

function skeleton() {
  el.agenda.innerHTML = Array.from({ length: 5 }, () => '<div class="skeleton"></div>').join('');
  el.dateStrip.innerHTML = '';
}

async function loadPeriod(period) {
  skeleton();
  toast('');
  state.offline = false;
  try {
    const res = await fetch(`${API}?period=${encodeURIComponent(period)}`);
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error((body && body.error) || `HTTP ${res.status}`);
    state.data = body.data;
  } catch (err) {
    const res = await fetch(`data/roster-${encodeURIComponent(period)}.json`);
    if (!res.ok) throw new Error('Tiada data luar talian untuk tempoh ini.');
    const body = await res.json();
    state.data = body.ok ? body.data : body;
    state.offline = true;
    toast('Mod luar talian — memaparkan data sandaran yang dibundel. Tekan butang muat semula apabila dalam talian.');
  }
  state.period = state.data.roster.periodKey;
  localStorage.setItem(LS_PERIOD, state.period);
  renderAll();
  centerTodayChip();
}

/* ---------------- view switching ---------------- */

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', String(on));
  });
  $('view-agenda').hidden = tab !== 'agenda';
  $('view-staff').hidden = tab !== 'staff';
  $('view-me').hidden = tab !== 'me';
  syncKpis();
  syncFilterBar();
  renderHeader();
  if (tab === 'staff') renderStaff();
  if (tab === 'me') renderMe();
}

/** Pusatkan cip "hari ini" hanya jika ia belum kelihatan sepenuhnya. */
function centerTodayChip() {
  const chip = el.dateStrip.querySelector('.dchip.today');
  if (!chip) return;
  const strip = el.dateStrip;
  const left = chip.offsetLeft - strip.offsetLeft;
  const fullyVisible = left >= strip.scrollLeft && left + chip.offsetWidth <= strip.scrollLeft + strip.clientWidth;
  if (fullyVisible) return;
  const target = left - (strip.clientWidth - chip.offsetWidth) / 2;
  strip.scrollTo({ left: Math.max(0, target), behavior: 'auto' });
}

/* ---------------- scroll helpers ---------------- */

function scrollToDate(date) {
  const mount = state.tab === 'me' ? el.meList : el.agenda;
  const target = mount.querySelector(`[data-date="${date}"]`);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (state.data) toast(`Tiada slot pada ${fmtLong(date)} dalam tempoh ${state.period}.`);
}

function scrollToToday(smooth = true) {
  const target = el.agenda.querySelector('[data-date]');
  if (!target) return;
  const today = todayStr();
  const mount = state.tab === 'me' ? el.meList : el.agenda;
  const hit = mount.querySelector(`[data-date="${today}"]`);
  if (hit) {
    hit.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    return;
  }
  // Tiada syif hari ini — pergi ke tarikh terdekat akan datang
  const dates = [...mount.querySelectorAll('[data-date]')].map((n) => n.dataset.date).sort();
  const next = dates.find((d) => d >= today);
  if (next) mount.querySelector(`[data-date="${next}"]`).scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

/* ---------------- events ---------------- */

document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

el.unitChips.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-unit]');
  if (!btn) return;
  const u = btn.dataset.unit;
  if (u === 'SEMUA') state.units.clear();
  else if (state.units.has(u)) state.units.delete(u);
  else state.units.add(u);
  renderFilters();
  const list = sortAssignments(filtered());
  renderDateStrip(list);
  renderAgenda(el.agenda, list);
});

el.dateStrip.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-jump]');
  if (!chip) return;
  el.dateStrip.querySelectorAll('.dchip').forEach((c) => c.classList.toggle('active', c === chip));
  scrollToDate(chip.dataset.jump);
});

let searchTimer;
el.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = el.search.value;
    if (state.tab === 'staff') {
      renderStaff();
    } else {
      const list = sortAssignments(filtered());
      renderDateStrip(list);
      renderAgenda(el.agenda, list);
    }
  }, 160);
});

el.changedOnly.addEventListener('click', () => {
  state.changedOnly = !state.changedOnly;
  el.changedOnly.setAttribute('aria-pressed', String(state.changedOnly));
  const list = sortAssignments(filtered());
  renderDateStrip(list);
  renderAgenda(el.agenda, list);
});

el.periodSelect.addEventListener('change', () => {
  loadPeriod(el.periodSelect.value).catch((err) => {
    toast(`Gagal memuatkan tempoh: ${err.message}`, 0);
    el.periodSelect.value = state.period;
  });
});

el.refresh.addEventListener('click', () => {
  el.refresh.animate?.([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 500, easing: 'ease-out' });
  loadPeriod(state.period).catch((err) => toast(`Gagal memuat semula: ${err.message}`, 0));
});

el.today.addEventListener('click', () => scrollToToday(true));

el.staffGrid.addEventListener('click', (e) => {
  const head = e.target.closest('.staff-head');
  if (!head) return;
  const card = head.closest('.staff-card');
  const key = card.dataset.staff;
  const open = card.classList.toggle('open');
  head.setAttribute('aria-expanded', String(open));
  if (open) state.openStaff.add(key); else state.openStaff.delete(key);
});

el.meSave.addEventListener('click', () => {
  if (!el.meSelect.value) { toast('Sila pilih nama anda dahulu.'); return; }
  state.myKey = el.meSelect.value;
  localStorage.setItem(LS_NAME, state.myKey);
  renderMe();
  toast('');
});

el.meChange.addEventListener('click', () => {
  state.myKey = '';
  localStorage.removeItem(LS_NAME);
  renderHeader();
  renderMe();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== el.search && !/input|select|textarea/i.test(document.activeElement.tagName)) {
    e.preventDefault();
    setTab('agenda');
    el.search.focus();
  }
  if (e.key === 'Escape' && document.activeElement === el.search) {
    el.search.value = '';
    state.query = '';
    el.search.blur();
    renderAll();
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(syncFades, 120);
});

/* ---------------- boot ---------------- */

(async function boot() {
  try {
    if (!state.period) {
      const res = await fetch(API);
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body?.error || 'API tidak tersedia');
      state.data = body.data;
      state.period = state.data.roster.periodKey;
      localStorage.setItem(LS_PERIOD, state.period);
      renderAll();
      centerTodayChip();
      return;
    }
    await loadPeriod(state.period);
  } catch (err) {
    try {
      const idx = await (await fetch('data/index.json')).json();
      const latest = (idx.periods || []).sort().reverse()[0];
      if (!latest) throw new Error('tiada data sandaran');
      const body = await (await fetch(`data/roster-${latest}.json`)).json();
      state.data = body.ok ? body.data : body;
      state.period = state.data.roster.periodKey;
      state.offline = true;
      renderAll();
      toast('API tidak dapat dihubungi — memaparkan data sandaran. Semak sambungan internet.', 0);
    } catch (err2) {
      el.agenda.innerHTML = `<div class="empty"><strong>Gagal memuatkan roster</strong>${esc(err.message)}<br><br><button class="btn primary" onclick="location.reload()" type="button">Cuba lagi</button></div>`;
      el.updated.textContent = 'Tidak tersedia';
    }
  }
})();
