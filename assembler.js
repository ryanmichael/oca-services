'use strict';

/**
 * Top-level facade for the Orthodox service assemblers.
 *
 * Historical entry point — preserved so existing callers can keep
 * `require('./assembler')`. The actual implementation lives under
 * `./assemblers/`, with one module per service. See
 * `./assemblers/index.js` for the exported surface.
 */

module.exports = require('./assemblers');
