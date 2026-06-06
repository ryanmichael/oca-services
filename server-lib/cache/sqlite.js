'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'storage', 'oca.db');

function openDb() {
  const { DatabaseSync } = require('node:sqlite');
  if (!fs.existsSync(DB_PATH)) return null;
  return new DatabaseSync(DB_PATH, { readonly: true });
}

function openDbWrite() {
  const { DatabaseSync } = require('node:sqlite');
  if (!fs.existsSync(DB_PATH)) return null;
  return new DatabaseSync(DB_PATH);
}

module.exports = { openDb, openDbWrite };
