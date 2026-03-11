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
let weekStart   = null;   // Date object: Sunday of the displayed week
let calDayCache = {};     // { 'YYYY-MM-DD': dayObject | null }

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
    if (day.services.greatVespers) {
      rows.push({ key: 'greatVespers', name: 'Great Vespers', available: true });
    }
    rows.push({ key: 'matins',       name: 'Matins',        available: false });
    rows.push({ key: 'liturgy',      name: 'Divine Liturgy', available: false });
    rows.push({ key: 'dailyVespers', name: 'Daily Vespers',  available: day.services.dailyVespers });
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
  const svcLabel = svcType === 'dailyVespers' ? 'DAILY VESPERS' : 'GREAT VESPERS';
  document.getElementById('p-svc').textContent = svcLabel;
  document.getElementById('print-header-svc').textContent = svcLabel;

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
      const fallbackDate = formatLong(date);
      document.getElementById('p-date').textContent = fallbackDate;
      document.getElementById('print-header-date').textContent = fallbackDate;
      return;
    }

    const toneStr  = data.tone ? ` \u00B7 Tone ${data.tone}` : '';
    const labelStr = data.liturgicalLabel ? ` \u00B7 ${data.liturgicalLabel}` : '';
    const dateStr = `${formatLong(date)}${toneStr}${labelStr}`;
    document.getElementById('p-date').textContent = dateStr;
    document.getElementById('print-header-date').textContent = dateStr;

    // Populate saints list; auto-expand detail section when there are commemorations
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

function sundayOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

async function fetchCalWeek(sunday) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(d.getDate() + i);
    dates.push(toIso(d));
  }
  // Only fetch dates not already cached
  const missing = dates.filter(ds => !(ds in calDayCache));
  if (missing.length) {
    try {
      const data = await fetchDays(missing[0], missing[missing.length - 1]);
      // Index by date
      const byDate = {};
      for (const d of data) byDate[d.date] = d;
      for (const ds of missing) calDayCache[ds] = byDate[ds] || null;
    } catch (err) {
      console.error('fetchCalWeek error:', err);
      for (const ds of missing) calDayCache[ds] = null;
    }
  }
}

function openCal() {
  closeSearch(/*silent=*/true);
  document.getElementById('view-main').classList.add('hidden');
  document.getElementById('date-btn').classList.add('active');
  document.getElementById('view-cal').classList.add('visible');
  if (!weekStart) weekStart = sundayOf(new Date());
  fetchCalWeek(weekStart).then(() => renderWeek(weekStart));
  setTimeout(() => {
    document.getElementById('cal-week-wrap').classList.add('in');
    document.getElementById('cal-saint-strip').classList.add('in');
  }, 100);
}

function closeCal() {
  document.getElementById('view-cal').classList.remove('visible');
  document.getElementById('view-main').classList.remove('hidden');
  document.getElementById('date-btn').classList.remove('active');
  setTimeout(() => {
    document.getElementById('cal-week-wrap').classList.remove('in');
    document.getElementById('cal-saint-strip').classList.remove('in');
  }, 400);
}

function calShift(dir) {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + dir * 7);
  weekStart = next;

  const strip = document.getElementById('cal-week-strip');
  const feast = document.getElementById('cal-saint-strip');
  strip.classList.add('shifting');
  feast.classList.remove('in');

  fetchCalWeek(next).then(() => {
    setTimeout(() => {
      renderWeek(next);
      strip.classList.remove('shifting');
      requestAnimationFrame(() => requestAnimationFrame(() => feast.classList.add('in')));
    }, 180);
  });
}

function renderWeek(sunday) {
  const today    = todayStr();
  const monthSet = new Set();

  let stripHtml  = '';
  const weekFeasts = [];

  for (let i = 0; i < 7; i++) {
    const d    = new Date(sunday);
    d.setDate(d.getDate() + i);
    const ds   = toIso(d);
    const mo   = d.getMonth();
    const day  = d.getDate();
    monthSet.add(MONTH_NAMES[mo]);

    const dayObj  = calDayCache[ds] || null;
    const isToday = ds === today;
    const hasSvc  = dayObj && (dayObj.services.greatVespers || dayObj.services.dailyVespers);

    let cls = 'cal-week-day';
    if (hasSvc)  cls += ' has-svc';
    if (isToday) cls += ' today';

    stripHtml += `<div class="${cls}" data-date="${ds}" data-has="${hasSvc ? '1' : ''}">
      <span class="cwd-dow">${DOW_ABBR[d.getDay()]}</span>
      <span class="cwd-num">${day}</span>
      <span class="cwd-month">${MONTH_ABBR[mo].toUpperCase()}</span>
      <span class="cwd-dot"></span>
    </div>`;

    if (dayObj) weekFeasts.push({ ds, day, mo, dayObj, hasSvc });
  }

  document.getElementById('cal-week-strip').innerHTML = stripHtml;

  // Week label
  const monthNames = [...monthSet];
  const label = monthNames.length > 1
    ? `${MONTH_ABBR[new Date(sunday).getMonth()].toUpperCase()} / ${MONTH_ABBR[new Date(sunday.getTime() + 6*86400000).getMonth()].toUpperCase()} ${sunday.getFullYear()}`
    : `${monthNames[0]} ${sunday.getFullYear()}`;
  document.getElementById('cal-week-label').textContent = label;

  // Wire up day clicks
  document.querySelectorAll('.cal-week-day.has-svc').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      closeCal();
      setTimeout(() => {
        jumpToDate(date);
        const dayObj = calDayCache[date];
        if (dayObj) {
          const svc = dayObj.services.greatVespers ? 'greatVespers' : 'dailyVespers';
          const btn = document.querySelector(`.svc-row[data-date="${date}"][data-svc="${svc}"]`);
          if (btn) openPanel(btn, date, svc);
        }
      }, 280);
    });
  });

  // Feast list
  const rows = document.getElementById('css-rows');
  if (!weekFeasts.length) {
    rows.innerHTML = `<div style="font-family:'EB Garamond',serif;font-size:16px;font-style:italic;color:var(--muted);padding:16px 0;">No feasts or services this week.</div>`;
    return;
  }

  rows.innerHTML = weekFeasts.map(({ ds, day, mo, dayObj, hasSvc }) => {
    const label = dayObj.liturgicalLabel || dayObj.feast || dayObj.displayDay;
    const abbr  = `${MONTH_ABBR[mo]} ${day}`;
    const svc   = dayObj.services.greatVespers ? 'greatVespers' : 'dailyVespers';
    const cls   = hasSvc ? 'css-row' : 'css-row unavail';
    return `<button class="${cls}" data-date="${ds}" data-svc="${svc}">
      <span class="css-date">${abbr}</span>
      <span class="css-name">${label}</span>
      <span class="css-tag">${hasSvc ? 'VIEW \u2192' : 'NO SERVICE'}</span>
    </button>`;
  }).join('');

  rows.querySelectorAll('.css-row:not(.unavail)').forEach(row => {
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
        calDayCache[day.date] = day;
      }
      weekStart = sundayOf(anchor);
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

  weekStart = sundayOf(anchor);

  try {
    days = await fetchDays(from, to);
    renderServiceList(days);

    // Pre-populate calendar day cache from loaded days
    for (const day of days) {
      calDayCache[day.date] = day;
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
    } else {
      jumpToDate(todayStr());
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
