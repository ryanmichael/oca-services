'use strict';

/**
 * Lazy, singleton loaders for the three fixed-text JSON files that the
 * assembler reaches for inside callees (rather than receiving as a
 * constructor arg). Behavior unchanged from the inline cache pattern that
 * used to live in `assembler.js`. Node's module cache ensures only one
 * parse per process.
 */

let _kathismata   = null;
let _vespersFixed = null;
let _matinsFixed  = null;

function getKathismata() {
  if (!_kathismata) _kathismata = require('../../fixed-texts/kathismata.json');
  return _kathismata;
}

function getVespersFixed() {
  if (!_vespersFixed) _vespersFixed = require('../../fixed-texts/vespers-fixed.json');
  return _vespersFixed;
}

function getMatinsFixed() {
  if (!_matinsFixed) _matinsFixed = require('../../fixed-texts/matins-fixed.json');
  return _matinsFixed;
}

module.exports = { getKathismata, getVespersFixed, getMatinsFixed };
