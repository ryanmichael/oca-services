/**
 * app.js
 *
 * Main frontend application for the Orthodox Daily Services browser.
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let days = [];
let activeRow = null;
let activeDate = null;
let activeSvcType = null;
let activePronoun = 'tt';  // 'tt' or 'yy'
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;  // 1-indexed
let calDaysCache = {};  // { 'YYYY-MM': [...dayObjects] }

// ─── Date utilities ───────────────────────────────────────────────────────────

const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                     'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun',
                     'Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_NAMES   = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const DOW_ABBR    = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function todayStr() { return toIso(new Date()); }

/** Format YYYY-MM-DD as "Saturday, March 14, 2026" */
function formatLong(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

/** Given two ISO date strings, format as "MARCH 7 – 14, 2026" */
function formatWeekRange(startStr, endStr) {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [, em, ed]   = endStr.split('-').map(Number);
  if (sm === em) return `${MONTH_NAMES[sm - 1]} ${sd} \u2013 ${ed}, ${sy}`;
  return `${MONTH_NAMES[sm - 1]} ${sd} \u2013 ${MONTH_NAMES[em - 1]} ${ed}, ${sy}`;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchDays(from, to) {
  const res = await fetch(`/api/days?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`/api/days failed: ${res.status}`);
  return res.json();
}

async function fetchService(date, svcType, pronoun = 'tt') {
  const res = await fetch(`/api/service?date=${date}&pronoun=${pronoun}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`/api/service failed: ${res.status}`);
  }
  return res.json();
}

async function fetchSearch(query) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`/api/search failed: ${res.status}`);
  return res.json();
}

// ─── Service list rendering ───────────────────────────────────────────────────

function getServiceRows(day) {
  const dow = day.dayOfWeek;
  const rows = [];

  if (dow === 'saturday') {
    rows.push({ key: 'greatVespers', name: 'Great Vespers',  available: day.services.greatVespers });
    if (day.services.dailyVespers) rows.push({ key: 'dailyVespers', name: 'Daily Vespers', available: true });
    rows.push({ key: 'matins',  name: 'Matins',        available: false });
    rows.push({ key: 'liturgy', name: 'Divine Liturgy', available: false });
  } else if (dow === 'sunday') {
    rows.push({ key: 'greatVespers', name: 'Great Vespers',  available: false });
    rows.push({ key: 'matins',       name: 'Matins',        available: false });
    rows.push({ key: 'liturgy',      name: 'Divine Liturgy', available: false });
  } else {
    rows.push({ key: 'dailyVespers', name: 'Daily Vespers', available: day.services.dailyVespers });
  }

  return rows;
}

function shouldShowDay(day) {
  const { dayOfWeek: dow, services } = day;
  if (dow === 'saturday' || dow === 'sunday') return true;
  return services.dailyVespers || services.greatVespers;
}

function renderServiceList(daysList) {
  const today  = todayStr();
  const listEl = document.getElementById('service-list');
  listEl.innerHTML = '';

  for (const day of daysList) {
    if (!shouldShowDay(day)) continue;

    const isToday  = day.date === today;
    const dowLabel = isToday ? `TODAY \u2014 ${day.displayDay}` : day.displayDay;
    const dowStyle = isToday ? 'style="color:var(--text)"' : '';
    const feastLabel = day.liturgicalLabel || day.feast || '';

    const headingHtml = `
      <div class="date-heading">
        <span class="dow" ${dowStyle}>${dowLabel}</span>
        <span class="date-d">${day.displayDate}</span>
        ${feastLabel ? `<span class="feast">\u00B7 ${feastLabel}</span>` : ''}
      </div>`;

    const rowsHtml = getServiceRows(day).map(row => {
      if (row.available) {
        return `<button class="svc-row" data-date="${day.date}" data-svc="${row.key}">
          <span class="name">${row.name}</span>
          <span class="arrow">VIEW \u2192</span>
        </button>`;
      }
      return `<button class="svc-row dimmed" disabled>
        <span class="name">${row.name}</span>
        <span class="soon">COMING SOON</span>
      </button>`;
    }).join('');

    const block = document.createElement('div');
    block.className = 'date-block';
    block.id = `date-${day.date}`;
    block.dataset.date = day.date;
    block.innerHTML = headingHtml + `<div class="svc-rows">${rowsHtml}</div>`;
    listEl.appendChild(block);
  }

  listEl.querySelectorAll('.svc-row:not(.dimmed)').forEach(btn => {
    btn.addEventListener('click', () => openPanel(btn, btn.dataset.date, btn.dataset.svc));
  });

  initScrollTracker();
}

