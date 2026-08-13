/**
 * Thin re-export — Frame/SLP lives inside bundled JFactor_exp6.js.
 * Kept so existing require('./jfactor_exp6_frame.js') keeps working.
 */
'use strict';
require('./JFactor_exp6.js');
var api = (typeof globalThis !== 'undefined' && globalThis.JFExp6Frame) || null;
if (typeof module !== 'undefined') module.exports = api;
