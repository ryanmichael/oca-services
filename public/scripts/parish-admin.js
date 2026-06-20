// Parish admin settings — Option A layout.
//
// Main view:   compact summary card → variant choices + rubrics → live preview
// Setup view:  screenfill (slides up) with parish info / hierarchs / patron
//
// One DB row; two forms. Each Save POSTs only the dirty fields (the route's
// PATCH-style merge handles partial payloads).

const slug = location.pathname.split('/').filter(Boolean)[1];
const SETTINGS_URL = `/parish-admin/${slug}/settings`;
const PATRON_URL   = (q) => `/parish-admin/${slug}/patron-search?q=${encodeURIComponent(q)}`;
const VARIANTS_URL = (key) => `/parish-admin/${slug}/variants?key=${encodeURIComponent(key)}`;

const $ = (id) => document.getElementById(id);
const els = {
  loading:        $('pa-loading'),
  unauthorized:   $('pa-unauthorized'),
  grid:           $('pa-grid'),

  // Summary card
  summaryName:    $('pa-summary-name'),
  summaryMeta:    $('pa-summary-meta'),
  editDetails:    $('pa-edit-details'),

  // Main form (service text + rubrics)
  form:           $('pa-form'),
  save:           $('pa-save'),
  dirty:          $('pa-dirty'),

  // Setup form (identity, hierarchs, patron)
  setupForm:      $('setup-form'),
  setupView:      $('view-setup'),
  setupBack:      $('setup-back'),
  setupSave:      $('setup-save'),
  setupDirty:     $('setup-dirty'),

  name:           $('f-name'),
  city:           $('f-city'),
  jurisdiction:   $('f-jurisdiction'),
  primate:        $('f-primate'),
  primateShort:   $('f-primate-short'),
  ruling:         $('f-ruling'),
  rulingShort:    $('f-ruling-short'),
  primateDerived: $('d-primate'),
  rulingDerived:  $('d-ruling'),
  patronSearch:   $('f-patron-search'),
  patronTypeahead:$('patron-typeahead'),
  patronSelected: $('patron-selected'),
  patronTitle:    $('patron-title-display'),
  patronFeast:    $('patron-feast-display'),
  patronClear:    $('patron-clear'),

  // Service text + rubrics (main form)
  confessFirst:    $('f-confess-first'),
  omitPreTrisagion:$('f-omit-pre-trisagion'),
  lesserSaints:    $('f-lesser-saints'),
  secondGospel:    $('f-second-gospel'),
  secondKoinonikon:$('f-second-koinonikon'),
  paschalComm:     $('f-paschal-comm'),
  catechSeasons:   document.querySelectorAll('.catech-season'),
  variantPickers:  document.querySelectorAll('select[data-variant-key]'),

  // Service tabs (drive both form section visibility AND preview service)
  serviceTabs:     document.querySelectorAll('.pa-tab[data-service-tab]'),
  servicePanels:   document.querySelectorAll('.pa-service-panel[data-service]'),
  previewSvcLabel: $('preview-service-label'),

  // Preview
  previewDate:    $('preview-date'),
  previewFrame:   $('preview-frame'),
  previewReload:  $('preview-reload'),
  quickLinks:     document.querySelectorAll('.pa-quick[data-quick]'),
};

let activeService = 'liturgy';

let initialState = { main: null, setup: null };
let currentPatron = { naturalKey: null, title: null };
let currentJurisdiction = '';

// ── State snapshot helpers ────────────────────────────────────────────────
function snapshotMain() {
  return {
    rubric_confess_first:                els.confessFirst.checked,
    rubric_omit_pre_trisagion_litany:    els.omitPreTrisagion.checked,
    rubric_include_lesser_saints:        els.lesserSaints.checked,
    rubric_include_second_gospel:        els.secondGospel.checked,
    rubric_include_second_koinonikon:    els.secondKoinonikon.checked,
    rubric_paschal_communion_year_round: els.paschalComm.checked,
    rubric_omit_catechumens_seasons:     [...els.catechSeasons]
        .filter(c => c.checked).map(c => c.value).join(','),
    variant_picks_serialized:            [...els.variantPickers]
        .map(s => `${s.dataset.variantKey}=${s.value}`).join(';'),
  };
}