// ─── URL / History helpers ────────────────────────────────────────────────────

function getUrlParams() {
  const p = new URLSearchParams(location.search);
  return { date: p.get('date') || null, svc: p.get('svc') || null };
}

function setUrlState(date, svcType, replace = false) {
  const url   = svcType ? `?date=${date}&svc=${svcType}` : (date ? `?date=${date}` : location.pathname);
  const state = { date, svcType: svcType || null };
  if (replace) history.replaceState(state, '', url);
  else         history.pushState(state, '', url);
}

// ─── Panel ────────────────────────────────────────────────────────────────────

async function _showPanel(rowEl, date, svcType) {
  if (activeRow) activeRow.classList.remove('active');
  activeRow     = rowEl;
  activeDate    = date;
  activeSvcType = svcType;
  if (rowEl) rowEl.classList.add('active');
  document.getElementById('p-svc').textContent =
    svcType === 'dailyVespers' ? 'DAILY VESPERS' : 'GREAT VESPERS';

  // Collapse detail section on each new panel open
  document.getElementById('p-detail-body').classList.remove('open');
  document.getElementById('p-detail-toggle').classList.remove('open');

  document.getElementById('p-body').innerHTML = '<div class="panel-loading">Loading\u2026</div>';
  document.getElementById('panel').classList.add('open');
  document.body.classList.add('panel-open');
  await loadPanelContent(date, svcType);
}

async function openPanel(rowEl, date, svcType) {
  setUrlState(date, svcType);
  await _showPanel(rowEl, date, svcType);
}

async function loadPanelContent(date, svcType) {
  try {
    const data = await fetchService(date, svcType, activePronoun);
    if (!data) {
      document.getElementById('p-body').innerHTML =
        '<div class="panel-loading">Service not available for this date.</div>';
      document.getElementById('p-date').textContent = formatLong(date);
      return;
    }

    const toneStr  = data.tone ? ` \u00B7 Tone ${data.tone}` : '';
    const labelStr = data.liturgicalLabel ? ` \u00B7 ${data.liturgicalLabel}` : '';
    document.getElementById('p-date').textContent = `${formatLong(date)}${toneStr}${labelStr}`;

    // Populate saints list
    const comms    = data.commemorations || [];
    const saintsEl = document.getElementById('p-saints');
    if (comms.length > 0) {
      saintsEl.innerHTML = comms.map(c =>
        `<div class="p-saint${c.isPrincipal ? ' major' : ''}">${c.title}</div>`
      ).join('');
      saintsEl.style.display = '';
    } else {
      saintsEl.innerHTML = '';
      saintsEl.style.display = 'none';
    }
    updateDetailLabel();

    const html   = window.renderBlocks(data.blocks);
    const bodyEl = document.getElementById('p-body');
    bodyEl.innerHTML = html;
    bodyEl.scrollTop = 0;
  } catch (err) {
    console.error('Panel load error:', err);
    document.getElementById('p-body').innerHTML =
      `<div class="panel-loading">Error loading service: ${err.message}</div>`;
  }
}

function closePanel(skipHistory = false) {
  document.getElementById('panel').classList.remove('open');
  document.body.classList.remove('panel-open');
  if (!skipHistory) setUrlState(activeDate, null);
  if (activeRow) { activeRow.classList.remove('active'); activeRow = null; }
  activeDate    = null;
  activeSvcType = null;
}

// ─── Panel detail toggle ──────────────────────────────────────────────────────

