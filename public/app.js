'use strict';
/* Jadual OT — logik aplikasi (vanilla JS, tiada framework) */

const API = '/.netlify/functions/roster';
const LS_PERIOD = 'jadualot:period';
const LS_NAME = 'jadualot:myName';

const DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const STATUS_LABELS = {
  PUBLISHED: 'AKAN DATANG · PAPARAN SAHAJA',
  ACTIVE: 'SEMASA',
  CLAIM_OPEN: 'TUNTUTAN DIBUKA',
  CLAIM_CLOSED: 'TUNTUTAN DITUTUP',
  ARCHIVED: 'ARKIB',
};
const UNITS = ['AMBU', 'INPA', 'AE', 'PREPACK'];

const state = {
  data: null,
  period: localStorage.getItem(LS_PERIOD) || null,
  tab: 'agenda',
  query: '',
  units: new Set(),
  changedOnly: false,
  myKey: localStorage.getItem(LS_NAME) || '',
  offline: false,
};

const $ = (id) => document.getElementById(id);
const els = {
  pageTitle: $('pageTitle'), periodLine: $('periodLine'), updatedLine: $('updatedLine'),
  notice: $('notice'), search: $('searchInput'), chips: $('unitChips'),
  periodSelect: $('periodSelect'), todayBtn: $('todayBtn'), refreshBtn: $('refreshBtn'),
  changedOnly: $('changedOnly'), agendaList: $('agendaList'),
  staffGrid: $('staffGrid'), mePicker: $('mePicker'), meSelect: $('meSelect'),
  meSave: $('meSave'), meContent: $('meContent'), meSummary: $('meSummary'),
  meList: $('meList'), meChange: $('meChange'),
};

function statusLabel(s) { return STATUS_LABELS[String(s || '').toUpperCase()] || s || ''; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function parseDate(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); }
function fmtDate(d) { const t = parseDate(d); return `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`; }
function weekday(d) { return DAYS[parseDate(d).getDay()]; }
function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function notice(msg) {
  if (!msg) { els.notice.hidden = true; els.notice.textContent = ''; return; }
  els.notice.hidden = false; els.notice.textContent = msg;
}

function skeleton(container, n = 6) {
  container.innerHTML = Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
}

/** Muatkan satu tempoh: cuba fungsi proksi, gagal → fallback JSON statik. */
async function loadPeriod(period) {
  skeleton(els.agendaList);
  notice('');
  state.offline = false;
  try {
    const r = await fetch(`${API}?period=${encodeURIComponent(period)}`);
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error((j && j.error) || `HTTP ${r.status}`);
    state.data = j.data;
  } catch (e) {
    const r = await fetch(`data/roster-${encodeURIComponent(period)}.json`);
    if (!r.ok) throw new Error('Tiada data luar talian untuk tempoh ini.');
    const j = await r.json();
    state.data = j.ok ? j.data : j;
    state.offline = true;
    notice('Mod luar talian: memaparkan data sandaran yang dibundel. Sambung internet dan tekan Muat semula untuk data terkini.');
  }
  state.period = state.data.roster.periodKey;
  localStorage.setItem(LS_PERIOD, state.period);
  renderAll();
}

function filteredAssignments(extra = {}) {
  const q = (extra.query !== undefined ? extra.query : state.query).trim().toLowerCase();
  const units = extra.units || state.units;
  const changedOnly = extra.changedOnly !== undefined ? extra.changedOnly : state.changedOnly;
  const staffKey = extra.staffKey;
  return state.data.assignments.filter((a) => {
    if (staffKey && a.staffKey !== staffKey) return false;
    if (units.size && !units.has(a.unitCode)) return false;
    if (changedOnly && !a.changed) return false;
    if (q && !a.staffName.toLowerCase().includes(q)) return false;
    return true;
  });
}

function slotCard(a) {
  const changed = a.changed
    ? `<span class="changed-tag">BERUBAH · asal: ${esc(a.originalStaffName)}</span>` : '';
  return `<article class="slot u-${esc(a.unitCode)}${a.dayType === 'PUBLIC_HOLIDAY' ? ' holiday' : ''}${a.changed ? ' changed' : ''}">
    <span class="slot-time">${esc(a.startTime)}–${esc(a.endTime)}</span>
    <span class="unit">${esc(a.unitCode)}</span>
    <span class="slot-name">${esc(a.staffName)}</span>
    <span class="slot-sub">${a.dayType === 'PUBLIC_HOLIDAY' ? 'Cuti Umum · ' : ''}${weekday(a.date)}, ${esc(fmtDate(a.date))}</span>
    ${changed}</article>`;
}

