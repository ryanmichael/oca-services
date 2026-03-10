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
let calMonth = null;   // { year, month } (month = 0-based)
let calDots = {};      // { 'YYYY-MM-DD': true }

// ─── Date utilities ───────────────────────────────────────────────────────────

const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                     'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const DOW_NAMES   = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

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

function todayStr() {
  return toIso(new Date());
}

/** Format YYYY-MM-DD as "Saturday, March 14, 2026" */
function formatLong(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Format YYYY-MM-DD as "MARCH 14" */
function formatDisplayDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}`;
}

/** Format YYYY-MM-DD as "SATURDAY" */
function formatDow(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return DOW_NAMES[date.getDay()];
}

/** Given two ISO date strings, format as "MARCH 7 – 14, 2026" */
function formatWeekRange(startStr, endStr) {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [, em, ed] = endStr.split('-').map(Number);
  if (sm === em) {
    return `${MONTH_NAMES[sm - 1]} ${sd} \u2013 ${ed}, ${sy}`;
  }
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

/** Determine which service rows to show for a given day entry */
function getServiceRows(day) {
  const dow = day.dayOfWeek;
  const rows = [];

  if (dow === 'saturday') {
    rows.push({
      key: 'greatVespers',
      name: 'Great Vespers',
      available: day.services.greatVespers,
    });
    if (day.services.dailyVespers) {
      rows.push({ key: 'dailyVespers', name: 'Daily Vespers', available: true });
    }
    rows.push({ key: 'matins',   name: 'Matins',        available: false });
    rows.push({ key: 'liturgy',  name: 'Divine Liturgy', available: false });
  } else if (dow === 'sunday') {
    rows.push({ key: 'greatVespers', name: 'Great Vespers', available: false });
    rows.push({ key: 'matins',       name: 'Matins',        available: false });
    rows.push({ key: 'liturgy',      name: 'Divine Liturgy', available: false });
  } else {
    // Weekday (Mon–Fri)
    rows.push({
      key: 'dailyVespers',
      name: 'Daily Vespers',
      available: day.services.dailyVespers,
    });
  }

  return rows;
}

/** Determine whether a day block should be shown in the list */
function shouldShowDay(day) {
  const { dayOfWeek: dow, services } = day;
  if (dow === 'saturday' || dow === 'sunday') return true;
  return services.dailyVespers || services.greatVespers;
}

function renderServiceList(daysList) {
  const today = todayStr();
  const listEl = document.getElementById('service-list');
  listEl.innerHTML = '';

  for (const day of daysList) {
    if (!shouldShowDay(day)) continue;

    const isToday = day.date === today;
    const dowLabel = isToday ? `TODAY \u2014 ${day.displayDay}` : day.displayDay;
    const dowStyle = isToday ? 'style="color:var(--text)"' : '';

    const feastLabel = day.liturgicalLabel || day.feast || '';

    const headingHtml = `
      <div class="date-heading">
        <span class="dow" ${dowStyle}>${dowLabel}</span>
        <span class="date-d">${day.displayDate}</span>
        ${feastLabel ? `<span class="feast">\u00B7 ${feastLabel}</span>` : ''}
      </div>`;

    const serviceRows = getServiceRows(day);
    const rowsHtml = serviceRows.map(row => {
      if (row.available) {
        return `<button class="svc-row" data-date="${day.date}" data-svc="${row.key}">
          <span class="name">${row.name}</span>
          <span class="arrow">VIEW \u2192</span>
        </button>`;
      } else {
        return `<button class="svc-row dimmed" disabled>
          <span class="name">${row.name}</span>
          <span class="soon">COMING SOON</span>
        </button>`;
      }
    }).join('');

    const block = document.createElement('div');
    block.className = 'date-block';
    block.id = `date-${day.date}`;
    block.dataset.date = day.date;
    block.innerHTML = headingHtml + `<div class="svc-rows">${rowsHtml}</div>`;

    listEl.appendChild(block);
  }

  listEl.querySelectorAll('.svc-row:not(.dimmed)').forEach(btn => {
    btn.addEventListener('click', () => {
      openPanel(btn, btn.dataset.date, btn.dataset.svc);
    });
  });

  initScrollTracker();
}

// ─── URL / History helpers ────────────────────────────────────────────────────

function getUrlParams() {
  const p = new URLSearchParams(location.search);
  return { date: p.get('date') || null, svc: p.get('svc') || null };
}

function setUrlState(date, svcType, replace = false) {
  const url = svcType ? `?date=${date}&svc=${svcType}` : (date ? `?date=${date}` : location.pathname);
  const state = { date, svcType: svcType || null };
  if (replace) history.replaceState(state, '', url);
  else         history.pushState(state, '', url);
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/** Internal: show panel content without touching history. */
async function _showPanel(rowEl, date, svcType) {
  if (activeRow) activeRow.classList.remove('active');
  activeRow = rowEl;
  if (rowEl) rowEl.classList.add('active');
  activeDate    = date;
  activeSvcType = svcType;
  document.getElementById('p-svc').textContent =
    svcType === 'dailyVespers' ? 'DAILY VESPERS' : 'GREAT VESPERS';
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
    document.getElementById('p-date').textContent =
      `${formatLong(date)}${toneStr}${labelStr}`;

    const commsEl = document.getElementById('p-comms');
    const comms = data.commemorations || [];
    if (comms.length > 0) {
      const principal = comms.find(c => c.isPrincipal) || comms[0];
      const others    = comms.filter(c => !c.isPrincipal);
      let html = `<span class="comm-principal">${principal.title}</span>`;
      if (others.length > 0) {
        html += `<span class="comm-others">`;
        others.forEach(c => { html += `<br>${c.title}`; });
        html += `</span>`;
      }
      commsEl.innerHTML = html;
    } else {
      commsEl.textContent = '';
    }

    // Render blocks
    const html = window.renderBlocks(data.blocks);
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

// ─── Pronoun toggle ───────────────────────────────────────────────────────────

function initPronounToggle() {
  document.getElementById('btn-thee').addEventListener('click', () => setPronoun('tt'));
  document.getElementById('btn-you').addEventListener('click',  () => setPronoun('yy'));
}

function setPronoun(pronoun) {
  if (pronoun === activePronoun) return;
  activePronoun = pronoun;
  document.getElementById('btn-thee').classList.toggle('active', pronoun === 'tt');
  document.getElementById('btn-you').classList.toggle('active',  pronoun === 'yy');
  // Re-render panel if open
  if (activeDate && activeSvcType) {
    loadPanelContent(activeDate, activeSvcType);
  }
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
      if (entry.isIntersecting) {
        visibleDates.add(date);
      } else {
        visibleDates.delete(date);
      }
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
  if (visibleDates.size === 0) return;
  const sorted = [...visibleDates].sort();
  const first = sorted[0];
  const last  = sorted[sorted.length - 1];
  document.getElementById('week-label').textContent = formatWeekRange(first, last);
}

// ─── Calendar popover ─────────────────────────────────────────────────────────

function toggleCal() {
  const pop = document.getElementById('cal-popover');
  const btn = document.getElementById('date-btn');
  const ov  = document.getElementById('cal-overlay');
  const isOpen = pop.classList.contains('open');
  if (!isOpen) {
    pop.classList.add('open');
    btn.classList.add('active');
    ov.classList.add('active');
    renderCalendar();
    fetchCalDots();
  } else {
    closeCal();
  }
}

function closeCal() {
  document.getElementById('cal-popover').classList.remove('open');
  document.getElementById('date-btn').classList.remove('active');
  document.getElementById('cal-overlay').classList.remove('active');
}

function renderCalendar() {
  if (!calMonth) return;
  const { year, month } = calMonth;

  const monthLabel = document.getElementById('cal-month-label');
  monthLabel.textContent = `${MONTH_NAMES[month]} ${year}`;

  const grid = document.getElementById('cal-grid');
  const headers = Array.from(grid.querySelectorAll('.cal-dow'));
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;

    if (dateStr === today) cell.classList.add('today');
    if (calDots[dateStr]) {
      cell.classList.add('has-service');
      cell.addEventListener('click', () => {
        jumpToDate(dateStr);
        closeCal();
      });
    }

    grid.appendChild(cell);
  }
}

async function fetchCalDots() {
  if (!calMonth) return;
  const { year, month } = calMonth;
  const from = `${year}-${String(month + 1).padStart(2,'0')}-01`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2,'0')}-${daysInMonth}`;

  try {
    const data = await fetchDays(from, to);
    const newDots = {};
    for (const day of data) {
      if (day.services.greatVespers || day.services.dailyVespers) {
        newDots[day.date] = true;
      }
    }
    calDots = { ...calDots, ...newDots };
    renderCalendar();
  } catch (err) {
    console.error('fetchCalDots error:', err);
  }
}

