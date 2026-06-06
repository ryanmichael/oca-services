'use strict';

// Registry of service-name → base fixed-text object. Populated as base files
// load during boot. `getOverlayFixed('liturgy', overlayId)` consults this to
// pick the right base to merge onto.
//
// Mutated at boot only (between requires and `server.listen`). Treat as
// effectively immutable post-boot.
const fixedTextRegistry = {};

function registerBaseFixed(serviceName, baseObj) {
  fixedTextRegistry[serviceName] = baseObj;
}

module.exports = { fixedTextRegistry, registerBaseFixed };
