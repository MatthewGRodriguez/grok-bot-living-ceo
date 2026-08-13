/**
 * P37/P69 C1: livingRanking densest pack + bridge dispatch (extracted).
 * Never invent $ — review_sot sheet SoT.
 */
'use strict';

var rankingBridge = require('./ranking_bridge');
var tokenView = require('./token_view');

/**
 * @param {object} ctx { tokenViewDispatch(opts), loop }
 */
function livingRanking(ctx, opts) {
  opts = opts || {};
  ctx = ctx || {};
  var loop = ctx.loop || {};
  var action = String(opts.action || opts.op || 'status').toLowerCase();

  if (
    opts.format &&
    (action === 'list_actions' ||
      action === 'list' ||
      action === 'pack_actions' ||
      action === 'pack_joys' ||
      action === 'pack_edges')
  ) {
    var kind =
      action === 'list_actions' || action === 'pack_actions'
        ? 'actions'
        : action === 'list' || action === 'pack_joys'
          ? 'joys'
          : 'edges';
    if (action === 'pack_edges') kind = 'edges';
    var packed = ctx.tokenViewDispatch
      ? ctx.tokenViewDispatch({
          action: 'pack',
          kind: kind,
          format: opts.format || 'toon',
          ranking_root: opts.ranking_root || opts.root
        })
      : { ok: false, error: 'no_token_view' };
    packed.ranking_action = action;
    packed.kind = kind;
    packed.law = 'ranking SoT JSON on disk · TOON at LLM boundary';
    return packed;
  }

  var result = rankingBridge.dispatch(opts);
  try {
    loop.last_ranking = {
      action: opts.action || 'status',
      ok: !!(result && result.ok),
      at: new Date().toISOString(),
      joys_n:
        result && result.index && result.index.joys
          ? result.index.joys.length
          : result && result.joys_n,
      id: result && result.id
    };
  } catch (_e) { /* */ }
  if (result && typeof result === 'object') {
    result.last_ranking = loop.last_ranking || null;
    if (opts.format && result.actions && Array.isArray(result.actions)) {
      result.token_view = tokenView.packRows(
        result.actions.map(function (a) {
          return {
            id: a.id,
            name: a.name,
            kind: a.kind || '',
            pol: a.polarity || '',
            amt: a.amountMonthly != null ? a.amountMonthly : 0,
            cad: a.cadence || ''
          };
        }),
        { format: opts.format, name: 'actions' }
      );
    }
  }
  return result;
}

module.exports = {
  livingRanking: livingRanking
};