function jumpToDate(dateStr) {
  const el = document.getElementById(`date-${dateStr}`);
  const center = document.getElementById('center');
  if (el && center) {
    const top = el.offsetTop - 56;
    center.scrollTo({ top, behavior: 'smooth' });
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

let searchTimeout = null;
let spinnerTimeout = null;

function openSearch() {
  document.getElementById('view-main').classList.add('hidden');
  document.getElementById('view-search').classList.add('visible');
  // Animate input and hint in
  requestAnimationFrame(() => {
    document.getElementById('search-input-wrap').classList.add('ready');
    document.getElementById('search-hint').classList.add('ready');
  });
  setTimeout(() => document.getElementById('search-input').focus(), 80);
}

function closeSearch() {
  document.getElementById('view-search').classList.remove('visible');
  document.getElementById('view-main').classList.remove('hidden');
  // Reset after transition
  setTimeout(resetSearch, 400);
}

function resetSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('search-clear').classList.remove('visible');
  showHint();
  document.getElementById('search-spinner').classList.remove('visible');
  document.getElementById('search-results').classList.remove('visible');
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input-wrap').classList.remove('ready');
  document.getElementById('search-hint').classList.remove('ready', 'hiding');
  if (searchTimeout) clearTimeout(searchTimeout);
  if (spinnerTimeout) clearTimeout(spinnerTimeout);
}

function showHint() {
  const hint = document.getElementById('search-hint');
  hint.classList.remove('hiding');
  // Force reflow then re-show
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      hint.style.display = '';
      hint.classList.add('ready');
    });
  });
}

