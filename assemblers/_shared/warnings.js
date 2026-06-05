'use strict';

/**
 * Module-singleton warnings accumulator. Each top-level `assemble*()`
 * function calls `reset()` at entry; `resolveSource` (in `./resolve`) calls
 * `push()` when a source/key lookup fails; the assemble function calls
 * `get()` before returning so the warnings travel with the assembled blocks
 * (as `blocks._warnings`).
 *
 * Replaces the module-level `let _warnings = []` that used to live in
 * `assembler.js`. Single-process server semantics preserved.
 */

let warnings = [];

function reset() { warnings = []; }
function push(w) { warnings.push(w); }
function get()   { return warnings.slice(); }

module.exports = { reset, push, get };
