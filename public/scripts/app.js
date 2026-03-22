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
let activePronoun = localStorage.getItem('pronoun') || 'tt';  // 'tt' or 'yy'
let activeMode    = localStorage.getItem('mode') || 'laity';  // 'laity' or 'choir'
let activeEducation = localStorage.getItem('education') || 'off'; // 'on' or 'off'
let educationModules = null; // cached education modules data
let choirData     = null;  // cached choir-prep response for current date
let choirEnabled  = {};    // { svcType: true/false } — which services are toggled on
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
  const endpoint = svcType === 'liturgy'           ? '/api/liturgy'
                 : svcType === 'presanctified'     ? '/api/presanctified'
                 : svcType === 'passionGospels'    ? '/api/passion-gospels'
                 : svcType === 'bridegroomMatins'  ? '/api/bridegroom-matins'
                 : svcType === 'lamentations'      ? '/api/lamentations'
                 : svcType === 'royalHours'       ? '/api/royal-hours'
                 : svcType === 'vesperalLiturgy'  ? '/api/vesperal-liturgy'
                 : svcType === 'paschalHours'      ? '/api/paschal-hours'
                 : svcType === 'paschaCollection'  ? '/api/pascha-collection'
                 : svcType === 'matins'            ? '/api/matins'
                 : svcType === 'burialVespers'     ? '/api/service'
                 : '/api/service';
  const res = await fetch(`${endpoint}?date=${date}&pronoun=${pronoun}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`${endpoint} failed: ${res.status}`);
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

  // Pascha Sunday: single combined service
  if (day.services.paschaCollection) {
    rows.push({ key: 'paschaCollection', name: 'Holy Pascha Collection', available: true });
    if (day.services.greatVespers) {
      rows.push({ key: 'greatVespers', name: 'Agape Vespers', available: true });
    }
    return rows;
  }

  if (dow === 'saturday') {
    if (day.services.vesperalLiturgy) {
      rows.push({ key: 'vesperalLiturgy', name: 'Vesperal Liturgy of St. Basil', available: true });
    } else {
      rows.push({ key: 'greatVespers', name: 'Great Vespers',  available: day.services.greatVespers });
      if (day.services.dailyVespers) rows.push({ key: 'dailyVespers', name: 'Daily Vespers', available: true });
      rows.push({ key: 'matins',  name: 'Matins',        available: day.services.matins });
      rows.push({ key: 'liturgy', name: 'Divine Liturgy', available: day.services.liturgy });
    }
  } else if (dow === 'sunday') {
    if (day.services.greatVespers) {
      rows.push({ key: 'greatVespers', name: 'Great Vespers', available: true });
    }
    rows.push({ key: 'matins',       name: 'Matins',        available: false });
    rows.push({ key: 'liturgy',      name: 'Divine Liturgy', available: day.services.liturgy });
    rows.push({ key: 'dailyVespers', name: 'Daily Vespers',  available: day.services.dailyVespers });
  } else {
    // Weekday services
    if (day.services.burialVespers) {
      rows.push({ key: 'burialVespers', name: 'Burial Vespers', available: true });
    }
    if (day.services.royalHours) {
      rows.push({ key: 'royalHours', name: 'Royal Hours', available: true });
    }
    if (day.services.lamentations) {
      rows.push({ key: 'lamentations', name: 'The Lamentations', available: true });
    }
    if (day.services.vesperalLiturgy) {
      rows.push({ key: 'vesperalLiturgy', name: 'Vesperal Liturgy of St. Basil', available: true });
    }
    if (day.services.bridegroomMatins) {
      rows.push({ key: 'bridegroomMatins', name: 'Bridegroom Matins', available: true });
    }
    if (day.services.passionGospels) {
      rows.push({ key: 'passionGospels', name: 'Twelve Passion Gospels', available: true });
    }
    if (day.services.matins) {
      rows.push({ key: 'matins', name: 'Matins', available: true });
    }
    if (day.services.presanctified) {
      rows.push({ key: 'presanctified', name: 'Presanctified Liturgy', available: true });
    }
    if (day.services.paschalHours) {
      rows.push({ key: 'paschalHours', name: 'Paschal Hours', available: true });
    }
    if (day.services.dailyVespers) {
      rows.push({ key: 'dailyVespers', name: 'Daily Vespers', available: true });
    }
    if (day.services.liturgy) {
      rows.push({ key: 'liturgy', name: 'Divine Liturgy', available: true });
    }
  }

  return rows;
}

function shouldShowDay(day) {
  const { dayOfWeek: dow, services } = day;
  if (dow === 'saturday' || dow === 'sunday') return true;
  return services.dailyVespers || services.greatVespers || services.burialVespers || services.bridegroomMatins || services.royalHours || services.lamentations || services.vesperalLiturgy || services.passionGospels || services.presanctified || services.paschalHours || services.liturgy;
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
  const svcLabel = svcType === 'dailyVespers'     ? 'DAILY VESPERS'
                 : svcType === 'burialVespers'   ? 'BURIAL VESPERS'
                 : svcType === 'bridegroomMatins' ? 'BRIDEGROOM MATINS'
                 : svcType === 'lamentations'    ? 'THE LAMENTATIONS'
                 : svcType === 'royalHours'      ? 'ROYAL HOURS OF GREAT FRIDAY'
                 : svcType === 'vesperalLiturgy' ? 'VESPERAL LITURGY OF ST. BASIL'
                 : svcType === 'passionGospels'  ? 'TWELVE PASSION GOSPELS'
                 : svcType === 'liturgy'          ? 'DIVINE LITURGY'
                 : svcType === 'presanctified'    ? 'PRESANCTIFIED LITURGY'
                 : svcType === 'paschalHours'     ? 'PASCHAL HOURS'
                 : svcType === 'paschaCollection' ? 'HOLY PASCHA COLLECTION'
                 : svcType === 'matins'          ? 'MATINS'
                 : 'GREAT VESPERS';
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
    // Choir mode: fetch all services for the date
    if (activeMode === 'choir') {
      return await loadChoirContent(date);
    }

    const data = await fetchService(date, svcType, activePronoun);
    if (!data) {
      document.getElementById('p-body').innerHTML =
        '<div class="panel-loading">Service not available for this date.</div>';
      const fallbackDate = formatLong(date);
      document.getElementById('p-date').textContent = fallbackDate;
      document.getElementById('print-header-date').textContent = fallbackDate;
      return;
    }

    // Update panel service label from API response (shows variant name for liturgy)
    if (data.serviceName) {
      const labelEl = document.getElementById('p-svc');
      const printLabelEl = document.getElementById('print-header-svc');
      if (labelEl) labelEl.textContent = data.serviceName.toUpperCase();
      if (printLabelEl) printLabelEl.textContent = data.serviceName.toUpperCase();
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

    // Education modules — only for liturgy in laity mode
    let eduModules = null;
    if (activeEducation === 'on' && activeMode === 'laity' &&
        (svcType === 'liturgy')) {
      eduModules = await getEducationModules();
    }
    const html   = window.renderBlocks(data.blocks, { educationModules: eduModules });
    const bodyEl = document.getElementById('p-body');
    bodyEl.innerHTML = html;
    bodyEl.scrollTop = 0;
  } catch (err) {
    console.error('Panel load error:', err);
    document.getElementById('p-body').innerHTML =
      `<div class="panel-loading">Error loading service: ${err.message}</div>`;
  }
}

async function loadChoirContent(date) {
  try {
    choirData = await fetchChoirPrep(date, activePronoun);
    if (!choirData || !choirData.services || choirData.services.length === 0) {
      document.getElementById('p-body').innerHTML =
        '<div class="panel-loading">No services available for this date.</div>';
      return;
    }

    // Panel header
    document.getElementById('p-svc').textContent = 'CHOIR PREP';
    document.getElementById('print-header-svc').textContent = 'CHOIR REHEARSAL SHEET';

    const toneStr  = choirData.tone ? ` \u00B7 Tone ${choirData.tone}` : '';
    const labelStr = choirData.liturgicalLabel ? ` \u00B7 ${choirData.liturgicalLabel}` : '';
    const dateStr = `${formatLong(date)}${toneStr}${labelStr}`;
    document.getElementById('p-date').textContent = dateStr;
    document.getElementById('print-header-date').textContent = dateStr;

    // Commemorations — choir-prep returns strings, not objects
    const comms = choirData.commemorations || [];
    const saintsEl = document.getElementById('p-saints');
    if (comms.length > 0) {
      saintsEl.innerHTML = comms.map((c, i) => {
        const title = typeof c === 'string' ? c : (c.title || '');
        const major = (typeof c === 'object' && c.isPrincipal) || i === 0;
        return `<div class="p-saint${major ? ' major' : ''}">${title}</div>`;
      }).join('');
      saintsEl.style.display = '';
    } else {
      saintsEl.innerHTML = '';
      saintsEl.style.display = 'none';
    }
    updateDetailLabel();

    // Initialize all services as enabled
    choirEnabled = {};
    for (const svc of choirData.services) {
      choirEnabled[svc.type] = true;
    }

    renderChoirToggleChips(choirData.services);
    renderChoirPanel();
  } catch (err) {
    console.error('Choir prep load error:', err);
    document.getElementById('p-body').innerHTML =
      `<div class="panel-loading">Error loading choir prep: ${err.message}</div>`;
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

function updateDetailLabel() {
  const saints = document.querySelectorAll('#p-saints .p-saint');
  const count  = saints.length;
  const parts  = [];
  if (count) parts.push(`${count} COMMEMORATION${count > 1 ? 'S' : ''}`);
  if (activeMode === 'choir' && choirData && choirData.services) {
    const svcCount = choirData.services.length;
    parts.push(`${svcCount} SERVICE${svcCount > 1 ? 'S' : ''}`);
  }
  document.getElementById('p-detail-label').textContent = parts.length ? parts.join(' \u00B7 ') : 'DETAILS';
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

// ─── Dev-mode toggle ─────────────────────────────────────────────────────────

function initDevMode() {
  const cb = document.getElementById('devmode-toggle');
  if (!cb) return;
  cb.addEventListener('change', () => {
    document.body.classList.toggle('dev-mode', cb.checked);
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
      const dayObj = calDayCache[date];
      const svc = dayObj?.services?.greatVespers ? 'greatVespers' : 'dailyVespers';
      closeCal();
      setTimeout(() => pickResult(date, svc), 280);
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
      setTimeout(() => pickResult(date, svc), 280);
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
  document.getElementById('btn-print').addEventListener('click', openPrintView);
  document.getElementById('print-back').addEventListener('click', closePrintView);
  document.getElementById('pd-standard').addEventListener('click', () => { closePrintView(); window.print(); });
  document.getElementById('pd-booklet').addEventListener('click', () => { closePrintView(); printBooklet(); });
  document.getElementById('p-detail-toggle').addEventListener('click', togglePanelDetail);
  initPronounRadio();
  initDevMode();

  // Settings
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-back').addEventListener('click', closeSettings);
  document.getElementById('settings-done').addEventListener('click', closeSettings);
  initSettingsToggles();
  // Apply persisted mode on load
  if (activeMode === 'choir') document.body.classList.add('mode-choir');

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
    if (document.getElementById('view-settings').classList.contains('visible')) closeSettings();
    if (document.getElementById('view-search').classList.contains('visible'))  closeSearch();
    if (document.getElementById('view-cal').classList.contains('visible'))     closeCal();
    if (document.getElementById('view-print').classList.contains('visible'))   closePrintView();
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

// ─── Print dialog ─────────────────────────────────────────────────────────────

function openPrintView() {
  closeSearch(/*silent=*/true);
  closeCal();
  document.getElementById('view-main').classList.add('hidden');
  document.getElementById('view-print').classList.add('visible');
}

function closePrintView() {
  document.getElementById('view-print').classList.remove('visible');
  document.getElementById('view-main').classList.remove('hidden');
}

// ─── Settings view ───────────────────────────────────────────────────────────

function openSettings() {
  closeSearch(/*silent=*/true);
  closeCal();
  document.getElementById('view-main').classList.add('hidden');
  document.getElementById('view-settings').classList.add('visible');
  syncSettingsUI();
}

function closeSettings() {
  document.getElementById('view-settings').classList.remove('visible');
  document.getElementById('view-main').classList.remove('hidden');
}

function syncSettingsUI() {
  // Mode toggle
  document.querySelectorAll('#mode-toggle .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === activeMode);
  });
  // Pronoun toggle
  document.querySelectorAll('#pronoun-toggle .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pron === activePronoun);
  });
  // Education toggle — disabled when choir mode is active
  const eduGroup = document.getElementById('education-group');
  if (eduGroup) {
    eduGroup.classList.toggle('disabled', activeMode === 'choir');
  }
  document.querySelectorAll('#education-toggle .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.edu === activeEducation);
  });
}

function setMode(mode) {
  activeMode = mode;
  localStorage.setItem('mode', mode);
  document.body.classList.toggle('mode-choir', mode === 'choir');
  // Education mode only available in laity mode
  if (mode === 'choir' && activeEducation === 'on') {
    activeEducation = 'off';
    localStorage.setItem('education', 'off');
  }
  syncSettingsUI();
  if (activeDate && activeSvcType) {
    loadPanelContent(activeDate, activeSvcType);
  }
}

function setEducation(val) {
  activeEducation = val;
  localStorage.setItem('education', val);
  syncSettingsUI();
  if (activeDate && activeSvcType) {
    loadPanelContent(activeDate, activeSvcType);
  }
}

async function getEducationModules() {
  if (educationModules) return educationModules;
  try {
    const res = await fetch('/api/education-modules');
    if (!res.ok) return null;
    const data = await res.json();
    educationModules = data.modules || null;
    return educationModules;
  } catch (e) {
    console.error('Failed to load education modules:', e);
    return null;
  }
}

function setPronoun(pron) {
  activePronoun = pron;
  localStorage.setItem('pronoun', pron);
  syncSettingsUI();
  updateDetailLabel();
  if (activeDate && activeSvcType) {
    loadPanelContent(activeDate, activeSvcType);
  }
}

function initSettingsToggles() {
  document.querySelectorAll('#mode-toggle .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
  document.querySelectorAll('#pronoun-toggle .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setPronoun(btn.dataset.pron));
  });
  document.querySelectorAll('#education-toggle .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setEducation(btn.dataset.edu));
  });
}

// ─── Choir mode helpers ──────────────────────────────────────────────────────

async function fetchChoirPrep(date, pronoun = 'tt') {
  const res = await fetch(`/api/choir-prep?date=${date}&pronoun=${pronoun}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`/api/choir-prep failed: ${res.status}`);
  }
  return res.json();
}