function hideHint() {
  const hint = document.getElementById('search-hint');
  hint.classList.add('hiding');
  setTimeout(() => {
    hint.style.display = 'none';
  }, 280);
}

function onSearchInput() {
  const raw = document.getElementById('search-input').value;
  const q = raw.trim();

  // Show/hide clear button
  document.getElementById('search-clear').classList.toggle('visible', raw.length > 0);

  if (searchTimeout) clearTimeout(searchTimeout);
  if (spinnerTimeout) clearTimeout(spinnerTimeout);

  if (q.length < 2) {
    // Back to idle state
    document.getElementById('search-spinner').classList.remove('visible');
    document.getElementById('search-results').classList.remove('visible');
    document.getElementById('search-results').innerHTML = '';
    showHint();
    return;
  }

  // Hide hints, show spinner after short delay
  hideHint();
  document.getElementById('search-results').classList.remove('visible');
  document.getElementById('search-results').innerHTML = '';

  spinnerTimeout = setTimeout(() => {
    document.getElementById('search-spinner').classList.add('visible');
  }, 80);

  // Debounce search
  searchTimeout = setTimeout(() => doSearch(q), 300);
}

async function doSearch(q) {
  try {
    const results = await fetchSearch(q);

    if (spinnerTimeout) clearTimeout(spinnerTimeout);
    document.getElementById('search-spinner').classList.remove('visible');

    // Small delay for intentional feel
    setTimeout(() => renderResults(results, q), 80);
  } catch (err) {
    console.error('Search error:', err);
    document.getElementById('search-spinner').classList.remove('visible');
  }
}

function highlightMatch(text, query) {
  // Escape regex special chars
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<em>$1</em>');
}

function renderResults(results, query) {
  const area = document.getElementById('search-results');
  area.innerHTML = '';

  if (results.length === 0) {
    area.innerHTML = `<div class="results-empty">No saints or feasts matching \u201C${query}\u201D.</div>`;
    area.classList.add('visible');
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
    if (r.available) {
      btn.addEventListener('click', () => pickResult(r.dateStr, r.svcType));
    }
    area.appendChild(btn);

    // Staggered entrance animation
    setTimeout(() => btn.classList.add('shown'), i * 30);
  });

  area.classList.add('visible');
}

function fillSearch(query) {
  const input = document.getElementById('search-input');
  input.value = query;
  document.getElementById('search-clear').classList.add('visible');
  onSearchInput();
}

