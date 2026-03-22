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
    const { type, speaker, text, tone, label, source } = block;
    const choirMode = opts && opts.choirMode;

    // Choir mode: service divider
    if (type === 'choir-divider') {
      return `<div class="choir-svc-divider">${esc(text)}</div>`;
    }

    // Choir mode: compact litany indicator
    if (type === 'choir-litany') {
      return `<div class="choir-litany">${esc(text)} — respond as usual</div>`;
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
        return `<div class="prayer">${speakerPrefix(speaker)}${esc(text)}</div>`;

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

  // ─── Section grouping + full render ──────────────────────────────────────

  function renderBlocks(blocks, opts) {
    if (!blocks || blocks.length === 0) {
      return '<div class="panel-loading">No content available.</div>';
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