function dayBlock(date, slots) {
  const isH = slots[0].dayType === 'PUBLIC_HOLIDAY';
  const isW = slots[0].dayType === 'WEEKEND';
  const badge = isH ? '<span class="badge holiday">CUTI UMUM</span>'
    : isW ? '<span class="badge weekend">HUJUNG MINGGU</span>' : '';
  return `<div class="day${isH ? ' holiday' : ''}" data-date="${esc(date)}">
    <div class="day-head">
      <span class="day-title">${esc(weekday(date))} · ${esc(fmtDate(date))}</span>
      ${badge}<span class="day-count">${slots.length} slot</span>
    </div>
    ${slots.map(slotCard).join('')}</div>`;
}

/** Senarai agenda dikumpul ikut tarikh. */
function renderAgenda(mount, list) {
  if (!list.length) {
    mount.innerHTML = '<div class="empty">Tiada slot ditemui.<br>Cuba longgarkan tapisan atau carian.</div>';
    return;
  }
  const byDate = new Map();
  for (const a of list) {
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date).push(a);
  }
  mount.innerHTML = [...byDate.keys()].sort().map((d) => dayBlock(d, byDate.get(d))).join('');
}

function renderHeader() {
  const r = state.data.roster;
  els.pageTitle.textContent = r.status === 'ACTIVE' ? 'Roster OT Semasa'
    : r.status === 'PUBLISHED' ? 'Roster OT Akan Datang' : 'Roster Kerja Lebih Masa';
  els.periodLine.textContent = `Tempoh ${r.periodKey} · ${statusLabel(r.status)} · versi ${r.effectiveVersion} · ${r.assignmentCount} slot · ${r.changedCount} berubah`;
  els.updatedLine.textContent = r.lastUpdated;
}

function renderPeriodSelect() {
  const opts = state.data.rosterOptions || [];
  els.periodSelect.innerHTML = opts.map((o) =>
    `<option value="${esc(o.periodKey)}">${esc(o.periodKey)} · ${esc(statusLabel(o.status))}</option>`).join('');
  els.periodSelect.value = state.period;
}

function renderChips() {
  els.chips.innerHTML = ['SEMUA', ...UNITS].map((u) => {
    const active = u === 'SEMUA' ? state.units.size === 0 : state.units.has(u);
    return `<button class="chip${active ? ' active' : ''}" data-unit="${u}" type="button">${u === 'SEMUA' ? 'Semua unit' : u}</button>`;
  }).join('');
}

function renderStaff() {
  const q = state.query.trim().toLowerCase();
  const people = state.data.staff.filter((p) => !q || p.staffName.toLowerCase().includes(q));
  if (!people.length) {
    els.staffGrid.innerHTML = '<div class="empty">Tiada staf ditemui.</div>';
    return;
  }
  els.staffGrid.innerHTML = people.map((p) => {
    const duties = state.data.assignments
      .filter((a) => a.staffKey === p.staffKey)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const rows = duties.map((d) =>
      `<div class="duty"><span class="d">${esc(fmtDate(d.date))}</span><span class="t">${esc(d.startTime)}–${esc(d.endTime)} · ${esc(d.unitCode)}${d.changed ? ' · BERUBAH' : ''}</span></div>`).join('');
    return `<article class="staff-card"><h2>${esc(p.staffName)}</h2>
      <div class="count">${duties.length} slot</div>${rows}</article>`;
  }).join('');
}

function renderMe() {
  if (!els.meSelect.options.length) {
    els.meSelect.innerHTML = '<option value="">— Pilih nama —</option>' + state.data.staff
      .map((p) => `<option value="${esc(p.staffKey)}">${esc(p.staffName)}</option>`).join('');
  }
  if (!state.myKey) {
    els.mePicker.hidden = false; els.meContent.hidden = true;
    return;
  }
  const me = state.data.staff.find((p) => p.staffKey === state.myKey);
  if (!me) {
    state.myKey = ''; localStorage.removeItem(LS_NAME);
    els.mePicker.hidden = false; els.meContent.hidden = true;
    return;
  }
  els.meSelect.value = state.myKey;
  els.mePicker.hidden = true; els.meContent.hidden = false;
  const mine = state.data.assignments
    .filter((a) => a.staffKey === state.myKey)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const byUnit = {};
  for (const a of mine) byUnit[a.unitCode] = (byUnit[a.unitCode] || 0) + 1;
  const changed = mine.filter((a) => a.changed).length;
  els.meSummary.innerHTML =
    `<span class="stat"><strong>${mine.length}</strong> slot · ${esc(me.staffName)}</span>` +
    UNITS.filter((u) => byUnit[u]).map((u) => `<span class="stat"><strong>${byUnit[u]}</strong> ${u}</span>`).join('') +
    (changed ? `<span class="stat"><strong>${changed}</strong> berubah</span>` : '');
  renderAgenda(els.meList, mine);
}

