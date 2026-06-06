'use strict';

const { renderService } = require('../../renderer');
const { formatAssemblyWarning } = require('./error-page');

/**
 * Renders blocks as a standalone HTML service sheet with back-bar and warnings.
 * Used by all service routes when format=html is requested.
 */
/**
 * Renders blocks as a standalone HTML service sheet with back-bar and warnings.
 * Used by all service routes when format=html is requested.
 */
function renderServiceHTML(res, blocks, title, date, pronoun) {
  const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
  const html = renderService(blocks, { title, date: `${date}${pronounLabel}` });
  const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
  const rawWarnings = blocks._warnings || [];
  const warningMessages = rawWarnings.map(w => formatAssemblyWarning(w.source, w.key)).filter(Boolean);
  const uniqueWarnings = [...new Set(warningMessages)];
  const warningBanner = uniqueWarnings.length > 0
    ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:10px 40px;background:#fff3cd;border-bottom:2px solid #e6ac00;color:#6b4800;">
         <strong>⚠ Some portions of this service are incomplete:</strong>
         <ul style="margin:4px 0 0 16px;padding:0;">${uniqueWarnings.map(m => `<li>${m}</li>`).join('')}</ul>
       </div>`
    : '';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html.replace('<body>', '<body>' + backBar + warningBanner));
}

module.exports = { renderServiceHTML };