function togglePanelDetail() {
  const body   = document.getElementById('p-detail-body');
  const toggle = document.getElementById('p-detail-toggle');
  const open   = body.classList.contains('open');
  body.classList.toggle('open', !open);
  toggle.classList.toggle('open', !open);
}

function updateDetailLabel(comms) {
  const pronoun   = document.querySelector('input[name="pron"]:checked')?.value || 'tt';
  const pronLabel = pronoun === 'tt' ? 'THEE / THY' : 'YOU / YOUR';
  const saints    = document.querySelectorAll('#p-saints .p-saint');
  const count     = saints.length;
  document.getElementById('p-detail-label').textContent =
    count ? `${count} COMMEMORATION${count > 1 ? 'S' : ''} \u00B7 ${pronLabel}` : pronLabel;
}

// ─── Pronoun toggle ───────────────────────────────────────────────────────────

function initPronounRadio() {
  document.querySelectorAll('input[name="pron"]').forEach(radio => {
    radio.addEventListener('change', () => {
      activePronoun = radio.value;
      updateDetailLabel();
      if (activeDate && activeSvcType) loadPanelContent(activeDate, activeSvcType);
    });
  });
}

// ─── Scroll tracker ───────────────────────────────────────────────────────────

let visibleDates = new Set();

function initScrollTracker() {
  const blocks = document.querySelectorAll('.date-block');
  if (!blocks.length) return;
  visibleDates.clear();

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const date = entry.target.dataset.date;
      if (entry.isIntersecting) visibleDates.add(date);
      else                      visibleDates.delete(date);
    }
    updateWeekLabel();
  }, { threshold: 0 });

  blocks.forEach(b => observer.observe(b));

  const firstDate = blocks[0]?.dataset.date;
  if (firstDate) {
    const end = toIso(addDays(new Date(firstDate.replace(/-/g, '/')), 6));
    document.getElementById('week-label').textContent = formatWeekRange(firstDate, end);
  }
}

function updateWeekLabel() {
  if (!visibleDates.size) return;
  const sorted = [...visibleDates].sort();
  document.getElementById('week-label').textContent =
    formatWeekRange(sorted[0], sorted[sorted.length - 1]);
}

// ─── Calendar view ────────────────────────────────────────────────────────────

function openCal() {
  closeSearch(/*silent=*/true);
  document.getElementById('view-main').classList.add('hidden');
  document.getElementById('date-btn').classList.add('active');
  document.getElementById('view-cal').classList.add('visible');
  fetchCalMonth(calYear, calMonth).then(() => renderCalMonth(calYear, calMonth));
  setTimeout(() => {
    document.getElementById('cal-month-nav').classList.add('in');
    document.getElementById('cal-grid-wrap').classList.add('in');
    document.getElementById('cal-saint-strip').classList.add('in');
  }, 100);
}

function closeCal() {
  document.getElementById('view-cal').classList.remove('visible');
  document.getElementById('view-main').classList.remove('hidden');
  document.getElementById('date-btn').classList.remove('active');
  setTimeout(() => {
    document.getElementById('cal-month-nav').classList.remove('in');
    document.getElementById('cal-grid-wrap').classList.remove('in');
    document.getElementById('cal-saint-strip').classList.remove('in');
  }, 400);
}

function calShift(dir) {
  calMonth += dir;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  if (calMonth < 1)  { calMonth = 12; calYear--; }

  // Fade grid + strip out, re-render, fade back in
  const grid  = document.getElementById('cal-grid-wrap');
  const strip = document.getElementById('cal-saint-strip');
  grid.classList.remove('in');
  strip.classList.remove('in');

  fetchCalMonth(calYear, calMonth).then(() => {
    setTimeout(() => {
      renderCalMonth(calYear, calMonth);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        grid.classList.add('in');
        strip.classList.add('in');
      }));
    }, 200);
  });
}

