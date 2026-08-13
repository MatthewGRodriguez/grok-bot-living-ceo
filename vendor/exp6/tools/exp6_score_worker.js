/**
 * Worker thread for Exp6 batch scoring.
 */
'use strict';
var { parentPort } = require('worker_threads');

function scoreRow(methodId, x, y, xMax, yMax, scale) {
  var p = xMax == 0 ? 0 : Math.abs(yMax / xMax);
  var xVal = (Math.abs(x) * p) * 0.5;
  var yVal = Math.abs(y) * 0.5;
  var xNorm = yMax == 0 ? 0 : xVal / Math.abs(yMax);
  var yNorm = yMax == 0 ? 0 : yVal / Math.abs(yMax);
  var xC = (x > 0 && xMax > 0) || (x < 0 && xMax < 0);
  var yC = (y > 0 && yMax > 0) || (y < 0 && yMax < 0);
  var score;
  if (methodId === 0) {
    score = (xC === yC) ? (xNorm + yNorm + (!xC ? 1 : 0)) : -(xNorm + yNorm);
  } else if (methodId === 2) {
    score = xNorm + yNorm + ((!xC && !yC) ? 1 : 0);
  } else {
    score = (xC !== yC) ? (xNorm + yNorm) : (-(xNorm + yNorm) + ((!xC && !yC) ? 1 : 0));
  }
  if (scale > 0) { var t = Math.abs(score) / scale; return t / (1 + t); }
  return score;
}

parentPort.on('message', function (msg) {
  if (!msg || msg.type !== 'score') {
    parentPort.postMessage({ scores: [] });
    return;
  }
  var rows = msg.rows || [];
  var scores = new Float64Array(rows.length);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    scores[i] = r.skip ? -Number.MAX_VALUE : scoreRow(r.methodId, r.x, r.y, r.xMax, r.yMax, r.scale || 0);
  }
  parentPort.postMessage({ scores: scores, offset: msg.offset || 0 });
});