function snapshotSetup() {
  return {
    name:                  els.name.value,
    city:                  els.city.value,
    primate_name:          els.primate.value,
    primate_short:         els.primateShort.value,
    ruling_hierarch_name:  els.ruling.value,
    ruling_hierarch_short: els.rulingShort.value,
    patron_natural_key:    currentPatron.naturalKey,
    patron_title:          currentPatron.title,
  };
}

function isDirty(which) {
  const init = initialState[which];
  if (!init) return false;
  const cur = which === 'main' ? snapshotMain() : snapshotSetup();
  return Object.keys(cur).some(k => cur[k] !== init[k]);
}

function refreshMainDirtyUI() {
  const d = isDirty('main');
  els.save.disabled = !d;
  els.dirty.textContent = d ? 'Unsaved changes' : 'No unsaved changes';
  els.dirty.classList.toggle('is-dirty', d);
}

function refreshSetupDirtyUI() {
  const d = isDirty('setup');
  els.setupSave.disabled = !d;
  els.setupDirty.textContent = d ? 'Unsaved changes' : 'No unsaved changes';
  els.setupDirty.classList.toggle('is-dirty', d);
}

// ── Derived previews + summary card ──────────────────────────────────────
function renderDerived() {
  const p = els.primate.value.trim() || '(your primate’s full title)';
  const r = els.ruling.value.trim()  || '(your ruling hierarch’s full title)';
  els.primateDerived.textContent =
    `Will render as: "…His Beatitude, the Most Blessed ${p}…"`;
  els.rulingDerived.textContent =
    `Will render as: "…His Eminence, the Most Reverend ${r}…"`;
}

function renderSummary() {
  const name = els.name.value || '(unnamed parish)';
  const city = els.city.value;
  els.summaryName.textContent = name + (city ? `  ·  ${city}` : '');

  const bits = [];
  if (currentJurisdiction) bits.push(currentJurisdiction.toUpperCase());
  if (els.primateShort.value) bits.push(els.primateShort.value);
  if (els.rulingShort.value) bits.push(els.rulingShort.value);
  if (currentPatron.title) bits.push(`Patron: ${currentPatron.title}`);

  els.summaryMeta.innerHTML = bits.length
    ? bits.map(b => escapeHtml(b)).join('<span class="sep">·</span>')
    : '<em>No identity details set yet — click "Edit details" to begin.</em>';

  document.title = `${name} — Settings`;
}

// ── Patron handling ──────────────────────────────────────────────────────
function setPatron(naturalKey, title, feastLabel) {
  currentPatron = { naturalKey: naturalKey || null, title: title || null };
  if (naturalKey) {
    els.patronTitle.textContent = title;
    els.patronFeast.textContent = feastLabel || '';
    els.patronSelected.hidden = false;
    els.patronSearch.value = '';
  } else {
    els.patronSelected.hidden = true;
  }
  hidePatronTypeahead();
  refreshSetupDirtyUI();
  renderSummary();
}

