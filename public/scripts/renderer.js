/**
 * renderer.js
 *
 * Converts a ServiceBlock[] array into an HTML string for the panel body.
 * Exported as window.renderBlocks(blocks).
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

  function renderBlock(block) {
    const { type, speaker, text, tone, label } = block;

    switch (type) {
      case 'rubric':
        return `<div class="rubric">${speakerPrefix(speaker)}${esc(text)}</div>`;

      case 'prayer':
      case 'response':
        return `<div class="prayer">${speakerPrefix(speaker)}${esc(text)}</div>`;

      case 'doxology':
        return `<div class="prayer" style="font-style:italic;color:var(--muted)">${esc(text)}</div>`;

      case 'hymn': {
        let html = '';
        if (label) {
          const toneStr = tone ? ` \u2014 Tone ${tone}` : '';
          html += `<div class="stich-label">${esc(label)}${toneStr}</div>`;
        }
        html += `<div class="prayer">${speakerPrefix(speaker)}${esc(text)}</div>`;
        return html;
      }

      case 'verse':
        return `<div class="verse">${esc(text)}</div>`;

      default:
        // Fallback: render as prayer
        return `<div class="prayer">${speakerPrefix(speaker)}${esc(text)}</div>`;
    }
  }

  function renderBlocks(blocks) {
    if (!blocks || blocks.length === 0) {
      return '<div class="panel-loading">No content available.</div>';
    }

    // Group consecutive blocks by section
    const sections = [];
    let currentSection = null;

    for (const block of blocks) {
      if (block.section !== currentSection) {
        sections.push({ name: block.section, blocks: [] });
        currentSection = block.section;
      }
      sections[sections.length - 1].blocks.push(block);
    }

    let html = '';

    for (let i = 0; i < sections.length; i++) {
      const { name, blocks: sblocks } = sections[i];

      // Gold rule between sections (not before the first)
      if (i > 0) {
        html += '<div class="svc-rule"></div>';
      }

      // Collect unique sources in this section for the dev-mode tag
      // Prefer provenance (e.g. "menaion (stSergius)") over plain source
      const sources = [...new Set(sblocks.map(b => b.provenance || b.source).filter(Boolean))];
      const srcTag = sources.length
        ? `<span class="src-tag">${sources.map(esc).join(' · ')}</span>`
        : '';

      html += '<div class="svc-sec">';
      if (name) {
        html += `<div class="svc-head">${esc(name.toUpperCase())}${srcTag}</div>`;
      }
      for (const block of sblocks) {
        html += renderBlock(block);
      }
      html += '</div>';
    }

    return html;
  }

  window.renderBlocks = renderBlocks;
})();
