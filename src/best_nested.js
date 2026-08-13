/**
 * P68 C1: host→data nested Best pipeline densest (extracted).
 * Takes bestFn so recursion stays injectable.
 */
'use strict';

var debt = require('./debt');

/**
 * When host Best enters data and data debt remains, run up to 3 data Best ticks.
 * @param {object} ctx { rootDir, setParentGoal(id), best(id) }
 * @param {object|null} top host Best top
 * @returns {{ nested_chain, nested, exploreNoteSuffix }}
 */
function runNestedData(ctx, top) {
  var nested = null;
  var nested_chain = [];
  var exploreNoteSuffix = '';
  if (!top || top.id !== 'data') {
    return { nested_chain: nested_chain, nested: nested, exploreNoteSuffix: exploreNoteSuffix };
  }
  var rootDir = ctx.rootDir;
  var nestGuard = 0;
  while (debt.dataDebt(rootDir).has && nestGuard < 3) {
    nestGuard++;
    try {
      nested = ctx.best('data');
      if (nested && nested.top) {
        nested_chain.push({
          id: nested.top.id,
          j: nested.top.j,
          did: nested.top.did,
          helped: nested.top.helped
        });
      }
      if (nested && nested.top && !nested.top.helped) break;
    } catch (_n) {
      break;
    }
  }
  if (typeof ctx.setParentGoal === 'function') {
    ctx.setParentGoal('host');
  }
  if (nested_chain.length) {
    top.nested_best = nested_chain[nested_chain.length - 1];
    top.nested_chain = nested_chain;
    exploreNoteSuffix =
      '+nested_data:' +
      nested_chain
        .map(function (x) {
          return x.id;
        })
        .join('›');
  }
  return {
    nested_chain: nested_chain,
    nested: nested,
    exploreNoteSuffix: exploreNoteSuffix
  };
}

module.exports = {
  runNestedData: runNestedData
};