async function fetchCalMonth(year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (calDaysCache[key]) return;
  const mm = String(month).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  const from = `${year}-${mm}-01`;
  const to   = `${year}-${mm}-${daysInMonth}`;
  try {
    const data = calDaysCache[key] = await fetchDays(from, to);
    // Also populate calDots for main list
    for (const day of data) {
      if (day.services.greatVespers || day.services.dailyVespers) {
        // stored for potential future use
      }
    }
  } catch (err) {
    console.error('fetchCalMonth error:', err);
    calDaysCache[key] = [];
  }
}

function renderCalMonth(year, month) {
  document.getElementById('cal-month-title').textContent =
    `${MONTH_NAMES[month - 1]} ${year}`;

  const key  = `${year}-${String(month).padStart(2, '0')}`;
  const data = calDaysCache[key] || [];
  const today = todayStr();
  const firstDow    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // Build day lookup: day number → day object
  const byDay = {};
  for (const d of data) {
    const num = parseInt(d.date.slice(8), 10);
    byDay[num] = d;
  }

  // Render grid
  const grid = document.getElementById('cal-grid');
  let html = DOW_ABBR.map(d => `<div class="cg-dow">${d}</div>`).join('');

  for (let i = 0; i < firstDow; i++) html += `<div class="cg-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayObj  = byDay[d];
    const isToday = dateStr === today;
    const hasSvc  = dayObj && (dayObj.services.greatVespers || dayObj.services.dailyVespers);

    let cls = 'cg-day';
    if (!dayObj) cls += ' empty';
    else if (hasSvc) cls += ' has-svc';
    if (isToday) cls = cls.replace(' empty', '') + ' today';

    const onclick = hasSvc ? `data-date="${dateStr}"` : '';
    html += `<div class="${cls}" ${onclick}>${d}</div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cg-day.has-svc').forEach(cell => {
    cell.addEventListener('click', () => {
      closeCal();
      setTimeout(() => jumpToDate(cell.dataset.date), 280);
    });
  });

  // Render saint strip
  const rows = document.getElementById('css-rows');
  const available = data.filter(d => d.services.greatVespers || d.services.dailyVespers);

  if (!available.length) {
    rows.innerHTML = `<div style="font-family:'EB Garamond',serif;font-size:16px;font-style:italic;color:var(--muted);padding:12px 0;">No services available this month.</div>`;
    return;
  }

  rows.innerHTML = available.map(day => {
    const num   = parseInt(day.date.slice(8), 10);
    const label = day.liturgicalLabel || day.feast || day.displayDay;
    const abbr  = `${MONTH_ABBR[month - 1]} ${num}`;
    const svc   = day.services.greatVespers ? 'greatVespers' : 'dailyVespers';
    return `<button class="css-row" data-date="${day.date}" data-svc="${svc}">
      <span class="css-date">${abbr}</span>
      <span class="css-name">${label}</span>
      <span class="css-tag">VIEW \u2192</span>
    </button>`;
  }).join('');

  rows.querySelectorAll('.css-row').forEach(row => {
    row.addEventListener('click', () => {
      const date = row.dataset.date;
      const svc  = row.dataset.svc;
      closeCal();
      setTimeout(() => {
        jumpToDate(date);
        const btn = document.querySelector(`.svc-row[data-date="${date}"][data-svc="${svc}"]`);
        if (btn) openPanel(btn, date, svc);
      }, 280);
    });
  });
}

function jumpToDate(dateStr) {
  const el     = document.getElementById(`date-${dateStr}`);
  const center = document.getElementById('center');
  if (el && center) center.scrollTo({ top: el.offsetTop - 56, behavior: 'smooth' });
}

// ─── Search ───────────────────────────────────────────────────────────────────

let searchTimer  = null;
let spinnerTimer = null;

function openSearch() {
  closeCal();
  document.getElementById('view-main').classList.add('hidden');
  document.getElementById('view-search').classList.add('visible');
  setTimeout(() => {
    document.getElementById('search-input-wrap').classList.add('in');
    document.getElementById('search-hint').classList.add('in');
    document.getElementById('search-input').focus();
  }, 100);
}

