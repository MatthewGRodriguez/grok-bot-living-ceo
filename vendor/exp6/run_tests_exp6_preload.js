/**
 * node -r ./run_tests_exp6_preload.js test_foo.js
 * Remaps require('./JFactor.js') → JFactor_exp6.js for the suite.
 */
'use strict';
var Module = require('module');
var path = require('path');
var exp6 = path.join(__dirname, 'JFactor_exp6.js');
var orig = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === './JFactor.js' || id === path.join(__dirname, 'JFactor.js')) {
    return orig.call(this, exp6);
  }
  return orig.apply(this, arguments);
};