function renderChoirToggleChips(services) {
  const el = document.getElementById('choir-toggles');
  if (!services || services.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = services.map(svc =>
    `<button class="choir-chip${choirEnabled[svc.type] !== false ? ' active' : ''}" data-svc-type="${svc.type}">${svc.name}</button>`
  ).join('');
  el.querySelectorAll('.choir-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const t = chip.dataset.svcType;
      choirEnabled[t] = !choirEnabled[t] && choirEnabled[t] !== undefined ? true : choirEnabled[t] === false;
      // Simple toggle: if currently active, deactivate; if inactive, activate
      if (chip.classList.contains('active')) {
        choirEnabled[t] = false;
        chip.classList.remove('active');
      } else {
        choirEnabled[t] = true;
        chip.classList.add('active');
      }
      renderChoirPanel();
    });
  });
}

function renderChoirPanel() {
  if (!choirData || !choirData.services) return;
  const filtered = choirData.services.filter(svc => choirEnabled[svc.type] !== false);
  const allBlocks = [];
  for (const svc of filtered) {
    // Add service divider
    allBlocks.push({ type: 'choir-divider', text: svc.name });
    // Filter blocks for choir relevance, then add
    const choirBlocks = window.filterForChoir(svc.blocks);
    allBlocks.push(...choirBlocks);
  }
  const html = window.renderBlocks(allBlocks, { choirMode: true });
  const bodyEl = document.getElementById('p-body');
  bodyEl.innerHTML = html;
  bodyEl.scrollTop = 0;
}