function closeSearch(silent = false) {
  if (!document.getElementById('view-search').classList.contains('visible') && silent) return;
  clearTimeout(searchTimer);
  clearTimeout(spinnerTimer);
  document.getElementById('view-search').classList.remove('visible');
  if (!silent) document.getElementById('view-main').classList.remove('hidden');
  setTimeout(resetSearch, 400);
}

function resetSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('search-clear').classList.remove('visible');
  document.getElementById('search-spinner').classList.remove('active');
  document.getElementById('search-results').classList.remove('in');
  document.getElementById('search-results').innerHTML = '';
  // Reset hint: remove .in, show it, then re-add .in on next frame
  const hint = document.getElementById('search-hint');
  hint.classList.remove('in');
  hint.style.display = '';
  document.getElementById('search-input-wrap').classList.remove('in');
}

function onSearchInput() {
  const raw = document.getElementById('search-input').value;
  const q   = raw.trim();

  document.getElementById('search-clear').classList.toggle('visible', raw.length > 0);

  clearTimeout(searchTimer);
  clearTimeout(spinnerTimer);

  if (q.length < 2) {
    document.getElementById('search-spinner').classList.remove('active');
    document.getElementById('search-results').classList.remove('in');
    document.getElementById('search-results').innerHTML = '';

    // Re-show hint with transition
    const hint = document.getElementById('search-hint');
    hint.classList.remove('in');
    hint.style.display = '';
    requestAnimationFrame(() => requestAnimationFrame(() => hint.classList.add('in')));
    return;
  }

  // Hide hint
  const hint = document.getElementById('search-hint');
  hint.classList.remove('in');
  setTimeout(() => { hint.style.display = 'none'; }, 280);

  document.getElementById('search-results').classList.remove('in');
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-spinner').classList.add('active');

  searchTimer = setTimeout(() => doSearch(q), 380);
}

async function doSearch(q) {
  try {
    const results = await fetchSearch(q);
    clearTimeout(spinnerTimer);
    document.getElementById('search-spinner').classList.remove('active');
    setTimeout(() => renderResults(results, q), 80);
  } catch (err) {
    console.error('Search error:', err);
    document.getElementById('search-spinner').classList.remove('active');
  }
}

function highlightMatch(text, query) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<em>$1</em>');
}

function renderResults(results, query) {
  const area = document.getElementById('search-results');
  area.innerHTML = '';

  if (!results.length) {
    area.innerHTML = `<div class="results-empty">No saints or feasts matching \u201C${query}\u201D.</div>`;
    area.classList.add('in');
    return;
  }

  const eyebrow = document.createElement('div');
  eyebrow.className = 'results-eyebrow';
  eyebrow.textContent = `SAINTS & FEASTS MATCHING \u201C${query.toUpperCase()}\u201D`;
  area.appendChild(eyebrow);

  results.forEach((r, i) => {
    const btn = document.createElement('button');
    btn.className = 'result-row' + (r.available ? '' : ' unavailable');
    btn.innerHTML = `
      <span class="result-date">${r.displayDate}</span>
      <span class="result-name">${highlightMatch(r.title, query)}</span>
      <span class="result-tag">${r.available ? 'VIEW \u2192' : 'NO SERVICE'}</span>
    `;
    if (r.available) btn.addEventListener('click', () => pickResult(r.dateStr, r.svcType));
    area.appendChild(btn);
    setTimeout(() => btn.classList.add('in'), i * 30);
  });

  area.classList.add('in');
}

function fillSearch(query) {
  const input = document.getElementById('search-input');
  input.value = query;
  document.getElementById('search-clear').classList.add('visible');
  onSearchInput();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.remove('visible');
  document.getElementById('search-input').focus();
  onSearchInput();
}

