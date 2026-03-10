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
let activePronoun = 'tt';
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

async function fetchService(date, svcType, pronoun) {
  const res = await fetch(`/api/service?date=${date}&pronoun=${pronoun}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`/api/service failed: ${res.status}`);
  }
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
  // Always show Saturdays and Sundays
  if (dow === 'saturday' || dow === 'sunday') return true;
  // Show weekdays only if they have a service
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

    // Build feast/label string
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

  // Attach click handlers to available service rows
  listEl.querySelectorAll('.svc-row:not(.dimmed)').forEach(btn => {
    btn.addEventListener('click', () => {
      openPanel(btn, btn.dataset.date, btn.dataset.svc);
    });
  });

  // Initialize IntersectionObserver for week-label
  initScrollTracker();
}

// ─── Panel ────────────────────────────────────────────────────────────────────

async function openPanel(rowEl, date, svcType) {
  // Update active row styling
  if (activeRow) activeRow.classList.remove('active');
  activeRow = rowEl;
  rowEl.classList.add('active');

  activeDate = date;
  activeSvcType = svcType;

  // Update panel header immediately
  document.getElementById('p-svc').textContent =
    svcType === 'dailyVespers' ? 'DAILY VESPERS' : 'GREAT VESPERS';
  document.getElementById('p-body').innerHTML = '<div class="panel-loading">Loading\u2026</div>';
  document.getElementById('panel').classList.add('open');

  await loadPanelContent(date, svcType, activePronoun);
}

async function loadPanelContent(date, svcType, pronoun) {
  try {
    const data = await fetchService(date, svcType, pronoun);

    if (!data) {
      document.getElementById('p-body').innerHTML =
        '<div class="panel-loading">Service not available for this date.</div>';
      document.getElementById('p-date').textContent = formatLong(date);
      return;
    }

    // Build date string for panel header
    const toneStr = data.tone ? ` \u00B7 Tone ${data.tone}` : '';
    const labelStr = data.liturgicalLabel ? ` \u00B7 ${data.liturgicalLabel}` : '';
    document.getElementById('p-date').textContent =
      `${formatLong(date)}${toneStr}${labelStr}`;

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

function closePanel() {
  document.getElementById('panel').classList.remove('open');
  if (activeRow) { activeRow.classList.remove('active'); activeRow = null; }
  activeDate = null;
  activeSvcType = null;
}

// ─── Pronoun toggle ───────────────────────────────────────────────────────────

function onPronounChange(val) {
  activePronoun = val;
  if (activeDate && activeSvcType) {
    loadPanelContent(activeDate, activeSvcType, activePronoun);
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

  // Set initial week label from first visible block
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
  const ov  = document.getElementById('overlay');
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
  document.getElementById('overlay').classList.remove('active');
}

function renderCalendar() {
  if (!calMonth) return;
  const { year, month } = calMonth;  // month = 0-based

  const monthLabel = document.getElementById('cal-month-label');
  monthLabel.textContent = `${MONTH_NAMES[month]} ${year}`;

  // Rebuild grid (preserve day-of-week header rows)
  const grid = document.getElementById('cal-grid');
  // Remove all day cells (keep the 7 DOW header divs)
  const headers = Array.from(grid.querySelectorAll('.cal-dow'));
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  // Empty cells before the 1st
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

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Set up pronoun toggle
  document.getElementById('pron-tt').addEventListener('change', () => onPronounChange('tt'));
  document.getElementById('pron-yy').addEventListener('change', () => onPronounChange('yy'));

  // Close button and print
  document.getElementById('btn-close').addEventListener('click', closePanel);
  document.getElementById('btn-print').addEventListener('click', () => window.print());

  // Calendar button
  document.getElementById('date-btn').addEventListener('click', toggleCal);
  document.getElementById('overlay').addEventListener('click', closeCal);
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

  // Determine date range: today - 7 days through today + 28 days
  const today = new Date();
  const from  = toIso(addDays(today, -7));
  const to    = toIso(addDays(today, 28));

  // Init calendar state to current month
  calMonth = { year: today.getFullYear(), month: today.getMonth() };

  try {
    days = await fetchDays(from, to);
    renderServiceList(days);

    // Pre-populate calDots for current range
    for (const day of days) {
      if (day.services.greatVespers || day.services.dailyVespers) {
        calDots[day.date] = true;
      }
    }
  } catch (err) {
    console.error('Failed to load days:', err);
    document.getElementById('service-list').innerHTML =
      `<p style="font-family:'EB Garamond',serif;color:var(--muted);padding:20px">
        Failed to load services: ${err.message}
      </p>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
