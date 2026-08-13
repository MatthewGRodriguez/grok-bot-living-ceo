/**
 * Thin re-export — SIMD scorer lives inside bundled JFactor_exp6.js.
 */
'use strict';
require('./JFactor_exp6.js');
var api = (typeof globalThis !== 'undefined' && globalThis.JFExp6SIMD) || null;
if (typeof module !== 'undefined') module.exports = api;
