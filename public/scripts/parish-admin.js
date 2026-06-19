// Parish admin settings — load + edit + save flow.

const slug = location.pathname.split('/').filter(Boolean)[1];
const SETTINGS_URL = `/parish-admin/${slug}/settings`;
const PATRON_URL   = (q) => `/parish-admin/${slug}/patron-search?q=${encodeURIComponent(q)}`;
const VARIANTS_URL = (key) => `/parish-admin/${slug}/variants?key=${encodeURIComponent(key)}`;
const SERVICE_PREVIEW_URL = (date) =>
  `/api/liturgy?date=${date}&translation=${slug}`;

const $ = (id) => document.getElementById(id);
const els = {
  loading:        $('pa-loading'),
  unauthorized:   $('pa-unauthorized'),
  form:           $('pa-form'),
  nameDisplay:    $('pa-name-display'),
  name:           $('f-name'),
  city:           $('f-city'),
  jurisdiction:   $('f-jurisdiction'),
  primate:        $('f-primate'),
  ruling:         $('f-ruling'),
  primateDerived: $('d-primate'),
  rulingDerived:  $('d-ruling'),
  confessFirst:   $('f-confess-first'),
  omitPreTrisagion: $('f-omit-pre-trisagion'),
  lesserSaints:   $('f-lesser-saints'),
  secondGospel:   $('f-second-gospel'),
  secondKoinonikon: $('f-second-koinonikon'),
  paschalComm:    $('f-paschal-comm'),
  catechSeasons:  document.querySelectorAll('.catech-season'),
  patronSearch:   $('f-patron-search'),
  patronTypeahead:$('patron-typeahead'),
  patronSelected: $('patron-selected'),
  patronTitle:    $('patron-title-display'),
  patronFeast:    $('patron-feast-display'),
  patronClear:    $('patron-clear'),
  cherubic:       $('f-cherubic'),
  save:           $('pa-save'),
  dirty:          $('pa-dirty'),
};

let initialState = null;
let currentPatron = { naturalKey: null, title: null };

function renderDerived() {
  const p = els.primate.value.trim() || '(your primate’s full title)';
  const r = els.ruling.value.trim()  || '(your ruling hierarch’s full title)';
  els.primateDerived.textContent =
    `Will render as: "…His Beatitude, the Most Blessed ${p}…"`;
  els.rulingDerived.textContent =
    `Will render as: "…His Eminence, the Most Reverend ${r}…"`;
}

function snapshot() {
  return {
    name:                  els.name.value,
    city:                  els.city.value,
    primate_name:          els.primate.value,
    ruling_hierarch_name:  els.ruling.value,
    patron_natural_key:    currentPatron.naturalKey,
    patron_title:          currentPatron.title,
    rubric_confess_first:               els.confessFirst.checked,
    rubric_omit_pre_trisagion_litany:   els.omitPreTrisagion.checked,
    rubric_include_lesser_saints:       els.lesserSaints.checked,
    rubric_include_second_gospel:       els.secondGospel.checked,
    rubric_include_second_koinonikon:   els.secondKoinonikon.checked,
    rubric_paschal_communion_year_round: els.paschalComm.checked,
    rubric_omit_catechumens_seasons:    [...els.catechSeasons]
        .filter(c => c.checked).map(c => c.value).join(','),
    variant_pick_cherubic_hymn:         els.cherubic.value,
  };
}

function isDirty() {
  if (!initialState) return false;
  const s = snapshot();
  return Object.keys(s).some(k => s[k] !== initialState[k]);
}

function refreshDirtyUI() {
  const dirty = isDirty();
  els.save.disabled = !dirty;
  els.dirty.textContent = dirty ? 'Unsaved changes' : 'No unsaved changes';
  els.dirty.classList.toggle('is-dirty', dirty);
}

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
  refreshDirtyUI();
}

function populate(data) {
  els.nameDisplay.textContent = data.name + (data.city ? `  ·  ${data.city}` : '');
  document.title = `${data.name} — Settings`;
  els.name.value = data.name || '';
  els.city.value = data.city || '';
  els.jurisdiction.value = (data.jurisdiction || '').toUpperCase();
  els.primate.value = data.primate_name || '';
  els.ruling.value = data.ruling_hierarch_name || '';
  els.confessFirst.checked     = !!data.rubric_confess_first;
  els.omitPreTrisagion.checked = !!data.rubric_omit_pre_trisagion_litany;
  els.lesserSaints.checked     = !!data.rubric_include_lesser_saints;
  els.secondGospel.checked     = !!data.rubric_include_second_gospel;
  els.secondKoinonikon.checked = !!data.rubric_include_second_koinonikon;
  els.paschalComm.checked      = !!data.rubric_paschal_communion_year_round;

  const seasons = String(data.rubric_omit_catechumens_seasons || '').split(',').filter(Boolean);
  els.catechSeasons.forEach(c => { c.checked = seasons.includes(c.value); });

  if (data.patron_natural_key) {
    setPatron(data.patron_natural_key, data.patron_title, '');
  }

  // Populate the cherubic dropdown's currently-selected value (if any).
  // Options are loaded asynchronously below; we set value after populating.
  const cherubicPick = (data.variant_picks || []).find(p => p.variant_key === 'cherubic-hymn');
  populateVariantDropdown('cherubic-hymn', els.cherubic, cherubicPick ? cherubicPick.variant_id : '');

  initialState = snapshot();
  renderDerived();
  refreshDirtyUI();
}

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

