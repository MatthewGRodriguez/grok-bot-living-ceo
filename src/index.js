/**
 * living-core entry — status + optional one rank cycle.
 */
'use strict';

var path = require('path');
var { createRuntime } = require('./runtime');

var rootDir = path.join(__dirname, '..');
var rt = createRuntime({ rootDir: rootDir });

if (require.main === module) {
  console.log(JSON.stringify(rt.status(), null, 2));
  console.log('--- hop0 ---');
  console.log(rt.sense('host').hop0.text);
  console.log('--- rank_cycle ---');
  var cycle = rt.rankCycle('host');
  console.log(JSON.stringify({
    sim_top: cycle.simulated_best && cycle.simulated_best.top,
    best_top: cycle.best && cycle.best.top,
    externals_n: cycle.explore && cycle.explore.externals && cycle.explore.externals.length
  }, null, 2));
}

module.exports = {
  createRuntime: createRuntime,
  runtime: rt
};
