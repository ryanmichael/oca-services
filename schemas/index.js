'use strict';

// Compiles every schema once at startup, then validates JSON content
// against the schema chosen via registry.resolveSchema(relPath).
//
//   validate(relPath, content) => { ok: true } | { ok: false, errors: [...] }

const fs   = require('fs');
const path = require('path');
const Ajv  = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const { resolveSchema, SCHEMA_DIR } = require('./registry');

let _ajv = null;
const _validators = new Map();

function loadAjv() {
  if (_ajv) return _ajv;
  _ajv = new Ajv({
    allErrors:    true,
    strict:       false,
    allowUnionTypes: true
  });
  addFormats(_ajv);

  // Pre-load _defs so $refs into it resolve.
  const defs = JSON.parse(
    fs.readFileSync(path.join(SCHEMA_DIR, '_defs.schema.json'), 'utf8')
  );
  _ajv.addSchema(defs);
  return _ajv;
}

function getValidatorFor(schemaPath) {
  if (_validators.has(schemaPath)) return _validators.get(schemaPath);

  const ajv = loadAjv();
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  // Some $refs are relative (./_defs.schema.json or ../_defs.schema.json).
  // Ajv resolves $refs against the schema's $id, which we have set, but it
  // looks at "addSchema" — so we just ensure _defs is already added.
  let fn;
  try {
    fn = ajv.compile(schema);
  } catch (err) {
    // If compile fails because of an unresolved $ref to _defs, rewrite the
    // refs to the absolute $id and retry.
    const rewritten = JSON.parse(
      JSON.stringify(schema).replace(
        /"\$ref":"\.{1,2}\/_defs\.schema\.json#/g,
        '"$ref":"https://oca-services.local/schemas/_defs.schema.json#'
      )
    );
    fn = ajv.compile(rewritten);
  }

  _validators.set(schemaPath, fn);
  return fn;
}

function validate(relPath, content) {
  const schemaPath = resolveSchema(relPath);
  if (!schemaPath) return { ok: true, skipped: true };

  const fn = getValidatorFor(schemaPath);
  const ok = fn(content);
  if (ok) return { ok: true };

  return {
    ok:     false,
    errors: fn.errors.map((e) => ({
      path:    e.instancePath || '(root)',
      keyword: e.keyword,
      message: e.message,
      params:  e.params
    }))
  };
}

module.exports = { validate, resolveSchema };
