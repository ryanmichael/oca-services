/**
 * Orthodox Vespers Service Renderer
 *
 * renderVespers(blocks, options) → HTML string
 *
 * Takes the ServiceBlock[] output of assembleVespers() and renders
 * a self-contained HTML service sheet.
 */

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  *, *::before, *::after { box-sizing: border-box; }

  body {
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 13pt;
    line-height: 1.65;
    color: #1a1a1a;
    background: #fff;
    margin: 0;
    padding: 0;
  }

  .page {
    max-width: 680px;
    margin: 0 auto;
    padding: 48px 40px 80px;
  }

  /* ── Cover header ── */
  .service-title {
    text-align: center;
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 2px solid #8b1a1a;
  }

  .service-title h1 {
    font-size: 22pt;
    font-weight: bold;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #8b1a1a;
    margin: 0 0 6px;
  }

  .service-title h2 {
    font-size: 13pt;
    font-weight: normal;
    color: #555;
    margin: 0;
  }

  /* ── Section headings ── */
  .section-head {
    text-align: center;
    font-size: 11pt;
    font-weight: bold;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8b1a1a;
    margin: 36px 0 16px;
    padding: 8px 0;
    border-top: 1px solid #c8a0a0;
    border-bottom: 1px solid #c8a0a0;
  }

  /* ── Speaker label ── */
  .speaker {
    display: inline-block;
    font-size: 8.5pt;
    font-weight: bold;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: #8b1a1a;
    margin-bottom: 1px;
  }

  /* ── Block types ── */
  .block {
    margin-bottom: 10px;
  }

  p.rubric {
    color: #8b1a1a;
    font-style: italic;
    font-size: 11pt;
    margin: 6px 0 6px 0;
  }

  p.prayer {
    margin: 0 0 8px;
  }

  p.hymn {
    margin: 0 0 8px;
  }

  p.verse {
    font-style: italic;
    color: #444;
    margin: 4px 0 4px 1.5em;
    font-size: 11.5pt;
  }

  p.response {
    margin: 0 0 6px;
  }

  div.glory-line {
    font-weight: bold;
    margin: 10px 0 4px;
  }

  /* ── Source tag (tone / book label on hymns) ── */
  .source-tag {
    display: inline-block;
    font-size: 8.5pt;
    font-style: normal;
    color: #666;
    background: #f5f0ec;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 1px 6px;
    margin-left: 6px;
    vertical-align: middle;
  }

  /* ── Print ── */
  @media print {
    body { font-size: 11pt; }
    .page { padding: 0.5in 0.6in; max-width: 100%; }
    .section-head { break-before: auto; }
    .block { break-inside: avoid; }
  }
`;

// ─── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Renders an array of ServiceBlocks to a self-contained HTML string.
 *
 * @param {import('./assembler').ServiceBlock[]} blocks
 * @param {{ title?: string, date?: string }} [options]
 * @returns {string}
 */
function renderVespers(blocks, options = {}) {
  const title = options.title || 'Great Vespers';
  const date  = options.date  || '';

  const bodyHTML = renderBody(blocks);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}${date ? ' — ' + escHtml(date) : ''}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
    <div class="service-title">
      <h1>${escHtml(title)}</h1>
      ${date ? `<h2>${escHtml(date)}</h2>` : ''}
    </div>
    ${bodyHTML}
  </div>
</body>
</html>`;
}

// ─── Body builder ─────────────────────────────────────────────────────────────

function renderBody(blocks) {
  const parts = [];
  let currentSection = null;

  for (const block of blocks) {
    // Section heading on first block of each new section
    if (block.section !== currentSection) {
      parts.push(`    <div class="section-head">${escHtml(block.section)}</div>`);
      currentSection = block.section;
    }

    parts.push(renderBlock(block));
  }

  return parts.join('\n');
}

function renderBlock(block) {
  const lines = [];

  // Speaker label (skip null/falsy)
  if (block.speaker) {
    lines.push(`    <div class="speaker">${escHtml(speakerLabel(block.speaker))}</div>`);
  }

  const text = escHtml(block.text);

  switch (block.type) {
    case 'rubric':
      lines.push(`    <p class="rubric">${text}</p>`);
      break;

    case 'prayer':
    case 'response':
      lines.push(`    <p class="${escHtml(block.type)}">${text}</p>`);
      break;

    case 'verse':
      lines.push(`    <p class="verse">${text}</p>`);
      break;

    case 'doxology':
      lines.push(`    <div class="glory-line">${text}</div>`);
      break;

    case 'hymn': {
      const tag = buildSourceTag(block);
      lines.push(`    <p class="hymn">${text}${tag}</p>`);
      break;
    }

    default:
      lines.push(`    <p class="prayer">${text}</p>`);
  }

  return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSourceTag(block) {
  const parts = [];
  if (block.tone)   parts.push(`Tone ${block.tone}`);
  if (block.source) parts.push(block.source.charAt(0).toUpperCase() + block.source.slice(1));
  if (block.label)  parts.push(block.label);
  if (parts.length === 0) return '';
  return ` <span class="source-tag">${escHtml(parts.join(' · '))}</span>`;
}

function speakerLabel(speaker) {
  const labels = {
    priest:  'Priest',
    deacon:  'Deacon',
    reader:  'Reader',
    choir:   'Choir',
    all:     'All',
  };
  return labels[speaker] || speaker;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br />');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { renderVespers };
