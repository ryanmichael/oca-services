'use strict';

// GET /booklet — the standalone booklet page.
//
// The booklet is a different document from the app: its own page box, its own
// fonts, its own idea of layout. Rendering it inside the app meant fighting the
// shell (height:100%/overflow:hidden clipping print to one page; a panel
// transform capturing fixed children; an abspos measure node escaping its
// clip). Serving it as its own page removes the whole class of collision, and
// it is a normal navigation, so phones do not block it the way they block the
// popup this replaces.

const path = require('path');
const { serveStatic } = require('../_shared/serve-static');

const ROOT = path.resolve(__dirname, '..', '..');

function handle(req, res) {
  serveStatic(res, path.join(ROOT, 'public', 'booklet.html'), 'text/html', req);
}

module.exports = handle;