function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('search-clear').classList.remove('visible');
  input.focus();
  onSearchInput();
}

async function pickResult(dateStr, svcType) {
  closeSearch();

  // Wait for close animation before manipulating the main view
  await new Promise(r => setTimeout(r, 300));

  // If the date isn't in the current view, load a range around it first
  let btn = document.querySelector(`.svc-row[data-date="${dateStr}"][data-svc="${svcType}"]`);
  if (!btn) {
    const anchor = new Date(dateStr + 'T12:00:00');
    const from = toIso(addDays(anchor, -7));
    const to   = toIso(addDays(anchor, 28));
    try {
      days = await fetchDays(from, to);
      renderServiceList(days);
      for (const day of days) {
        if (day.services.greatVespers || day.services.dailyVespers) calDots[day.date] = true;
      }
      calMonth = { year: anchor.getFullYear(), month: anchor.getMonth() };
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
  // Panel close + print
  document.getElementById('btn-close').addEventListener('click', closePanel);
  document.getElementById('btn-print').addEventListener('click', () => window.print());

  // Pronoun toggle
  initPronounToggle();

  // Calendar button
  document.getElementById('date-btn').addEventListener('click', toggleCal);
  document.getElementById('cal-overlay').addEventListener('click', closeCal);
  document.getElementById('cal-prev').addEventListener('click', () => {
    if (!calMonth) return;
    let { year, month } = calMonth;
    month--;
    if (month < 0) { month = 11; year--; }
    calMonth = { year, month };
    renderCalendar();
    fetchCalDots();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    if (!calMonth) return;
    let { year, month } = calMonth;
    month++;
    if (month > 11) { month = 0; year++; }
    calMonth = { year, month };
    renderCalendar();
    fetchCalDots();
  });

  // Search button
  document.getElementById('search-btn').addEventListener('click', openSearch);
  document.getElementById('search-back').addEventListener('click', closeSearch);
  document.getElementById('search-close-mobile').addEventListener('click', closeSearch);
  document.getElementById('search-input').addEventListener('input', onSearchInput);
  document.getElementById('search-clear').addEventListener('click', clearSearch);

  // Hint tags
  document.querySelectorAll('.hint-tag').forEach(tag => {
    tag.addEventListener('click', () => fillSearch(tag.dataset.query));
  });

  // Escape key closes search
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('view-search').classList.contains('visible')) {
        closeSearch();
      }
    }
  });

  // Read permalink params
  const { date: urlDate, svc: urlSvc } = getUrlParams();

  const today  = new Date();
  const anchor = (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate))
    ? new Date(urlDate + 'T12:00:00')
    : today;
  const from = toIso(addDays(anchor, -7));
  const to   = toIso(addDays(anchor, 28));

  calMonth = { year: anchor.getFullYear(), month: anchor.getMonth() };

  try {
    days = await fetchDays(from, to);
    renderServiceList(days);

    for (const day of days) {
      if (day.services.greatVespers || day.services.dailyVespers) {
        calDots[day.date] = true;
      }
    }

    if (urlDate) {
      jumpToDate(urlDate);
      if (urlSvc) {
        const btn = document.querySelector(`.svc-row[data-date="${urlDate}"][data-svc="${urlSvc}"]`);
        if (btn) {
          setUrlState(urlDate, urlSvc, /*replace=*/true);
          await _showPanel(btn, urlDate, urlSvc);
        }
      } else {
        setUrlState(urlDate, null, /*replace=*/true);
      }
    }
  } catch (err) {
    console.error('Failed to load days:', err);
    document.getElementById('service-list').innerHTML =
      `<p style="font-family:'EB Garamond',serif;color:var(--muted);padding:20px">
        Failed to load services: ${err.message}
      </p>`;
  }

  // Restore panel state on browser back/forward
  window.addEventListener('popstate', async (e) => {
    const state = e.state || {};
    if (state.date && state.svcType) {
      const btn = document.querySelector(`.svc-row[data-date="${state.date}"][data-svc="${state.svcType}"]`);
      if (btn) {
        await _showPanel(btn, state.date, state.svcType);
      } else {
        location.reload();
      }
    } else {
      closePanel(/*skipHistory=*/true);
      if (state.date) jumpToDate(state.date);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
