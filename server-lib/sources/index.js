'use strict';

// Public surface of the variable-sources subsystem. server.js should import
// from here rather than reaching into individual modules.

module.exports = {
  ...require('./load'),
  ...require('./octoechos-overlay'),
  ...require('./calendar'),
  ...require('./menaion'),
  ...require('./general-menaion'),
  ...require('./beatitudes'),
  ...require('./propers'),
  ...require('./matins-spec'),
  ...require('./liturgy-from-orthocal'),
  ...require('./db-source'),
};