function printBooklet() {
  const body = document.getElementById('p-body');
  const svc  = document.getElementById('p-svc').textContent;
  const date = document.getElementById('p-date').textContent;

  if (!body || !body.innerHTML.trim()) {
    alert('No service loaded.'); return;
  }

  const win = window.open('', '_blank');
  if (!win) { alert('Please allow popups to use booklet printing.'); return; }

  // Dimensions: page = 5.5" × 8.5", padding = 0.4in all sides
  // Content height = (8.5 - 0.4 - 0.4) × 96 = 730 px
  const PAGE_CONTENT_H = (8.5 - 0.4 - 0.4) * 96; // 730 px
  const MEASURE_W      = (5.5 - 0.4 * 2) + 'in';  // 4.7in

  // ── Imposition function (mirrors booklet-impose.js) ──────────────────────
  function impose(pages) {
    const p = pages.slice();
    while (p.length % 4 !== 0) p.push(null);
    const n = p.length, out = [];
    for (let k = 0; k < n / 4; k++) {
      out.push(p[n - 1 - 2 * k]);
      out.push(p[2 * k]);
      out.push(p[2 * k + 1]);
      out.push(p[n - 2 - 2 * k]);
    }
    return out;
  }

  // ── Build booklet JS that runs in the new window ──────────────────────────
  const bookletScript = `
(function () {
  var PAGE_H  = ${PAGE_CONTENT_H};
  var TITLE   = ${JSON.stringify(svc + ' \u2014 ' + date)};

  // Build spreads: each spread = one landscape-letter print page (two half-pages side by side).
  // Front spreads print normally; back spreads are pre-rotated 180° to counteract the
  // printer's long-edge duplex flip (landscape long-edge flips top-to-bottom = 180°).
  // NOTE: if back-side content appears upside-down after printing, toggle the rotate flags below.
  function buildSpreads(pages) {
    var p = pages.slice();
    while (p.length % 4 !== 0) p.push(null);
    var n = p.length, spreads = [];
    for (var k = 0; k < n / 4; k++) {
      spreads.push({ left: p[n-1-2*k], right: p[2*k],   rotate: false }); // sheet k front
      spreads.push({ left: p[n-2-2*k], right: p[2*k+1], rotate: true  }); // sheet k back
    }
    return spreads;
  }

  document.fonts.ready.then(function () {
    var measure  = document.getElementById('measure');
    var allItems = [];

    // Flatten content: individual blocks + svc-rules
    Array.from(measure.children).forEach(function (el) {
      if (el.classList.contains('svc-rule')) {
        allItems.push({ html: el.outerHTML, isHead: false });
      } else if (el.classList.contains('svc-sec')) {
        Array.from(el.children).forEach(function (child) {
          allItems.push({ html: child.outerHTML, isHead: child.classList.contains('svc-head') });
        });
        allItems.push({ html: '<div class="sec-gap"></div>', isHead: false });
      }
    });

    // Measure heights in the measure container (correct width already set)
    // getBoundingClientRect().height excludes the last child's margin-bottom
    // (it collapses with the parent's margin-bottom = 0), so we add it back.
    var tmp = document.createElement('div');
    tmp.style.cssText = 'position:absolute;top:-9999px;left:0;width:${MEASURE_W};';
    document.body.appendChild(tmp);
    var itemHeights = allItems.map(function (item) {
      tmp.innerHTML = item.html;
      var h = tmp.getBoundingClientRect().height;
      var last = tmp.lastElementChild;
      if (last) {
        h += parseFloat(window.getComputedStyle(last).marginBottom) || 0;
      }
      return h;
    });
    document.body.removeChild(tmp);

    // Bin into pages; keep section heading with its first block
    var pages = [[]], heights = [0];
    allItems.forEach(function (item, i) {
      var h = itemHeights[i];
      var idx = pages.length - 1;
      // If adding this item (+ next item for widows) overflows, start new page
      var lookahead = item.isHead ? (itemHeights[i + 1] || 0) : 0;
      if (heights[idx] + h + lookahead > PAGE_H && pages[idx].length > 0) {
        pages.push([]); heights.push(0);
      }
      var last = pages.length - 1;
      pages[last].push(item.html);
      heights[last] += h;
    });

    // Build spreads (each spread = one landscape print page with two half-pages)
    var spreads = buildSpreads(pages);
    var totalSheets = spreads.length / 2;

    // Render spreads
    var booklet = document.getElementById('booklet');
    spreads.forEach(function (spread) {
      var div = document.createElement('div');
      div.className = spread.rotate ? 'bk-spread rotated' : 'bk-spread';
      ['left', 'right'].forEach(function (side) {
        var half = document.createElement('div');
        half.className = 'bk-half';
        if (spread[side] && spread[side].length > 0) {
          half.innerHTML = spread[side].join('');
        }
        div.appendChild(half);
      });
      booklet.appendChild(div);
    });

    // Update instructions with sheet count
    var contentPages = pages.filter(function(p){ return p && p.length > 0; }).length;
    document.getElementById('sheet-count').textContent =
      totalSheets + ' sheet' + (totalSheets !== 1 ? 's' : '') +
      ' (' + contentPages + ' pages)';

    measure.style.display = 'none';
    booklet.style.visibility = 'visible';
    document.getElementById('instructions').style.display = 'flex';
  });

  window.startPrint = function () {
    document.getElementById('instructions').style.display = 'none';
    window.print();
  };
})();
`;

  const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root { --rubric: #8B1A1A; --gold: #C9A84C; --text: #1A1209; --muted: #6B6358; }

/* ── Measure container (off-screen, matches page content width) ── */
#measure { position: absolute; top: -9999px; left: 0; width: ${MEASURE_W}; }

/* ── Booklet spreads (one per print page = landscape letter sheet) ── */
#booklet { visibility: hidden; }

.bk-spread {
  width: 11in; height: 8.5in;
  display: flex;
  break-after: page;
}
.bk-spread:last-child { break-after: auto; }
.bk-spread.rotated {
  transform: rotate(180deg);
  transform-origin: center center;
}

.bk-half {
  width: 5.5in; height: 8.5in;
  padding: 0.4in;
  overflow: hidden; position: relative;
  font-family: 'EB Garamond', Georgia, serif;
  font-size: 15pt; line-height: 1.75; color: var(--text);
  flex-shrink: 0;
}

/* ── Service content ── */
.svc-head {
  font-family: 'Cinzel', serif; font-size: 10pt; letter-spacing: .18em;
  text-align: center; color: var(--text); margin-bottom: 10px; margin-top: 4px;
  break-after: avoid;
}
.svc-rule { height: 0.5pt; background: var(--gold); margin: 8px 0; }
.sec-gap  { height: 10px; }
.rubric {
  font-family: 'EB Garamond', Georgia, serif; font-size: 13pt;
  font-style: italic; color: var(--rubric);
  margin-bottom: 5px; line-height: 1.5;
  break-inside: avoid;
}
.prayer {
  font-family: 'EB Garamond', Georgia, serif; font-size: 15pt;
  line-height: 1.75; color: var(--text); margin-bottom: 8px;
  break-inside: avoid;
}
.stich-label {
  font-family: 'EB Garamond', Georgia, serif; font-size: 13pt;
  font-style: italic; color: var(--muted); margin-bottom: 4px;
  break-after: avoid;
}
.verse {
  font-family: 'EB Garamond', Georgia, serif; font-size: 13pt;
  font-style: italic; color: var(--muted); margin-bottom: 6px; line-height: 1.5;
}
.spk { display: inline; font-weight: 600; font-style: normal; color: var(--rubric); }

/* ── Instructions overlay ── */
#instructions {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,0.72); z-index: 9999;
  align-items: center; justify-content: center;
}
.instr-box {
  background: #fff; width: min(480px, 92vw);
  border-top: 3px solid var(--rubric); padding: 40px 36px 32px;
  font-family: 'EB Garamond', Georgia, serif;
}
.instr-title {
  font-family: 'Cinzel', serif; font-size: 9pt; letter-spacing: .2em;
  color: var(--rubric); text-align: center; margin-bottom: 8px;
  text-transform: uppercase;
}
.instr-sub {
  font-size: 11pt; color: var(--muted); text-align: center;
  margin-bottom: 24px;
}
.instr-steps { list-style: none; margin-bottom: 28px; }
.instr-steps li {
  font-size: 13pt; padding: 9px 0; border-bottom: 1px solid #e8e2d8;
  display: flex; justify-content: space-between; align-items: baseline;
}
.instr-steps li:last-child { border-bottom: none; }
.instr-steps .setting { font-weight: 600; color: var(--text); }
.instr-btn {
  display: block; width: 100%; padding: 13px;
  font-family: 'Cinzel', serif; font-size: 9pt; letter-spacing: .16em;
  text-transform: uppercase; background: var(--rubric); color: #fff;
  border: none; cursor: pointer;
}
.instr-btn:hover { background: #6e1414; }

/* ── Print ── */
@page { size: 11in 8.5in; margin: 0; }
@media screen {
  body { background: #e8e4dc; padding: 24px; }
  .bk-spread {
    margin: 0 auto 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,.18);
    break-after: auto;
  }
  .bk-half { background: #fff; }
  .bk-half:first-child { border-right: 1px dashed #ccc; }
}
@media print { #instructions { display: none !important; } }
`;

  win.document.write(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<title>Booklet \u2014 ${svc} \u2014 ${date}</title>
<style>${CSS}</style>
</head><body>

<div id="instructions">
  <div class="instr-box">
    <div class="instr-title">Booklet Print Settings</div>
    <div class="instr-sub" id="sheet-count">Preparing\u2026</div>
    <ol class="instr-steps">
      <li><span>Paper</span>         <span class="setting">US Letter (8.5\u2033 \u00d7 11\u2033)</span></li>
      <li><span>Orientation</span>   <span class="setting">Landscape</span></li>
      <li><span>Pages per sheet</span><span class="setting">1</span></li>
      <li><span>Two-sided</span>     <span class="setting">On \u2014 Long-edge binding</span></li>
    </ol>
    <button class="instr-btn" onclick="startPrint()">Print Booklet</button>
  </div>
</div>

<div id="measure">${body.innerHTML}</div>
<div id="booklet"></div>

<script>${bookletScript}<\/script>
</body></html>`);
  win.document.close();
}

document.addEventListener('DOMContentLoaded', init);
