// Parish admin settings — load + edit + save flow.
// The page lives at /parish-admin/<slug>. Auth is handled server-side by
// cookie; if we get 401, surface the unauthorized message and stop.

const slug = location.pathname.split('/').filter(Boolean)[1];
const SETTINGS_URL = `/parish-admin/${slug}/settings`;
const SERVICE_PREVIEW_URL = (date) =>
  `/api/liturgy?date=${date}&translation=${slug}`;

const els = {
  loading:        document.getElementById('pa-loading'),
  unauthorized:   document.getElementById('pa-unauthorized'),
  form:           document.getElementById('pa-form'),
  nameDisplay:    document.getElementById('pa-name-display'),
  name:           document.getElementById('f-name'),
  city:           document.getElementById('f-city'),
  jurisdiction:   document.getElementById('f-jurisdiction'),
  primate:        document.getElementById('f-primate'),
  ruling:         document.getElementById('f-ruling'),
  primateDerived: document.getElementById('d-primate'),
  rulingDerived:  document.getElementById('d-ruling'),
  confessFirst:   document.getElementById('f-confess-first'),
  save:           document.getElementById('pa-save'),
  dirty:          document.getElementById('pa-dirty'),
};

let initialState = null;

/** Render the live-derived Anaphora preview from the form field values. */
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
    rubric_confess_first:  els.confessFirst.checked,
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

function populate(data) {
  els.nameDisplay.textContent = data.name + (data.city ? `  ·  ${data.city}` : '');
  document.title = `${data.name} — Settings`;
  els.name.value = data.name || '';
  els.city.value = data.city || '';
  els.jurisdiction.value = (data.jurisdiction || '').toUpperCase();
  els.primate.value = data.primate_name || '';
  els.ruling.value = data.ruling_hierarch_name || '';
  els.confessFirst.checked = !!data.rubric_confess_first;
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

async function handleSubmit(e) {
  e.preventDefault();
  if (!isDirty()) return;
  els.save.disabled = true;
  els.save.textContent = 'Saving…';
  try {
    const payload = snapshot();
    payload.rubric_confess_first = payload.rubric_confess_first ? 1 : 0;
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

// Wire change listeners
['input', 'change'].forEach(evt => {
  els.form.addEventListener(evt, () => {
    renderDerived();
    refreshDirtyUI();
  });
});
els.form.addEventListener('submit', handleSubmit);

// Warn on unsaved-changes navigation
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