// ── Loading + populating ─────────────────────────────────────────────────
function loadSettings() {
  return fetch(SETTINGS_URL, { credentials: 'same-origin' }).then(async (r) => {
    if (r.status === 401) {
      els.loading.hidden = true;
      els.unauthorized.hidden = false;
      return null;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

function populate(data) {
  // Setup form
  els.name.value         = data.name                  || '';
  els.city.value         = data.city                  || '';
  els.jurisdiction.value = (data.jurisdiction || '').toUpperCase();
  els.primate.value      = data.primate_name          || '';
  els.primateShort.value = data.primate_short         || '';
  els.ruling.value       = data.ruling_hierarch_name  || '';
  els.rulingShort.value  = data.ruling_hierarch_short || '';
  currentJurisdiction    = data.jurisdiction || '';

  // Main form: rubrics
  els.confessFirst.checked     = !!data.rubric_confess_first;
  els.omitPreTrisagion.checked = !!data.rubric_omit_pre_trisagion_litany;
  els.lesserSaints.checked     = !!data.rubric_include_lesser_saints;
  els.secondGospel.checked     = !!data.rubric_include_second_gospel;
  els.secondKoinonikon.checked = !!data.rubric_include_second_koinonikon;
  els.paschalComm.checked      = !!data.rubric_paschal_communion_year_round;
  const seasons = String(data.rubric_omit_catechumens_seasons || '').split(',').filter(Boolean);
  els.catechSeasons.forEach(c => { c.checked = seasons.includes(c.value); });

  // Patron
  if (data.patron_natural_key) setPatron(data.patron_natural_key, data.patron_title, '');

  // Variant pickers (async)
  const picksByKey = Object.fromEntries(
    (data.variant_picks || []).map(p => [p.variant_key, p.variant_id])
  );
  [...els.variantPickers].forEach(sel =>
    populateVariantDropdown(sel.dataset.variantKey, sel, picksByKey[sel.dataset.variantKey] || '')
  );

  initialState.main  = snapshotMain();
  initialState.setup = snapshotSetup();
  renderDerived();
  renderSummary();
  refreshMainDirtyUI();
  refreshSetupDirtyUI();
}

function populateVariantDropdown(key, selectEl, currentPickId) {
  return fetch(VARIANTS_URL(key), { credentials: 'same-origin' })
    .then(r => r.ok ? r.json() : { variants: [] })
    .then(({ variants }) => {
      for (const v of variants) {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.label;
        selectEl.appendChild(opt);
      }
      if (currentPickId) selectEl.value = currentPickId;
      initialState.main = snapshotMain();
      refreshMainDirtyUI();
    });
}

function picksFromForm() {
  return [...els.variantPickers]
    .filter(s => s.value)
    .map(s => ({ variant_key: s.dataset.variantKey, variant_id: s.value }));
}

// ── Save ─────────────────────────────────────────────────────────────────
function postSettings(payload) {
  return fetch(SETTINGS_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async (r) => {
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
    return json;
  });
}

async function submitMain(e) {
  e.preventDefault();
  if (!isDirty('main')) return;
  els.save.disabled = true;
  els.save.textContent = 'Saving…';
  try {
    const s = snapshotMain();
    const payload = { ...s };
    delete payload.variant_picks_serialized;
    payload.variant_picks = picksFromForm();
    for (const k of [
      'rubric_confess_first','rubric_omit_pre_trisagion_litany',
      'rubric_include_lesser_saints','rubric_include_second_gospel',
      'rubric_include_second_koinonikon','rubric_paschal_communion_year_round',
    ]) payload[k] = payload[k] ? 1 : 0;
    await postSettings(payload);
    initialState.main = snapshotMain();
    refreshMainDirtyUI();
    refreshPreview(true);
    showToast('success', 'Saved. Preview updated.');
  } catch (err) {
    showToast('error', `Couldn't save: ${escapeHtml(err.message)}. Try again.`);
    els.save.disabled = false;
  } finally {
    els.save.textContent = 'Save changes';
  }
}

async function submitSetup(e) {
  e.preventDefault();
  if (!isDirty('setup')) { closeSetupView(); return; }
  els.setupSave.disabled = true;
  els.setupSave.textContent = 'Saving…';
  try {
    const payload = snapshotSetup();
    await postSettings(payload);
    initialState.setup = snapshotSetup();
    refreshSetupDirtyUI();
    renderSummary();
    refreshPreview(true);
    closeSetupView();
    showToast('success', 'Setup saved. Preview updated.');
  } catch (err) {
    showToast('error', `Couldn't save: ${escapeHtml(err.message)}. Try again.`);
    els.setupSave.disabled = false;
  } finally {
    els.setupSave.textContent = 'Save & close';
  }
}

// ── Toast ────────────────────────────────────────────────────────────────
function showToast(kind, html, persistMs = 4000) {
  const t = document.createElement('div');
  t.className = `toast toast--${kind}`;
  t.innerHTML = html;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-visible'));
  setTimeout(() => {
    t.classList.remove('is-visible');
    setTimeout(() => t.remove(), 250);
  }, persistMs);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// ── Setup view (screenfill) ──────────────────────────────────────────────
function openSetupView() {
  els.setupView.classList.add('visible');
  // Focus first empty input for new-parish onboarding flow.
  setTimeout(() => {
    const focusEl = !els.name.value ? els.name : els.primate;
    focusEl.focus();
  }, 200);
}

function closeSetupView() {
  if (isDirty('setup')) {
    if (!confirm('You have unsaved setup changes. Discard and close?')) return;
    // Revert in-DOM values to the last-saved snapshot.
    const s = initialState.setup;
    if (s) {
      els.name.value         = s.name || '';
      els.city.value         = s.city || '';
      els.primate.value      = s.primate_name || '';
      els.primateShort.value = s.primate_short || '';
      els.ruling.value       = s.ruling_hierarch_name || '';
      els.rulingShort.value  = s.ruling_hierarch_short || '';
      setPatron(s.patron_natural_key || null, s.patron_title || null, '');
      renderDerived();
      renderSummary();
      refreshSetupDirtyUI();
    }
  }
  els.setupView.classList.remove('visible');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && els.setupView.classList.contains('visible')) {
    closeSetupView();
  }
});

// ── Patron typeahead ─────────────────────────────────────────────────────
let typeaheadTimer = null;
let activeRowIdx = -1;
let lastResults = [];

function hidePatronTypeahead() {
  els.patronTypeahead.hidden = true;
  els.patronTypeahead.innerHTML = '';
  activeRowIdx = -1; lastResults = [];
}
function renderTypeahead(results) {
  if (!results.length) {
    els.patronTypeahead.innerHTML = '<div class="pa-typeahead-empty">No matches.</div>';
    els.patronTypeahead.hidden = false; return;
  }
  els.patronTypeahead.innerHTML = results.map((r, i) =>
    `<div class="pa-typeahead-row" data-idx="${i}">
       <span>${escapeHtml(r.title)}</span>
       <span class="pa-feast">${escapeHtml(r.feastLabel)}</span>
     </div>`).join('');
  els.patronTypeahead.hidden = false;
  els.patronTypeahead.querySelectorAll('.pa-typeahead-row').forEach(row => {
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const r = results[parseInt(row.dataset.idx, 10)];
      setPatron(r.naturalKey, r.title, r.feastLabel);
    });
  });
}
function runPatronSearch(q) {
  clearTimeout(typeaheadTimer);
  if (q.length < 2) { hidePatronTypeahead(); return; }
  typeaheadTimer = setTimeout(() => {
    fetch(PATRON_URL(q), { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : { results: [] })
      .then(({ results }) => { lastResults = results; renderTypeahead(results); });
  }, 200);
}
function updateActiveRow() {
  els.patronTypeahead.querySelectorAll('.pa-typeahead-row').forEach((row, i) => {
    row.classList.toggle('is-active', i === activeRowIdx);
  });
}

// ── Service tabs (also locks preview to active service) ──────────────────
function setActiveService(svc) {
  activeService = svc;
  els.serviceTabs.forEach(t => t.classList.toggle('is-active', t.dataset.serviceTab === svc));
  els.servicePanels.forEach(p => { p.hidden = p.dataset.service !== svc; });
  els.previewSvcLabel.textContent = svc.toUpperCase();
  refreshPreview(false);
}

// ── Preview ──────────────────────────────────────────────────────────────
function previewUrl(bustToken) {
  const d = els.previewDate.value || nextSundayISO();
  const bust = bustToken ? `&_=${bustToken}` : '';
  // The home page accepts ?date=&svc=&translation= deep-links. /service is
  // a Vespers-only legacy route — do not use it for cross-service preview.
  return `/?date=${d}&svc=${activeService}&translation=${slug}${bust}`;
}
function refreshPreview(forceBust) {
  els.previewFrame.src = previewUrl(forceBust ? Date.now() : 0);
}
function nextSundayISO() {
  const d = new Date();
  const day = d.getDay();
  const ahead = day === 0 ? 7 : (7 - day);
  d.setDate(d.getDate() + ahead);
  return d.toISOString().slice(0, 10);
}
function pickQuickDate(kind) {
  if (kind === 'today') return new Date().toISOString().slice(0, 10);
  if (kind === 'next-sunday') return nextSundayISO();
  const PASCHA_2026         = '2026-04-12';
  const CHEESEFARE_SAT_2026 = '2026-02-21';
  if (kind === 'pascha') return PASCHA_2026;
  if (kind === 'cheesefare-sat') return CHEESEFARE_SAT_2026;
  return nextSundayISO();
}

// ── Wire events ──────────────────────────────────────────────────────────
['input', 'change'].forEach(evt => {
  els.form.addEventListener(evt, refreshMainDirtyUI);
  els.setupForm.addEventListener(evt, () => {
    renderDerived();
    renderSummary();
    refreshSetupDirtyUI();
  });
});

els.form.addEventListener('submit', submitMain);
els.setupForm.addEventListener('submit', submitSetup);
els.editDetails.addEventListener('click', openSetupView);
els.setupBack.addEventListener('click', closeSetupView);

els.patronSearch.addEventListener('input', (e) => runPatronSearch(e.target.value.trim()));
els.patronSearch.addEventListener('blur', () => setTimeout(hidePatronTypeahead, 150));
els.patronSearch.addEventListener('keydown', (e) => {
  if (els.patronTypeahead.hidden) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault(); activeRowIdx = Math.min(activeRowIdx + 1, lastResults.length - 1); updateActiveRow();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); activeRowIdx = Math.max(activeRowIdx - 1, 0); updateActiveRow();
  } else if (e.key === 'Enter' && activeRowIdx >= 0) {
    e.preventDefault();
    const r = lastResults[activeRowIdx];
    if (r) setPatron(r.naturalKey, r.title, r.feastLabel);
  } else if (e.key === 'Escape') {
    hidePatronTypeahead();
  }
});
els.patronClear.addEventListener('click', () => setPatron(null, null, null));

els.serviceTabs.forEach(t => t.addEventListener('click', () => setActiveService(t.dataset.serviceTab)));
els.previewDate.addEventListener('change', () => refreshPreview(false));
els.previewReload.addEventListener('click', () => refreshPreview(true));
els.quickLinks.forEach(btn => btn.addEventListener('click', () => {
  els.previewDate.value = pickQuickDate(btn.dataset.quick);
  refreshPreview(false);
}));

window.addEventListener('beforeunload', (e) => {
  if (isDirty('main') || isDirty('setup')) { e.preventDefault(); e.returnValue = ''; }
});

// Boot
loadSettings().then(data => {
  if (!data) return;
  els.loading.hidden = true;
  els.grid.hidden = false;
  populate(data);
  els.previewDate.value = nextSundayISO();
  refreshPreview(false);

  // First-time setup heuristic: empty parish name → auto-open setup view.
  if (!data.name) openSetupView();
}).catch(err => {
  els.loading.textContent = `Failed to load settings: ${err.message}`;
});
