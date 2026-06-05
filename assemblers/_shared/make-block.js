'use strict';

/**
 * Factory for a ServiceBlock. Returns `{ id, section, type, speaker, text }`
 * with any non-null/non-undefined `extras` shallow-merged on top.
 *
 * The shape is the contract documented at `schema/service-block.schema.json`.
 * When this signature or merge semantics changes, update the schema in the
 * same commit (per the rule in `schema/README.md` § Contributing).
 */
function makeBlock(id, section, type, speaker, text, extras = {}) {
  const block = { id, section, type, speaker, text };
  for (const [k, v] of Object.entries(extras)) {
    if (v !== undefined && v !== null) block[k] = v;
  }
  return block;
}

module.exports = makeBlock;