async function pickResult(dateStr, svcType) {
  closeSearch();
  await new Promise(r => setTimeout(r, 300));

  let btn = document.querySelector(`.svc-row[data-date="${dateStr}"][data-svc="${svcType}"]`);
  if (!btn) {
    const anchor = new Date(dateStr + 'T12:00:00');
    const from = toIso(addDays(anchor, -7));
    const to   = toIso(addDays(anchor, 28));
    try {
      days = await fetchDays(from, to);
      renderServiceList(days);
      for (const day of days) {
        if (day.services.greatVespers || day.services.dailyVespers) {
          const key = `${new Date(day.date + 'T12:00:00').getFullYear()}-${String(new Date(day.date + 'T12:00:00').getMonth() + 1).padStart(2,'0')}`;
          if (!calDaysCache[key]) calDaysCache[key] = null; // invalidate cache
        }
      }
      calYear  = anchor.getFullYear();
      calMonth = anchor.getMonth() + 1;
    } catch (err) {
      console.error('pickResult: failed to load date range:', err);
      return;
    }
    btn = document.querySelector(`.svc-row[data-date="${dateStr}"][data-svc="${svcType}"]`);
  }

  jumpToDate(dateStr);
  if (btn) openPanel(btn, dateStr, svcType);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Panel
  document.getElementById('btn-close').addEventListener('click', closePanel);
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('p-detail-toggle').addEventListener('click', togglePanelDetail);
  initPronounRadio();

  // Calendar
  document.getElementById('date-btn').addEventListener('click', openCal);
  document.getElementById('cal-back').addEventListener('click', closeCal);
  document.getElementById('cal-close-mobile').addEventListener('click', closeCal);
  document.getElementById('cal-prev').addEventListener('click', () => calShift(-1));
  document.getElementById('cal-next').addEventListener('click', () => calShift(1));

  // Search
  document.getElementById('search-btn').addEventListener('click', openSearch);
  document.getElementById('search-back').addEventListener('click', () => closeSearch());
  document.getElementById('search-close-mobile').addEventListener('click', () => closeSearch());
  document.getElementById('search-input').addEventListener('input', onSearchInput);
  document.getElementById('search-clear').addEventListener('click', clearSearch);
  document.querySelectorAll('.hint-tag').forEach(tag => {
    tag.addEventListener('click', () => fillSearch(tag.dataset.query));
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('view-search').classList.contains('visible')) closeSearch();
    if (document.getElementById('view-cal').classList.contains('visible'))    closeCal();
  });

  // URL params
  const { date: urlDate, svc: urlSvc } = getUrlParams();
  const today  = new Date();
  const anchor = (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate))
    ? new Date(urlDate + 'T12:00:00') : today;
  const from = toIso(addDays(anchor, -7));
  const to   = toIso(addDays(anchor, 28));

  calYear  = anchor.getFullYear();
  calMonth = anchor.getMonth() + 1;

  try {
    days = await fetchDays(from, to);
    renderServiceList(days);

    // Pre-populate calendar cache for current month
    const key = `${calYear}-${String(calMonth).padStart(2,'0')}`;
    if (!calDaysCache[key]) {
      const monthDays = days.filter(d => d.date.startsWith(key));
      if (monthDays.length > 0) calDaysCache[key] = monthDays;
    }

    if (urlDate) {
      jumpToDate(urlDate);
      if (urlSvc) {
        const btn = document.querySelector(`.svc-row[data-date="${urlDate}"][data-svc="${urlSvc}"]`);
        if (btn) {
          setUrlState(urlDate, urlSvc, true);
          await _showPanel(btn, urlDate, urlSvc);
        }
      } else {
        setUrlState(urlDate, null, true);
      }
    }
  } catch (err) {
    console.error('Failed to load days:', err);
    document.getElementById('service-list').innerHTML =
      `<p style="font-family:'EB Garamond',serif;color:var(--muted);padding:20px">
        Failed to load services: ${err.message}
      </p>`;
  }

  window.addEventListener('popstate', async e => {
    const state = e.state || {};
    if (state.date && state.svcType) {
      const btn = document.querySelector(`.svc-row[data-date="${state.date}"][data-svc="${state.svcType}"]`);
      if (btn) await _showPanel(btn, state.date, state.svcType);
      else location.reload();
    } else {
      closePanel(true);
      if (state.date) jumpToDate(state.date);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
