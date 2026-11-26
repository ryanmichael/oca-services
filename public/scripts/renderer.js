/**
 * renderer.js
 *
 * Converts a ServiceBlock[] array into an HTML string for the panel body.
 * Exported as window.renderBlocks(blocks, opts) and window.filterForChoir(blocks).
 */

(function () {
  'use strict';

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>');
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function speakerPrefix(speaker) {
    if (!speaker) return '';
    return `<b class="spk">${capitalize(speaker)}</b> `;
  }

  // ─── Choir mode: block filtering ─────────────────────────────────────────

  // Section names that are litany sections — show as compact indicator
  const LITANY_SECTIONS = new Set([
    'Great Litany', 'Litany of Fervent Supplication', 'Augmented Litany',
    'Evening Litany', 'Supplication Litany', 'Litany of the Catechumens',
    'First Litany of the Faithful', 'Second Litany of the Faithful',
    'Little Litany', 'Litany for the Departed',
  ]);

  function filterForChoir(blocks) {
    if (!blocks || blocks.length === 0) return [];

    const result = [];
    let currentSection = null;
    let sectionAdded = false;      // did we add a heading for the current section?
    let litanySectionName = null;   // track if we're inside a litany section

    for (const block of blocks) {
      // Handle choir-divider pass-through
      if (block.type === 'choir-divider') {
        result.push(block);
        currentSection = null;
        sectionAdded = false;
        litanySectionName = null;
        continue;
      }

      // Track section changes
      if (block.section !== currentSection) {
        currentSection = block.section;
        sectionAdded = false;
        litanySectionName = LITANY_SECTIONS.has(currentSection) ? currentSection : null;
      }

      // If we're inside a litany section, emit a single compact indicator
      if (litanySectionName) {
        if (!sectionAdded) {
          result.push({
            type: 'choir-litany',
            section: currentSection,
            text: litanySectionName,
            _litanySection: true,
          });
          sectionAdded = true;
        }
        continue; // skip all litany blocks
      }

      // Include: hymns (always — this is the core choir content)
      if (block.type === 'hymn') {
        if (!sectionAdded && currentSection) {
          result.push({ type: 'rubric', section: currentSection, text: currentSection, _sectionHead: true });
          sectionAdded = true;
        }
        result.push(block);
        continue;
      }

      // Include: choir/all speaker responses (prokeimenon refrains, Alleluia, etc.)
      if (block.speaker === 'choir' || block.speaker === 'all') {
        if (!sectionAdded && currentSection) {
          result.push({ type: 'rubric', section: currentSection, text: currentSection, _sectionHead: true });
          sectionAdded = true;
        }
        result.push(block);
        continue;
      }

      // Include: doxology labels (Glory, Now) as structural markers
      if (block.type === 'doxology') {
        if (sectionAdded) result.push(block);
        continue;
      }

      // Include: verse lines that precede stichera (psalm verses at Lord I Call, Aposticha)
      if (block.type === 'verse' && sectionAdded) {
        result.push(block);
        continue;
      }

      // Include: service-title rubrics
      if (block.type === 'rubric' && block.label === 'service-title') {
        result.push(block);
        sectionAdded = true;
        continue;
      }
    }

    return result;
  }

  // ─── Block rendering ─────────────────────────────────────────────────────

  function renderBlock(block, opts) {
    const { type, speaker, text, tone, label, source, density } = block;
    const choirMode = opts && opts.choirMode;
    // Density steps for prayer/response bodies: `compact` for long text spoken
    // TO the reader (readings, psalmody, litany petitions), `cue` for a short
    // invariant acclamation inside a litany ("Lord, have mercy."), `fine` a
    // step smaller still for text read privately (the silent pre-Communion
    // prayer). Keep in sync with DENSITY_CLASS in the static renderer.js.
    const densityCls = density === 'fine' ? ' fine'
      : density === 'cue' ? ' cue'
      : density === 'compact' ? ' compact' : '';

    // Choir mode: service divider
    if (type === 'choir-divider') {
      return `<div class="choir-svc-divider">${esc(text)}</div>`;
    }

    // Choir mode: compact litany indicator
    if (type === 'choir-litany') {
      return `<div class="choir-litany">${esc(text)} — respond as usual</div>`;
    }

    // Print hints (features/beatitudes-print-cues.md). Only a print surface
    // asks for them (`opts.print`); the on-screen panel never does, and a
    // Reader's copy (`opts.readersCopy`) keeps every text. A hymn carrying a
    // cue prints as that one line; a text the pew now follows by itself (the
    // Beatitude verses, Glory, Now and ever) prints at full hymn size.
    const hint = block.print;
    // Appendix pointer (features/silent-communion-prayers.md): in print, a
    // block whose text has moved to the back prints a note pointing there. A
    // surface that prints folios fills `.appendix-page` with the page number
    // after pagination (parish-book.js); the booklet has none, so it stays
    // empty. Applies to the Reader's copy too: it is the same paper.
    if (hint && hint.pointer && opts && opts.print) {
      return `<div class="rubric print-pointer">${speakerPrefix(speaker)}${esc(hint.pointer)}` +
        `<span class="appendix-page" data-appendix="${esc(hint.appendix || '')}">${opts.appendixPageMark || ''}</span>.</div>`;
    }
    if (hint && opts && opts.print && !opts.readersCopy) {
      if (type === 'hymn' && hint.cue) {
        return `<div class="rubric print-cue">${speakerPrefix(speaker)}${esc(hint.cue)}</div>`;
      }
      if (hint.emphasis === 'sung' && (type === 'verse' || type === 'doxology')) {
        return `<div class="prayer sung">${esc(text)}</div>`;
      }
    }

    switch (type) {
      case 'rubric':
        if (label === 'service-title') {
          return `<div class="service-title">${esc(text)}</div>`;
        }
        return `<div class="rubric">${speakerPrefix(speaker)}${esc(text)}</div>`;

      case 'instruction':
        return `<div class="instruction">${esc(text)}</div>`;

      case 'prayer':
      case 'response':
        return `<div class="prayer${densityCls}">${speakerPrefix(speaker)}${esc(text)}</div>`;

      case 'doxology':
        return `<div class="prayer" style="font-style:italic;color:var(--muted)">${esc(text)}</div>`;

      case 'hymn': {
        let html = '';
        if (label || (choirMode && tone)) {
          const toneTag = tone
            ? (choirMode
              ? `<span class="tone-badge">Tone ${tone}</span>`
              : ` \u2014 Tone ${tone}`)
            : '';
          const sourceTag = (choirMode && source)
            ? `<span class="choir-source">${esc(source)}</span>`
            : '';
          const labelText = label ? esc(label) : '';
          html += `<div class="stich-label">${choirMode ? toneTag : ''}${labelText}${choirMode ? '' : toneTag}${sourceTag}</div>`;
        }
        html += `<div class="prayer">${speakerPrefix(speaker)}${esc(text)}</div>`;
        return html;
      }

      case 'verse':
        return `<div class="verse">${esc(text)}</div>`;

      default:
        return `<div class="prayer">${speakerPrefix(speaker)}${esc(text)}</div>`;
    }
  }

  // ─── Education module rendering ────────────────────────────────────────

  function renderEducationModule(mod) {
    let html = '<div class="edu-module">';
    html += `<div class="edu-module-title">${esc(mod.title)}</div>`;
    html += `<div class="edu-module-subtitle">${esc(mod.subtitle)}</div>`;
    html += '<div class="edu-module-body">';
    for (const para of (mod.content || [])) {
      html += `<p>${esc(para)}</p>`;
    }
    html += '</div>';

    // Historical timeline
    if (mod.historicalSnapshot && mod.historicalSnapshot.length) {
      html += '<div class="edu-timeline">';
      html += '<div class="edu-timeline-label">Historical Timeline</div>';
      for (const item of mod.historicalSnapshot) {
        html += '<div class="edu-tl-item">';
        html += `<div class="edu-tl-date">${esc(item.date)}</div>`;
        html += `<div class="edu-tl-detail">${esc(item.detail)}</div>`;
        html += '</div>';
      }
      html += '</div>';
    }

    // Scripture references
    if (mod.scripture && mod.scripture.length) {
      html += '<div class="edu-scripture">';
      html += '<div class="edu-scripture-label">Scripture</div>';
      for (const ref of mod.scripture) {
        html += `<div class="edu-ref"><span class="edu-ref-verse">${esc(ref.ref)}</span>${esc(ref.label || '')}</div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function buildEducationMap(modules) {
    if (!modules || !modules.length) return null;
    const map = {};
    for (const mod of modules) {
      if (mod.placementBefore) {
        map[mod.placementBefore] = mod;
      }
    }
    return map;
  }

  // ─── Section grouping + full render ──────────────────────────────────────

  function renderBlocks(blocks, opts) {
    if (!blocks || blocks.length === 0) {
      return '<div class="panel-loading">No content available.</div>';
    }

    // Appendix (features/silent-communion-prayers.md). On a print surface a
    // block carrying `print.appendix` leaves its place and is printed, in
    // order, under an "Appendix" heading after everything else; the block
    // that pointed to it prints its `print.pointer` (renderBlock). The
    // screen never asks for `print`, so it keeps the service order.
    if (opts && opts.print && blocks.some(b => b.print && b.print.appendix && !b.print.pointer)) {
      const inPlace = [], moved = {}, titles = [];
      for (const b of blocks) {
        const t = b.print && !b.print.pointer && b.print.appendix;
        if (!t) { inPlace.push(b); continue; }
        if (!moved[t]) { moved[t] = []; titles.push(t); }
        // Drop `appendix` from the copy so the recursive render below does
        // not try to move it again.
        const print = Object.assign({}, b.print); delete print.appendix;
        moved[t].push(Object.assign({}, b, { section: 'Appendix: ' + t, print }));
      }
      let html = renderBlocks(inPlace, opts);
      for (const t of titles) {
        // No gold rule: the appendix starts on a fresh page (booklet.js
        // paginate honours `.print-appendix`), so a rule would only strand
        // itself at the foot of the last page of the service.
        html += renderBlocks(moved[t], opts)
          .replace('<div class="svc-sec">', `<div class="svc-sec print-appendix" data-appendix="${esc(t)}">`)
          .replace('<div class="svc-head">', `<div class="svc-head appendix-head" data-appendix="${esc(t)}">`);
      }
      return html;
    }

    // Group consecutive blocks by section
    const sections = [];
    let currentSection = null;

    for (const block of blocks) {
      // Choir dividers are standalone — always start a new group
      if (block.type === 'choir-divider') {
        sections.push({ name: null, blocks: [block], isDivider: true });
        currentSection = null;
        continue;
      }
      if (block.section !== currentSection) {
        sections.push({ name: block.section, blocks: [] });
        currentSection = block.section;
      }
      sections[sections.length - 1].blocks.push(block);
    }

    // Build education module map if modules were provided
    const eduMap = (opts && opts.educationModules)
      ? buildEducationMap(opts.educationModules)
      : null;
    const eduRendered = {};  // track which modules we've already rendered

    let html = '';

    for (let i = 0; i < sections.length; i++) {
      const { name, blocks: sblocks, isDivider } = sections[i];

      // Choir dividers render directly
      if (isDivider) {
        html += renderBlock(sblocks[0], opts);
        continue;
      }

      // Gold rule between sections (not before the first)
      if (i > 0 && !sections[i - 1].isDivider) {
        html += '<div class="svc-rule"></div>';
      }

      // Education module injection — render before matching section
      if (eduMap && name && !eduRendered[name]) {
        const mod = eduMap[name];
        if (mod) {
          html += renderEducationModule(mod);
          eduRendered[name] = true;
        }
      }

      // Collect unique source labels for the dev-mode tag
      const sources = [...new Set(sblocks.map(b => {
        if (b.source && b.provenance) return `${b.source} (${b.provenance})`;
        return b.provenance || b.source;
      }).filter(Boolean))];
      const srcTag = sources.length
        ? `<span class="src-tag">${sources.map(esc).join(' \u00B7 ')}</span>`
        : '';

      html += '<div class="svc-sec">';
      if (name) {
        html += `<div class="svc-head">${esc(name.toUpperCase())}${srcTag}</div>`;
      }
      for (const block of sblocks) {
        html += renderBlock(block, opts);
      }
      html += '</div>';
    }

    return html;
  }

  window.renderBlocks = renderBlocks;
  window.filterForChoir = filterForChoir;
})();
