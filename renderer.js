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

  /* ── Print toolbar ── */
  .print-toolbar {
    position: fixed; top: 12px; right: 16px; z-index: 100;
  }
  .btn-print {
    font-family: "Georgia", serif; font-size: 9pt;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: #8b1a1a; background: #fff;
    border: 1.5px solid #8b1a1a; padding: 6px 16px;
    cursor: pointer; transition: background .12s, color .12s;
  }
  .btn-print:hover { background: #8b1a1a; color: #fff; }

  /* ── Print dialog ── */
  dialog.print-dialog {
    border: none; padding: 36px 32px 28px;
    width: 420px; border-top: 2px solid #8b1a1a;
    box-shadow: 0 8px 40px rgba(0,0,0,0.25);
    font-family: "Georgia", "Times New Roman", serif;
  }
  dialog.print-dialog::backdrop {
    background: rgba(0,0,0,0.55);
  }
  .print-modal-title {
    font-size: 10pt; font-weight: bold; letter-spacing: .16em;
    text-transform: uppercase;
    color: #8b1a1a; text-align: center; margin-bottom: 24px;
  }
  .print-options { display: flex; gap: 14px; margin-bottom: 20px; }
  .print-option {
    flex: 1; padding: 18px 14px; border: 1.5px solid #ddd;
    cursor: pointer; background: none; text-align: left;
    transition: border-color .12s, background .12s;
  }
  .print-option:hover { border-color: #8b1a1a; background: rgba(139,26,26,.04); }
  .print-option-name {
    font-size: 9pt; font-weight: bold; letter-spacing: .14em;
    text-transform: uppercase;
    color: #8b1a1a; display: block; margin-bottom: 7px;
  }
  .print-option-desc {
    font-size: 11pt; font-style: italic;
    color: #666; line-height: 1.5;
  }
  .print-modal-cancel {
    display: block; width: 100%; padding: 9px;
    font-size: 9pt; letter-spacing: .12em; text-transform: uppercase;
    color: #888; background: none; border: 1px solid #ddd;
    cursor: pointer; transition: color .12s, border-color .12s;
  }
  .print-modal-cancel:hover { color: #8b1a1a; border-color: #8b1a1a; }

  /* ── Print ── */
  @media print {
    body { font-size: 11pt; }
    .page { padding: 0.5in 0.6in; max-width: 100%; }
    .section-head { break-before: auto; }
    .block { break-inside: avoid; }
    .print-toolbar, dialog.print-dialog { display: none !important; }
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
function renderService(blocks, options = {}) {
  const title = options.title || 'Service';
  const date  = options.date  || '';

  const bodyHTML = renderBody(blocks);

  const titleEsc = escHtml(title);
  const dateEsc  = date ? escHtml(date) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleEsc}${dateEsc ? ' — ' + dateEsc : ''}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="print-toolbar">
    <button class="btn-print" onclick="openPrintModal()">PRINT</button>
  </div>

  <dialog class="print-dialog" id="print-dialog">
    <div class="print-modal-title">Print Options</div>
    <div class="print-options">
      <button class="print-option" onclick="printStandard()">
        <span class="print-option-name">Standard</span>
        <span class="print-option-desc">Full-page layout, single column, page numbers at bottom</span>
      </button>
      <button class="print-option" onclick="printBooklet()">
        <span class="print-option-name">Booklet</span>
        <span class="print-option-desc">2 pages per sheet — fold in half to assemble</span>
      </button>
    </div>
    <button class="print-modal-cancel" onclick="closePrintModal()">Cancel</button>
  </dialog>

  <div class="page" id="svc-page">
    <div class="service-title">
      <h1>${titleEsc}</h1>
      ${dateEsc ? `<h2>${dateEsc}</h2>` : ''}
    </div>
    ${bodyHTML}
  </div>

  <script>
    function openPrintModal() {
      document.getElementById('print-dialog').showModal();
    }
    function closePrintModal() {
      document.getElementById('print-dialog').close();
    }

    function printStandard() {
      closePrintModal();
      window.print();
    }

    function printBooklet() {
      closePrintModal();
      var page = document.getElementById('svc-page');
      var contentHTML = page.innerHTML;
      var svc  = ${JSON.stringify(title)};
      var date = ${JSON.stringify(date || '')};
      var win = window.open('', '_blank');
      if (!win) { alert('Please allow popups to use booklet printing.'); return; }
      win.document.write(buildBookletDocument(contentHTML, svc, date));
      win.document.close();
    }

    function buildBookletDocument(contentHTML, svc, date) {
      var bookletJS = \`
        document.fonts.ready.then(function() {
          var PAGE_H = 7.0 * 96;
          var measure = document.getElementById('measure');
          var children = Array.from(measure.children);

          // Helper: add an HTML chunk to the current page, starting a new page if needed
          function addToPages(pages, heights, html, h) {
            var idx = pages.length - 1;
            if (heights[idx] + h > PAGE_H && pages[idx].length > 0) {
              pages.push([]); heights.push(0);
              idx = pages.length - 1;
            }
            pages[idx].push(html);
            heights[idx] += h;
          }

          var pages = [[]];
          var heights = [0];
          children.forEach(function(el) {
            var h = el.getBoundingClientRect().height + 16;
            var idx = pages.length - 1;
            var remaining = PAGE_H - heights[idx];

            // If block fits, just add it
            if (heights[idx] + h <= PAGE_H || pages[idx].length === 0) {
              pages[idx].push(el.outerHTML);
              heights[idx] += h;
              return;
            }

            // If block is small enough (<40% of page), move to next page as before
            if (h < PAGE_H * 0.4) {
              pages.push([]); heights.push(0);
              var last = pages.length - 1;
              pages[last].push(el.outerHTML);
              heights[last] += h;
              return;
            }

            // Large block that doesn't fit: split at <br /> boundaries
            var inner = el.innerHTML;
            var parts = inner.split(/<br\\s*\\/?>/i);
            if (parts.length <= 1) {
              // Can't split — move to next page
              pages.push([]); heights.push(0);
              var last = pages.length - 1;
              pages[last].push(el.outerHTML);
              heights[last] += h;
              return;
            }

            // Measure line height from the element
            var lineH = h / parts.length;
            var tag = el.tagName.toLowerCase();
            var cls = el.className ? ' class="' + el.className + '"' : '';

            // Distribute lines across pages
            var chunk = [];
            for (var i = 0; i < parts.length; i++) {
              var chunkH = (chunk.length + 1) * lineH;
              var curIdx = pages.length - 1;
              if (heights[curIdx] + chunkH > PAGE_H && pages[curIdx].length > 0 && chunk.length > 0) {
                // Flush current chunk to this page
                var html = '<' + tag + cls + '>' + chunk.join('<br />') + '</' + tag + '>';
                pages[curIdx].push(html);
                heights[curIdx] += chunk.length * lineH;
                chunk = [];
                pages.push([]); heights.push(0);
              }
              chunk.push(parts[i]);
            }
            // Flush remaining
            if (chunk.length > 0) {
              var curIdx = pages.length - 1;
              var html = '<' + tag + cls + '>' + chunk.join('<br />') + '</' + tag + '>';
              pages[curIdx].push(html);
              heights[curIdx] += chunk.length * lineH;
            }
          });

          // Pad to a multiple of 4 for booklet imposition.
          // Prepend blanks so they land on the outer covers (front/back)
          // rather than scattering through the middle of the booklet.
          while (pages.length % 4 !== 0) pages.unshift([]);
          var n = pages.length;

          var spreads = [];
          for (var k = 0; k < n / 4; k++) {
            spreads.push([n - 1 - 2*k, 2*k]);
            spreads.push([2*k + 1, n - 2 - 2*k]);
          }

          var booklet = document.getElementById('booklet');
          spreads.forEach(function(pair) {
            var spread = document.createElement('div');
            spread.className = 'spread';
            pair.forEach(function(pageIdx, side) {
              var pg = document.createElement('div');
              pg.className = 'bk-page';
              if (pages[pageIdx] && pages[pageIdx].length > 0) {
                pg.innerHTML = pages[pageIdx].join('');
                var pgNum = document.createElement('div');
                pgNum.className = 'bk-page-num ' + (side === 0 ? 'pg-left' : 'pg-right');
                pgNum.textContent = pageIdx + 1;
                pg.appendChild(pgNum);
              }
              spread.appendChild(pg);
            });
            booklet.appendChild(spread);
          });

          measure.style.display = 'none';
          booklet.style.visibility = 'visible';
          setTimeout(function() { window.print(); }, 400);
        });
      \`;

      return '<!DOCTYPE html>\\n' +
        '<html><head><meta charset="utf-8">\\n' +
        '<title>Booklet \\u2014 ' + svc + (date ? ' \\u2014 ' + date : '') + '</title>\\n' +
        '<style>\\n' +
        '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\\n' +
        '#measure { position: absolute; top: -9999px; left: 0; width: 4.5in; }\\n' +
        '#booklet { visibility: hidden; }\\n' +
        '.spread { width: 11in; height: 8.5in; display: flex; break-after: page; }\\n' +
        '.spread:last-child { break-after: auto; }\\n' +
        '.bk-page { width: 5.5in; height: 8.5in; padding: 0.75in 0.5in; overflow: hidden; position: relative; font-family: Georgia, serif; font-size: 11pt; line-height: 1.65; color: #1a1a1a; }\\n' +
        '.bk-page:first-child { border-right: 0.5pt dashed #ccc; }\\n' +
        '.bk-page-num { position: absolute; bottom: 0.4in; font-size: 9pt; color: #666; }\\n' +
        '.pg-left { left: 0.5in; } .pg-right { right: 0.5in; }\\n' +
        '.section-head { font-size: 8pt; font-weight: bold; letter-spacing: .12em; text-transform: uppercase; color: #8b1a1a; text-align: center; margin: 18px 0 8px; padding: 5px 0; border-top: 1px solid #c8a0a0; border-bottom: 1px solid #c8a0a0; }\\n' +
        '.speaker { display: inline-block; font-size: 7.5pt; font-weight: bold; letter-spacing: .10em; text-transform: uppercase; color: #8b1a1a; margin-bottom: 1px; }\\n' +
        'p.rubric { color: #8b1a1a; font-style: italic; font-size: 10pt; margin: 4px 0; }\\n' +
        'p.instruction { color: #666; font-style: italic; font-size: 10pt; margin: 4px 0; }\\n' +
        'p.prayer, p.hymn, p.response { margin: 0 0 7px; font-size: 11pt; }\\n' +
        'p.verse { font-style: italic; color: #444; margin: 3px 0 3px 1em; font-size: 10pt; }\\n' +
        'div.glory-line { font-weight: bold; margin: 8px 0 3px; }\\n' +
        '.source-tag { display: none; }\\n' +
        '.service-title { text-align: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #8b1a1a; }\\n' +
        '.service-title h1 { font-size: 14pt; font-weight: bold; text-transform: uppercase; color: #8b1a1a; margin: 0 0 4px; }\\n' +
        '.service-title h2 { font-size: 11pt; font-weight: normal; color: #555; margin: 0; }\\n' +
        '@page { size: letter landscape; margin: 0; }\\n' +
        '@media screen { body { background: #eee; padding: 20px; } .spread { background: white; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.2); } }\\n' +
        '</style></head><body>\\n' +
        '<div id="measure">' + contentHTML + '</div>\\n' +
        '<div id="booklet"></div>\\n' +
        '<script>' + bookletJS + '<\\/script>\\n' +
        '</body></html>';
    }
  </script>
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

    case 'instruction':
      lines.push(`    <p class="instruction">${text}</p>`);
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

// Backward-compatible alias
const renderVespers = renderService;
module.exports = { renderService, renderVespers };
