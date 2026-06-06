'use strict';

const { escHtml } = require('../_shared/html');

/**
 * Converts a raw {source, key} warning from assembler.js into a human-readable message.
 * Returns null if the warning is minor/expected and shouldn't be shown.
 */
/**
 * Converts a raw {source, key} warning from assembler.js into a human-readable message.
 * Returns null if the warning is minor/expected and shouldn't be shown.
 */
function formatAssemblyWarning(source, key) {
  const k = key || '';

  if (source === 'octoechos') {
    // Extract tone number
    const toneMatch = k.match(/^tone(\d)/);
    const toneNum = toneMatch ? toneMatch[1] : '?';

    if (k.includes('lordICall.martyrs')) {
      return `Martyrs stichera at Lord, I Have Cried (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('lordICall.departedGlory')) {
      return `Doxastichon "For the Departed" at Lord, I Have Cried (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('lordICall.resurrectional')) {
      return `Resurrectional stichera at Lord, I Have Cried (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('dogmatikon')) {
      return `Dogmatikon (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('aposticha')) {
      return `Aposticha stichera (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('troparion')) {
      return `Resurrectional troparion (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('dismissalTheotokion')) {
      return `Dismissal theotokion (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    return `Octoechos Tone ${toneNum} data is incomplete (${k}).`;
  }

  if (source === 'triodion') {
    if (k.includes('lordICall')) return `Lord, I Have Cried stichera from the Triodion are missing (${k}).`;
    if (k.includes('aposticha')) return `Aposticha stichera from the Triodion are missing (${k}).`;
    if (k.includes('troparia')) return `Troparia from the Triodion are missing (${k}).`;
    return `Triodion texts are missing (${k}).`;
  }

  if (source === 'menaion') {
    if (k.includes('lordICall')) return `Menaion Lord, I Have Cried stichera are not available for this date.`;
    if (k.includes('troparion')) return `Menaion troparion is not available for this date.`;
    return `Menaion texts are not available for this date (${k}).`;
  }

  if (source === 'prokeimena') {
    return `Evening prokeimenon text is missing (${k}).`;
  }

  // 'db' source is the SQLite Lenten/Pentecostarion DB — suppress from user-facing banners
  // (the server handles these separately via its own coverage checks)
  if (source === 'db') return null;

  return `Missing liturgical text: ${source} → ${k}`;
}

function renderErrorPage(message, detail = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Error — OCA Service Texts</title>
  <style>
    body { font-family: Georgia, serif; padding: 60px; color: #1a1a1a; max-width: 640px; margin: 0 auto; }
    h1 { color: #8b1a1a; font-size: 16pt; }
    p { font-size: 12pt; line-height: 1.6; }
    a { color: #8b1a1a; }
    .detail { font-size: 10.5pt; color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h1>Service Unavailable</h1>
  <p>${escHtml(message)}</p>
  ${detail ? `<p class="detail">${escHtml(detail)}</p>` : ''}
  <p><a href="/">← Back</a></p>
</body>
</html>`;
}

module.exports = { formatAssemblyWarning, renderErrorPage };