function showToast(kind, html, persistMs = 6000) {
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

function nextSundayISO() {
  const d = new Date();
  const day = d.getDay();
  const ahead = day === 0 ? 7 : (7 - day);
  d.setDate(d.getDate() + ahead);
  return d.toISOString().slice(0, 10);
}

function populateVariantDropdown(key, selectEl, currentPickId) {
  fetch(VARIANTS_URL(key), { credentials: 'same-origin' })
    .then(r => r.ok ? r.json() : { variants: [] })
    .then(({ variants }) => {
      for (const v of variants) {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.label;
        selectEl.appendChild(opt);
      }
      if (currentPickId) selectEl.value = currentPickId;
      // Re-baseline initialState now that the dropdown reflects DB state.
      initialState = snapshot();
      refreshDirtyUI();
    });
}

function picksFromForm() {
  const picks = [];
  const cherubic = els.cherubic.value;
  if (cherubic) picks.push({ variant_key: 'cherubic-hymn', variant_id: cherubic });
  return picks;
}

async function handleSubmit(e) {
  e.preventDefault();
  if (!isDirty()) return;
  els.save.disabled = true;
  els.save.textContent = 'Saving…';
  try {
    const payload = snapshot();
    delete payload.variant_pick_cherubic_hymn;
    payload.variant_picks = picksFromForm();
    for (const k of [
      'rubric_confess_first','rubric_omit_pre_trisagion_litany',
      'rubric_include_lesser_saints','rubric_include_second_gospel',
      'rubric_include_second_koinonikon','rubric_paschal_communion_year_round',
    ]) payload[k] = payload[k] ? 1 : 0;
    await postSettings(payload);
    initialState = snapshot();
    refreshDirtyUI();
    const previewUrl = SERVICE_PREVIEW_URL(nextSundayISO());
    showToast('success',
      `Saved. <a href="${previewUrl}" target="_blank" rel="noopener">View next Sunday's Liturgy →</a>`);
  } catch (err) {
    showToast('error', `Couldn't save: ${escapeHtml(err.message)}. Your changes are still on this page; try again.`);
    els.save.disabled = false;
  } finally {
    els.save.textContent = 'Save changes';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// ── Typeahead ───────────────────────────────────────────────────────────
let typeaheadTimer = null;
let activeRowIdx = -1;
let lastResults = [];

function hidePatronTypeahead() {
  els.patronTypeahead.hidden = true;
  els.patronTypeahead.innerHTML = '';
  activeRowIdx = -1;
  lastResults = [];
}

function renderTypeahead(results) {
  if (!results.length) {
    els.patronTypeahead.innerHTML = '<div class="pa-typeahead-empty">No matches.</div>';
    els.patronTypeahead.hidden = false;
    return;
  }
  const html = results.map((r, i) =>
    `<div class="pa-typeahead-row" data-idx="${i}">
       <span>${escapeHtml(r.title)}</span>
       <span class="pa-feast">${escapeHtml(r.feastLabel)}</span>
     </div>`).join('');
  els.patronTypeahead.innerHTML = html;
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

els.patronSearch.addEventListener('input', (e) => runPatronSearch(e.target.value.trim()));
els.patronSearch.addEventListener('blur', () => setTimeout(hidePatronTypeahead, 150));
els.patronSearch.addEventListener('keydown', (e) => {
  if (els.patronTypeahead.hidden) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeRowIdx = Math.min(activeRowIdx + 1, lastResults.length - 1);
    updateActiveRow();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeRowIdx = Math.max(activeRowIdx - 1, 0);
    updateActiveRow();
  } else if (e.key === 'Enter' && activeRowIdx >= 0) {
    e.preventDefault();
    const r = lastResults[activeRowIdx];
    if (r) setPatron(r.naturalKey, r.title, r.feastLabel);
  } else if (e.key === 'Escape') {
    hidePatronTypeahead();
  }
});

function updateActiveRow() {
  els.patronTypeahead.querySelectorAll('.pa-typeahead-row').forEach((row, i) => {
    row.classList.toggle('is-active', i === activeRowIdx);
  });
}

els.patronClear.addEventListener('click', () => setPatron(null, null, null));

// ── Wire change listeners ──────────────────────────────────────────────
['input', 'change'].forEach(evt => {
  els.form.addEventListener(evt, () => { renderDerived(); refreshDirtyUI(); });
});
els.form.addEventListener('submit', handleSubmit);

window.addEventListener('beforeunload', (e) => {
  if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

// Boot
loadSettings().then(data => {
  if (!data) return;
  els.loading.hidden = true;
  els.form.hidden = false;
  populate(data);
}).catch(err => {
  els.loading.textContent = `Failed to load settings: ${err.message}`;
});
