'use strict';

// Public surface used by the server.js facade.
const { boot }     = require('./boot/load-fixed');
const { dispatch } = require('./routes');

module.exports = { boot, dispatch };
