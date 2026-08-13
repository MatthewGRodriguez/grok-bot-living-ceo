'use strict';
// First-clone smoke: load vendored Exp6 and print what it exports.
var exp6 = require('../vendor/exp6/JFactor_exp6.js');
console.log('JFactor_exp6 exports:', Object.keys(exp6).join(', '));
console.log('JFExp6Frame', typeof globalThis.JFExp6Frame);
console.log('JFExp6SIMD', typeof globalThis.JFExp6SIMD);
console.log('JFExp6GPU', typeof globalThis.JFExp6GPU);
console.log('JFExp6Workers', typeof globalThis.JFExp6Workers);