function renderAll() {
  renderHeader();
  renderPeriodSelect();
  renderChips();
  renderAgenda(els.agendaList, filteredAssignments().sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)));
  renderStaff();
  renderMe();
}

/* Peristiwa */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('view-agenda').hidden = state.tab !== 'agenda';
    $('view-staff').hidden = state.tab !== 'staff';
    $('view-me').hidden = state.tab !== 'me';
  });
});

els.chips.addEventListener('click', (e) => {
  const b = e.target.closest('[data-unit]');
  if (!b) return;
  const u = b.dataset.unit;
  if (u === 'SEMUA') state.units.clear();
  else if (state.units.has(u)) state.units.delete(u);
  else state.units.add(u);
  renderChips();
  renderAgenda(els.agendaList, filteredAssignments().sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)));
});

let searchT;
els.search.addEventListener('input', () => {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    state.query = els.search.value;
    if (state.tab === 'agenda') renderAgenda(els.agendaList, filteredAssignments().sort((a, b) =>
      a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)));
    else if (state.tab === 'staff') renderStaff();
  }, 150);
});

els.changedOnly.addEventListener('change', () => {
  state.changedOnly = els.changedOnly.checked;
  renderAgenda(els.agendaList, filteredAssignments().sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)));
});

els.periodSelect.addEventListener('change', () => loadPeriod(els.periodSelect.value).catch((e) => {
  notice(`Gagal memuatkan tempoh: ${e.message}`);
}));
els.refreshBtn.addEventListener('click', () => loadPeriod(state.period).catch((e) => {
  notice(`Gagal memuat semula: ${e.message}`);
}));
els.todayBtn.addEventListener('click', () => {
  const t = todayStr();
  const mount = state.tab === 'me' ? els.meList : els.agendaList;
  const el = mount.querySelector(`[data-date="${t}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else notice(`Tiada slot pada hari ini (${fmtDate(t)}) dalam tempoh ${state.period}.`);
});

els.meSave.addEventListener('click', () => {
  if (!els.meSelect.value) return;
  state.myKey = els.meSelect.value;
  localStorage.setItem(LS_NAME, state.myKey);
  renderMe();
});
els.meChange.addEventListener('click', () => {
  state.myKey = '';
  localStorage.removeItem(LS_NAME);
  renderMe();
});

/* Boot: tanpa tempoh tersimpan, guna tempoh ACTIVE terkini daripada API */
(async function boot() {
  try {
    if (!state.period) {
      const r = await fetch(API);
      const j = await r.json();
      if (r.ok && j.ok) {
        state.data = j.data;
        state.period = state.data.roster.periodKey;
        localStorage.setItem(LS_PERIOD, state.period);
        renderAll();
        return;
      }
      throw new Error((j && j.error) || 'API tidak tersedia');
    }
    await loadPeriod(state.period);
  } catch (e) {
    // Cuba fallback luar talian yang diketahui
    try {
      const idx = await (await fetch('data/index.json')).json();
      const latest = (idx.periods || []).sort().reverse()[0];
      if (!latest) throw new Error('tiada data luar talian');
      const r = await fetch(`data/roster-${latest}.json`);
      const j = await r.json();
      state.data = j.ok ? j.data : j;
      state.period = state.data.roster.periodKey;
      state.offline = true;
      renderAll();
      notice('Mod luar talian: API tidak dapat dihubungi, memaparkan data sandaran.');
    } catch (e2) {
      $('agendaList').innerHTML = `<div class="empty">Gagal memuatkan roster.<br>${esc(e.message)}<br><br><button class="btn primary" onclick="location.reload()" type="button">Cuba lagi</button></div>`;
    }
  }
})();
