/**
 * JFactor Exp6 (bundled) — Blueprint + PlanIR + FastBest + Frame/SLP monoid + SIMD + GPU.
 *
 * Single-file best path: Frame/SIMD/GPU are inlined above the engine so browser
 * and Node load one script. Thin re-exports remain in jfactor_exp6_*.js for tests.
 */

/**
 * jfactor_exp6_frame.js — zstd-inspired Frame/SLP bytecode + monoid eval for Exp6.
 *
 * Dictionary = action SoA (from planIR layers).
 * Nodes = LIT | SEQ | REP | INCLUDE.
 * Linear spines summarize to V = { delta, counts, certMin } and evaluate in
 * O(nodes · log reps · nRes) via exp-by-squaring — not O(leaves).
 */
(function (global) {
  'use strict';

  var JF_FRAME_LIT = 1;
  var JF_FRAME_SEQ = 2;
  var JF_FRAME_REP = 3;
  var JF_FRAME_INCLUDE = 4;

  function jfNewV(nRes) {
    return {
      delta: new Float64Array(nRes),
      certMin: new Float64Array(nRes),
      counts: Object.create(null), // actionId → count
      nRes: nRes
    };
  }

  function jfCloneV(V) {
    var out = jfNewV(V.nRes);
    out.delta.set(V.delta);
    out.certMin.set(V.certMin);
    for (var k in V.counts) out.counts[k] = V.counts[k];
    if (V.countArr) out.countArr = new Uint32Array(V.countArr);
    if (V.orderIds) out.orderIds = V.orderIds.slice();
    return out;
  }

  /** Unique actionIds from a then newly seen from b (compose / first-seen order). */
  function jfMergeOrderIds(aIds, bIds) {
    if (!aIds || !aIds.length) return bIds && bIds.length ? bIds.slice() : null;
    if (!bIds || !bIds.length) return aIds.slice();
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < aIds.length; i++) {
      var id = aIds[i];
      if (seen[id]) continue;
      seen[id] = 1;
      out.push(id);
    }
    for (var j = 0; j < bIds.length; j++) {
      var idb = bIds[j];
      if (seen[idb]) continue;
      seen[idb] = 1;
      out.push(idb);
    }
    return out;
  }

  /** V_a ⊕ V_b (sequential composition). */
  function jfComposeV(a, b) {
    var n = a.nRes;
    var out = jfNewV(n);
    for (var i = 0; i < n; i++) {
      out.delta[i] = a.delta[i] + b.delta[i];
      var needB = b.certMin[i] - a.delta[i];
      out.certMin[i] = a.certMin[i] > needB ? a.certMin[i] : needB;
      if (out.certMin[i] < 0) out.certMin[i] = 0;
    }
    for (var ka in a.counts) out.counts[ka] = a.counts[ka];
    for (var kb in b.counts) out.counts[kb] = (out.counts[kb] || 0) + b.counts[kb];
    if (a.countArr || b.countArr) {
      var na = (a.countArr && a.countArr.length) || 0;
      var nb = (b.countArr && b.countArr.length) || 0;
      var nC = na > nb ? na : nb;
      if (nC) {
        out.countArr = new Uint32Array(nC);
        if (a.countArr) out.countArr.set(a.countArr);
        if (b.countArr) {
          for (var ib = 0; ib < b.countArr.length; ib++) out.countArr[ib] += b.countArr[ib];
        }
      }
    }
    out.orderIds = jfMergeOrderIds(a.orderIds, b.orderIds);
    return out;
  }

  /** REP(V, k) via exponentiation by squaring. */
  function jfRepV(V, k) {
    k = k | 0;
    if (k <= 0) return jfNewV(V.nRes);
    if (k === 1) return jfCloneV(V);
    var n = V.nRes;
    // cert for k copies: worst-case start requirement
    var out = jfNewV(n);
    for (var i = 0; i < n; i++) {
      out.delta[i] = V.delta[i] * k;
      if (V.delta[i] >= 0) out.certMin[i] = V.certMin[i];
      else out.certMin[i] = V.certMin[i] - (k - 1) * V.delta[i];
      if (out.certMin[i] < 0) out.certMin[i] = 0;
    }
    for (var c in V.counts) out.counts[c] = V.counts[c] * k;
    if (V.countArr) {
      out.countArr = new Uint32Array(V.countArr.length);
      for (var ic = 0; ic < V.countArr.length; ic++) out.countArr[ic] = (V.countArr[ic] * k) >>> 0;
    }
    // First-seen order unchanged by repetition
    if (V.orderIds) out.orderIds = V.orderIds.slice();
    return out;
  }

  function jfVFromLit(ir, layer, localIdx) {
    var n = ir.starts.length;
    var V = jfNewV(n);
    var x = layer.x[localIdx];
    var y = layer.y[localIdx];
    var f = layer.fromIdx[localIdx];
    var t = layer.toIdx[localIdx];
    V.delta[f] -= x;
    V.delta[t] -= y;
    if (x > 0) V.certMin[f] = x;
    if (y > 0) V.certMin[t] = Math.max(V.certMin[t], y);
    var aid = layer.actions[localIdx].actionId;
    V.counts[aid] = 1;
    V.orderIds = [aid];
    return V;
  }

  function jfMasksOverlap(a, b) {
    if (!a || !b) return true;
    for (var i = 0; i < a.length; i++) if (a[i] && b[i]) return true;
    return false;
  }

  /**
   * Compile Frame SLP from planIR (after jfCompressLayer).
   * Bottom-up: children summarized before parents.
   */
  function jfCompileFrame(ir) {
    var nRes = ir.starts.length;
    var layerFrames = new Array(ir.layers.length);
    var nodes = [];

    function addNode(node) {
      node.id = nodes.length;
      nodes.push(node);
      return node.id;
    }

    for (var li = 0; li < ir.layers.length; li++) {
      var layer = ir.layers[li];
      var kidIds = [];
      var touch = new Uint8Array(nRes);
      if (layer.touchMask) touch.set(layer.touchMask);

      for (var s = 0; s < layer.steps.length; s++) {
        var st = layer.steps[s];
        if (st.kind === 'include') {
          var child = ir.layers[st.layer];
          var childFr = layerFrames[st.layer];
          var incId = addNode({
            kind: JF_FRAME_INCLUDE,
            layer: st.layer,
            childNode: childFr ? childFr.rootNode : -1,
            // child.V already includes child.repeat — do not multiply again
            rep: child ? (child.repeat || 1) : 1,
            touchMask: child && child.touchMask ? child.touchMask : touch,
            V: null,
            summarized: false
          });
          if (childFr && childFr.fullySummarized && childFr.V) {
            var incNode = nodes[incId];
            incNode.V = jfCloneV(childFr.V);
            if (childFr.V.countArr) {
              incNode.V.countArr = new Uint32Array(childFr.V.countArr);
            }
            incNode.summarized = true;
          }
          kidIds.push(incId);
        } else {
          var litId = addNode({
            kind: JF_FRAME_LIT,
            layer: li,
            localIdx: st.localIdx,
            actionId: layer.actions[st.localIdx].actionId,
            touchMask: touch,
            V: jfVFromLit(ir, layer, st.localIdx),
            summarized: true
          });
          kidIds.push(litId);
        }
      }

      var rootId;
      if (kidIds.length === 1) {
        rootId = kidIds[0];
      } else {
        rootId = addNode({
          kind: JF_FRAME_SEQ,
          kids: kidIds,
          touchMask: touch,
          V: null,
          summarized: false
        });
      }

      var fully = !!layer.linear;
      var instanceV = null;
      if (fully) {
        for (var k = 0; k < kidIds.length; k++) {
          var kn = nodes[kidIds[k]];
          if (!kn.summarized || !kn.V) {
            fully = false;
            instanceV = null;
            break;
          }
          instanceV = k === 0 ? jfCloneV(kn.V) : jfComposeV(instanceV, kn.V);
        }
        if (fully && nodes[rootId].kind === JF_FRAME_SEQ) {
          nodes[rootId].V = instanceV;
          nodes[rootId].summarized = true;
        } else if (fully && kidIds.length === 1) {
          instanceV = jfCloneV(nodes[kidIds[0]].V);
        }
      }

      // Layer repeat as outer REP when summarized
      var layerV = instanceV;
      if (fully && instanceV && (layer.repeat || 1) > 1) {
        var repId = addNode({
          kind: JF_FRAME_REP,
          child: rootId,
          rep: layer.repeat || 1,
          touchMask: touch,
          V: jfRepV(instanceV, layer.repeat || 1),
          summarized: true
        });
        rootId = repId;
        layerV = nodes[repId].V;
      }

      layerFrames[li] = {
        layer: li,
        name: layer.name,
        rootNode: rootId,
        linear: !!layer.linear,
        hasAfterFork: !!layer.hasAfterFork,
        fullySummarized: fully,
        V: layerV,
        instanceV: instanceV,
        touchMask: touch,
        parallelizable: false
      };
      // Dense count arrays for O(nActions) merge instead of object for-in
      function densify(V, nAct) {
        if (!V || !nAct) return V;
        var arr = new Uint32Array(nAct);
        for (var ck in V.counts) arr[+ck] = V.counts[ck] >>> 0;
        V.countArr = arr;
        return V;
      }
      var nActGlobal = ir.actionNames ? ir.actionNames.length : 0;
      if (fully && instanceV) densify(instanceV, nActGlobal);
      if (fully && layerV) densify(layerV, nActGlobal);

      layer.frameRoot = rootId;
      layer.frameSummarized = fully;
      layer.frameV = layerV;
      layer.frameVInstance = instanceV;

      // Branched layers: summarize deterministic prefix before first after-fork
      // (e.g. Month Rent→…→Week), leaving FastBest only for the fork suffix.
      if (!fully && layer.hasAfterFork) {
        var prefIds = [];
        var prefV = null;
        var forkAt = -1;
        for (var ps = 0; ps < kidIds.length; ps++) {
          var pn = nodes[kidIds[ps]];
          // stop before first non-summarized kid or when we'd include a forked action
          if (!pn.summarized || !pn.V) { forkAt = ps; break; }
          // LIT that is a rival after-fork head (afterIdx shared) — detect via layer.afterIdx
          if (pn.kind === JF_FRAME_LIT) {
            var loc = pn.localIdx;
            var rivals = 0;
            var parent = layer.afterIdx[loc];
            if (parent >= 0) {
              for (var rr = 0; rr < layer.actions.length; rr++) {
                if (layer.afterIdx[rr] === parent) rivals++;
              }
            }
            // also: two roots both afterIdx=-1 competing — if we already have actions and this is second root
            if (rivals > 1) { forkAt = ps; break; }
          }
          prefIds.push(kidIds[ps]);
          prefV = prefV ? jfComposeV(prefV, pn.V) : jfCloneV(pn.V);
        }
        // If fork is among suffix LITs sharing after parent, keep all summarized kids in prefix
        if (forkAt < 0 && prefIds.length) {
          // all kids summarized but layer hasAfterFork — fork among LITs; find first rival
          prefV = null;
          prefIds = [];
          for (var ps2 = 0; ps2 < kidIds.length; ps2++) {
            var pn2 = nodes[kidIds[ps2]];
            if (pn2.kind === JF_FRAME_LIT) {
              var loc2 = pn2.localIdx;
              var par2 = layer.afterIdx[loc2];
              var riv2 = 0;
              if (par2 >= 0) {
                for (var rr2 = 0; rr2 < layer.actions.length; rr2++) {
                  if (layer.afterIdx[rr2] === par2) riv2++;
                }
              }
              if (riv2 > 1) { forkAt = ps2; break; }
            }
            if (!pn2.summarized || !pn2.V) { forkAt = ps2; break; }
            prefIds.push(kidIds[ps2]);
            prefV = prefV ? jfComposeV(prefV, pn2.V) : jfCloneV(pn2.V);
          }
        }
        if (prefV && prefIds.length > 0 && forkAt > 0) {
          var nActP = ir.actionNames ? ir.actionNames.length : 0;
          if (nActP) {
            var arrP = new Uint32Array(nActP);
            for (var ckP in prefV.counts) arrP[+ckP] = prefV.counts[ckP] >>> 0;
            prefV.countArr = arrP;
          }
          layer.framePrefixV = prefV;
          layer.framePrefixLen = forkAt;
          layerFrames[li].prefixV = prefV;
          layerFrames[li].prefixLen = forkAt;
        }
      }
    }

    // Mark parallelizable SEQ kids: consecutive INCLUDE/LIT with disjoint masks
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      if (node.kind !== JF_FRAME_SEQ || !node.kids) continue;
      var groups = [];
      var cur = [];
      var curMask = null;
      for (var i = 0; i < node.kids.length; i++) {
        var ch = nodes[node.kids[i]];
        var m = ch.touchMask;
        if (cur.length && jfMasksOverlap(curMask, m)) {
          if (cur.length > 1) groups.push(cur.slice());
          cur = [node.kids[i]];
          curMask = m ? new Uint8Array(m) : null;
        } else {
          cur.push(node.kids[i]);
          if (!curMask && m) curMask = new Uint8Array(m);
          else if (curMask && m) {
            for (var t = 0; t < m.length; t++) if (m[t]) curMask[t] = 1;
          }
        }
      }
      if (cur.length > 1) groups.push(cur);
      node.parallelGroups = groups;
      if (layerFrames[0]) { /* noop keep lint calm */ }
    }

    for (var lf = 0; lf < layerFrames.length; lf++) {
      var fr = layerFrames[lf];
      var rn = nodes[fr.rootNode];
      fr.parallelizable = !!(rn && rn.parallelGroups && rn.parallelGroups.length);
    }

    return {
      version: 1,
      nRes: nRes,
      nodes: nodes,
      layerFrames: layerFrames,
      rootLayer: ir.rootIdx,
      actionNames: ir.actionNames,
      kinds: {
        LIT: JF_FRAME_LIT,
        SEQ: JF_FRAME_SEQ,
        REP: JF_FRAME_REP,
        INCLUDE: JF_FRAME_INCLUDE
      }
    };
  }

  function jfCertHolds(certMin, stocks) {
    for (var i = 0; i < certMin.length; i++) {
      if (certMin[i] > 0 && stocks[i] + 1e-12 < certMin[i]) return false;
    }
    return true;
  }

  function jfApplyV(stocks, V, rec, ir, expandNames) {
    if (!jfCertHolds(V.certMin, stocks)) return false;
    var n = V.nRes;
    var d = V.delta;
    var i = 0;
    // unroll-ish: tight add
    for (; i + 3 < n; i += 4) {
      stocks[i] += d[i];
      stocks[i + 1] += d[i + 1];
      stocks[i + 2] += d[i + 2];
      stocks[i + 3] += d[i + 3];
    }
    for (; i < n; i++) stocks[i] += d[i];
    var vc = V.counts;
    var rc = rec.counts;
    var names = ir.actionNames;
    // Dense path when compile attached countArr — insert into counts in
    // compose order (orderIds) so Object.keys / UI sequence match spine order.
    if (V.countArr && V.countArr.length) {
      var ca = V.countArr;
      var order = V.orderIds;
      if (order && order.length) {
        var seen = Object.create(null);
        for (var oi = 0; oi < order.length; oi++) {
          var oid = order[oi];
          var co = ca[oid];
          if (!co || seen[oid]) continue;
          seen[oid] = 1;
          var nmo = names[oid];
          rc[nmo] = (rc[nmo] || 0) + co;
          if (expandNames && rec.names) {
            for (var jo = 0; jo < co; jo++) {
              rec.names.push(nmo);
              if (rec.ids) rec.ids.push(oid);
            }
          }
        }
        for (var id = 0; id < ca.length; id++) {
          if (seen[id]) continue;
          var c = ca[id];
          if (!c) continue;
          var nm = names[id];
          rc[nm] = (rc[nm] || 0) + c;
          if (expandNames && rec.names) {
            for (var j = 0; j < c; j++) {
              rec.names.push(nm);
              if (rec.ids) rec.ids.push(id);
            }
          }
        }
      } else {
        for (var id2 = 0; id2 < ca.length; id2++) {
          var c2 = ca[id2];
          if (!c2) continue;
          var nm2 = names[id2];
          rc[nm2] = (rc[nm2] || 0) + c2;
          if (expandNames && rec.names) {
            for (var j2 = 0; j2 < c2; j2++) {
              rec.names.push(nm2);
              if (rec.ids) rec.ids.push(id2);
            }
          }
        }
      }
      return true;
    }
    var orderLoose = V.orderIds;
    if (orderLoose && orderLoose.length) {
      var seenL = Object.create(null);
      for (var ol = 0; ol < orderLoose.length; ol++) {
        var idL = orderLoose[ol];
        var cL = vc[idL];
        if (cL == null || seenL[idL]) continue;
        seenL[idL] = 1;
        var nmL = names[idL];
        rc[nmL] = (rc[nmL] || 0) + cL;
        if (expandNames && rec.names) {
          for (var jl = 0; jl < cL; jl++) {
            rec.names.push(nmL);
            if (rec.ids) rec.ids.push(idL);
          }
        }
      }
      for (var aid in vc) {
        var idA = +aid;
        if (seenL[idA]) continue;
        var cA = vc[aid];
        var nmA = names[idA];
        rc[nmA] = (rc[nmA] || 0) + cA;
        if (expandNames && rec.names) {
          for (var ja = 0; ja < cA; ja++) {
            rec.names.push(nmA);
            if (rec.ids) rec.ids.push(idA);
          }
        }
      }
      return true;
    }
    for (var aid2 in vc) {
      var c3 = vc[aid2];
      var id3 = +aid2;
      var nm3 = names[id3];
      rc[nm3] = (rc[nm3] || 0) + c3;
      if (expandNames && rec.names) {
        for (var j3 = 0; j3 < c3; j3++) {
          rec.names.push(nm3);
          if (rec.ids) rec.ids.push(id3);
        }
      }
    }
    return true;
  }

  /**
   * Apply a summarized layer instance (no outer layer.repeat — caller handles).
   * Uses instance V (without layer-level REP wrapper when frame root is REP).
   */
  function jfApplyLayerMonoid(ir, frame, layerIdx, stocks, rec, expandNames) {
    var layer = ir.layers[layerIdx];
    var fr = frame.layerFrames[layerIdx];
    if (!fr || !fr.fullySummarized || !fr.V) return false;
    // fr.V includes layer.repeat — for single instance use pre-rep V on layer.frameVInstance
    var V = layer.frameVInstance || fr.V;
    // If root is REP of layer.repeat, instance value is the child
    var root = frame.nodes[fr.rootNode];
    if (root && root.kind === JF_FRAME_REP && root.rep === (layer.repeat || 1) && root.rep > 1) {
      var child = frame.nodes[root.child];
      if (child && child.V) V = child.V;
    }
    return jfApplyV(stocks, V, rec, ir, expandNames);
  }

  function jfRunFrameLayerRepeated(ir, frame, layerIdx, stocks, rec, expandNames) {
    var fr = frame.layerFrames[layerIdx];
    if (!fr || !fr.fullySummarized || !fr.V) return false;
    return jfApplyV(stocks, fr.V, rec, ir, expandNames);
  }

  /**
   * Parallel eval of disjoint summarized nodes: compute V offline (already done),
   * apply sequentially in deterministic order (same as SEQ) — parallelism is in
   * composing independent summarized Vs when building, and optional worker fan-out
   * for heavy nodes. Sync path: apply each V; if parallelGroups exist, compose
   * group Vs first (order within group sorted by node id for determinism).
   */
  function jfParallelComposeGroups(frame, node, scratch) {
    if (!node.parallelGroups || !node.parallelGroups.length) return null;
    // Groups are already summarized at compile for linear; runtime uses sequential apply.
    return node.parallelGroups;
  }

  /**
   * Eval Frame root for a plan. Prefer full monoid when root layer summarized;
   * otherwise return false so caller falls back to FastBest hybrid.
   */
  function jfEvalFrame(ir, frame, stocks, rec, opts) {
    opts = opts || {};
    var expand = opts.sequenceMode === 'full';
    var fr = frame.layerFrames[ir.rootIdx];
    if (fr && fr.fullySummarized && fr.V) {
      return jfApplyV(stocks, fr.V, rec, ir, expand);
    }
    return false;
  }

  /**
   * Hybrid: try monoid for summarized includes inside FastBest commit path.
   */
  function jfTryApplyIncludeMonoid(ir, frame, childLayerIdx, stocks, rec, expandNames) {
    if (!frame) return false;
    var fr = frame.layerFrames[childLayerIdx];
    if (!fr || !fr.fullySummarized || !fr.V) return false;
    return jfApplyV(stocks, fr.V, rec, ir, expandNames);
  }

  /** Detect parallelizable independent gate layers for bench / worker path. */
  function jfDisjointSummarizedLayers(frame) {
    var out = [];
    var frames = frame.layerFrames;
    for (var i = 0; i < frames.length; i++) {
      if (!frames[i].fullySummarized) continue;
      for (var j = i + 1; j < frames.length; j++) {
        if (!frames[j].fullySummarized) continue;
        if (!jfMasksOverlap(frames[i].touchMask, frames[j].touchMask)) {
          out.push([i, j]);
        }
      }
    }
    return out;
  }

  /**
   * Disjoint monoid apply: each summarized V is self-contained. Compute deltas
   * independently (parallelizable), then merge onto stocks in sorted layer order
   * for determinism. Uses sync fan-out via optional parallelFn(tasks)->results;
   * default runs tasks sequentially but still separates compute from merge.
   */
  function jfApplyDisjointMonoid(ir, frame, layerIdxs, stocks, rec, expandNames, parallelFn) {
    var sorted = layerIdxs.slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < sorted.length; i++) {
      for (var j = i + 1; j < sorted.length; j++) {
        var a = frame.layerFrames[sorted[i]];
        var b = frame.layerFrames[sorted[j]];
        if (jfMasksOverlap(a.touchMask, b.touchMask)) return false;
      }
    }
    var tasks = sorted.map(function (li) {
      return function () {
        var fr = frame.layerFrames[li];
        return fr && fr.V ? fr.V : null;
      };
    });
    var values;
    if (typeof parallelFn === 'function') {
      values = parallelFn(tasks);
    } else {
      values = tasks.map(function (t) { return t(); });
    }
    for (var k = 0; k < values.length; k++) {
      if (!values[k]) return false;
      if (!jfApplyV(stocks, values[k], rec, ir, expandNames)) return false;
    }
    return true;
  }

  /**
   * Node worker-thread parallel map when available; else sync.
   * parallelFn signature matches jfApplyDisjointMonoid.
   */
  function jfMakeParallelRunner() {
    // Sync runner only — do not spawn worker_threads here (keeps Node alive).
    var W = (typeof globalThis !== 'undefined' && globalThis.JFExp6Workers) || null;
    if (W && typeof W.makeParallelRunner === 'function') return W.makeParallelRunner();
    return function (tasks) {
      var out = new Array(tasks.length);
      for (var i = 0; i < tasks.length; i++) out[i] = tasks[i]();
      return out;
    };
  }

  var api = {
    JF_FRAME_LIT: JF_FRAME_LIT,
    JF_FRAME_SEQ: JF_FRAME_SEQ,
    JF_FRAME_REP: JF_FRAME_REP,
    JF_FRAME_INCLUDE: JF_FRAME_INCLUDE,
    jfCompileFrame: jfCompileFrame,
    jfComposeV: jfComposeV,
    jfRepV: jfRepV,
    jfApplyV: jfApplyV,
    jfEvalFrame: jfEvalFrame,
    jfTryApplyIncludeMonoid: jfTryApplyIncludeMonoid,
    jfRunFrameLayerRepeated: jfRunFrameLayerRepeated,
    jfApplyLayerMonoid: jfApplyLayerMonoid,
    jfDisjointSummarizedLayers: jfDisjointSummarizedLayers,
    jfApplyDisjointMonoid: jfApplyDisjointMonoid,
    jfMakeParallelRunner: jfMakeParallelRunner,
    jfMasksOverlap: jfMasksOverlap,
    jfParallelComposeGroups: jfParallelComposeGroups
  };

  global.JFExp6Frame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * jfactor_exp6_simd.js — WASM (+ SIMD) batch scorer + field Best kernel.
 */
(function (global) {
  'use strict';

    var WASM_B64 = "AGFzbQEAAAABMwRgBn98fHx8fAF8YAl/f39/f39/f38AYBN/f3x/f39/f39/f3x8fHx8fH9/AGACf38BfQMFBAABAgMFBgEBgAKACAdEBQZtZW1vcnkCAAlzY29yZV9vbmUAAA9zY29yZV9iYXRjaF9zb2EAAQpmaWVsZF9iZXN0AAIMc2ltZF9zdW1fZjMyAAMK+goErAMDBXwCfwJ8RAAAAAAAAAAAIQYgA0QAAAAAAAAAAGIEQCAEIAOjmSEGCyABmSAGokQAAAAAAADgP6IhByACmUQAAAAAAADgP6IhCEQAAAAAAAAAACEJRAAAAAAAAAAAIQogBEQAAAAAAAAAAGIEQCAHIASZoyEJIAggBJmjIQoLIAFEAAAAAAAAAABkIANEAAAAAAAAAABkcSABRAAAAAAAAAAAYyADRAAAAAAAAAAAY3FyIQsgAkQAAAAAAAAAAGQgBEQAAAAAAAAAAGRxIAJEAAAAAAAAAABjIAREAAAAAAAAAABjcXIhDEQAAAAAAAAAACENIABBAEYEQCALIAxGBEAgCSAKoCENIAtFBEAgDUQAAAAAAADwP6AhDQsFIAkgCqCaIQ0LBSAAQQJGBEAgCSAKoCENIAtFIAxFcQRAIA1EAAAAAAAA8D+gIQ0LBSALIAxHBEAgCSAKoCENBSAJIAqgmiENIAtFIAxFcQRAIA1EAAAAAAAA8D+gIQ0LCwsLIAVEAAAAAAAAAABkBEAgDZkgBaMhDiAORAAAAAAAAPA/IA6goyENCyANC4oBAgF/AXwDQCAJIABJBEAgByAJai0AAARAIAggCUEDdGpE////////7/85AwAFIAEgCWosAAAgAiAJQQN0aisDACADIAlBA3RqKwMAIAQgCUEDdGorAwAgBSAJQQN0aisDACAGIAlBA3RqKwMAEAAhCiAIIAlBA3RqIAo5AwALIAlBAWohCQwBCwsLrgUFAn8FfAJ/D3wBf0F/IRREnHUAiDzkN/4hFUScdQCIPOQ3/iEWRJx1AIg85Df+ISpBfyErA0AgEyAASQRAIAMgE0ECdGoqAgC7ISIgBCATQQJ0aioCALshIyAFIBNBAnRqKgIAuyEkIAYgE0ECdGoqAgC7ISUgByATQQJ0aioCALshJiAIIBNBAnRqKgIAuyEnIAkgE0ECdGoqAgC7ISggCiATQQJ0aioCALshKSAiRAAAAAAAAABAoiAjRDMzMzMzM/M/oqAgJEQAAAAAAADgP6KgICVEMzMzMzMz4z+ioCAmRJqZmZmZmfE/oqAgJ0TNzMzMzMzsP6KgIChEzczMzMzM9D+ioCApRJqZmZmZmek/oqAhFyAiRAAAAAAAAAhAoiAkoCAjRAAAAAAAAPg/oqAgJaAgJqAgJ0QAAAAAAAAAQKKgIRggF0SamZmZmZkBQKIgGER7FK5H4XqEP6KgIAtEAAAAAAAACECioSAMRAAAAAAAAABAoqEhGSATIAFwIRogEyABbiEbIBq4RAAAAAAAAOA/oCACoiEcIBu4RAAAAAAAAOA/oCACoiEdIBwgDaEhHiAdIA6hIR8gHiAeoiAfIB+ioJ8hICAcIA+hIR4gHSAQoSEfIB4gHqIgHyAfoqCfISEgGSAgRDvfT42XbpI/oqEhGSAZRAAAAAAAAAAARAAAAAAAgGZAICGhpUR7FK5H4XqEP6KgIRkgGUSamZmZmZnhP6IhGSATIBFGBEAgGSEWCyAZICpkBEAgGSEqIBMhKwsgE0EBaiETDAELCyArIRQgKiEVIBFBAE4gFkSw95k5/RwD/mRxBEAgFkQAAAAAAAAEQKAgKkSamZmZmZnpP6FmBEAgESEUIBZEAAAAAAAABECgIRULCyASIBQ2AgAgEkEIaiAVOQMAC40BBAF/AXsBfQF7/QwAAAAAAAAAAAAAAAAAAAAAIQMCQANAIAJBBGogAUsNASAAIAJBAnRq/QAEACEFIAMgBf3kASEDIAJBBGohAgwACwsgA/0fACAD/R8BkiAD/R8CIAP9HwOSkiEEA0AgAiABSQRAIAQgACACQQJ0aioCAJIhBCACQQFqIQIMAQsLIAQL";

  function b64ToU8(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function scoreRowJs(methodId, x, y, xMax, yMax, scale) {
    var p = xMax == 0 ? 0 : Math.abs(yMax / xMax);
    var xVal = (Math.abs(x) * p) * 0.5;
    var yVal = Math.abs(y) * 0.5;
    var xNorm = yMax == 0 ? 0 : xVal / Math.abs(yMax);
    var yNorm = yMax == 0 ? 0 : yVal / Math.abs(yMax);
    var xConsuming = (x > 0 && xMax > 0) || (x < 0 && xMax < 0);
    var yConsuming = (y > 0 && yMax > 0) || (y < 0 && yMax < 0);
    var score;
    if (methodId === 0) {
      if (xConsuming === yConsuming) {
        score = xNorm + yNorm;
        if (!xConsuming) score += 1.0;
      } else score = -(xNorm + yNorm);
    } else if (methodId === 2) {
      score = xNorm + yNorm;
      if (!xConsuming && !yConsuming) score += 1.0;
    } else {
      if (xConsuming !== yConsuming) score = xNorm + yNorm;
      else {
        score = -(xNorm + yNorm);
        if (!xConsuming && !yConsuming) score += 1.0;
      }
    }
    if (scale > 0) {
      var t = Math.abs(score) / scale;
      return t / (1 + t);
    }
    return score;
  }

  var wasm = {
    ready: false,
    simd: false,
    exports: null,
    memory: null
  };

  function ensureWasm() {
    if (wasm.exports || !WASM_B64) return !!wasm.exports;
    try {
      var bytes = b64ToU8(WASM_B64);
      var mod = new WebAssembly.Module(bytes);
      var inst = new WebAssembly.Instance(mod, {});
      wasm.exports = inst.exports;
      wasm.memory = inst.exports.memory;
      wasm.ready = true;
      try {
        var tmp = new Float32Array(wasm.memory.buffer, 0, 4);
        tmp[0] = 1; tmp[1] = 1; tmp[2] = 1; tmp[3] = 1;
        var s = wasm.exports.simd_sum_f32(0, 4);
        wasm.simd = Math.abs(s - 4) < 1e-5;
      } catch (_e) { wasm.simd = false; }
    } catch (err) {
      console.warn('JFExp6SIMD WASM init failed', err && err.message);
      wasm.ready = false;
    }
    return !!wasm.exports;
  }

  var fieldArena = null; // { n, layerN, basePtr, outPtr, layers }

  function growMem(need) {
    var pages = wasm.memory.buffer.byteLength / 65536;
    var want = Math.ceil(need / 65536);
    if (want > pages) {
      wasm.memory.grow(want - pages);
      // memory.grow detaches views — rebuild field arena views
      if (fieldArena) refreshFieldArenaViews();
    }
  }

  function refreshFieldArenaViews() {
    if (!fieldArena || !wasm.memory) return;
    var n = fieldArena.n;
    var layerN = fieldArena.layerN;
    var base = fieldArena.basePtr;
    var buf = wasm.memory.buffer;
    var layers = fieldArena.layers;
    for (var li = 0; li < layerN; li++) {
      layers[li] = new Float32Array(buf, base + li * n * 4, n);
    }
  }

  /**
   * Allocate layer Float32Arrays inside WASM memory so fieldBest is zero-copy.
   * Returns { layers, n, layerN, outPtr }.
   */
  function allocFieldArena(n, layerN) {
    if (!ensureWasm()) return null;
    layerN = layerN || 16;
    n = n | 0;
    var basePtr = 0;
    var bytes = n * 4 * layerN;
    var outPtr = (bytes + 15) & ~7;
    growMem(outPtr + 16 + 1024 * 1024); // headroom for score_batch scratch
    fieldArena = { n: n, layerN: layerN, basePtr: basePtr, outPtr: outPtr, layers: [] };
    refreshFieldArenaViews();
    // zero
    for (var li = 0; li < layerN; li++) fieldArena.layers[li].fill(0);
    return fieldArena;
  }

  function scratchBase() {
    // score_batch scratch lives after field arena (or 0 if none)
    return fieldArena ? ((fieldArena.outPtr + 64 + 7) & ~7) : 0;
  }

  function scoreSyncJs(rows) {
    var n = rows.length;
    var out = new Float64Array(n);
    for (var j = 0; j < n; j++) {
      var r = rows[j];
      if (r.skip) out[j] = -Number.MAX_VALUE;
      else out[j] = scoreRowJs(r.methodId, r.x, r.y, r.xMax, r.yMax, r.scale || 0);
    }
    return out;
  }

  function scoreSyncWasm(rows) {
    if (!ensureWasm()) return scoreSyncJs(rows);
    var n = rows.length;
    var midB = n;
    var f64B = n * 8;
    var skipB = n;
    var outB = n * 8;
    // layout after field arena: mid | x | y | xMax | yMax | scale | skip | out
    var midPtr = scratchBase();
    var xPtr = (midPtr + midB + 7) & ~7;
    var yPtr = xPtr + f64B;
    var xMaxPtr = yPtr + f64B;
    var yMaxPtr = xMaxPtr + f64B;
    var scalePtr = yMaxPtr + f64B;
    var skipPtr = scalePtr + f64B;
    var outPtr = (skipPtr + skipB + 7) & ~7;
    var need = outPtr + outB;
    growMem(need);
    var buf = wasm.memory.buffer;
    var mid = new Int8Array(buf, midPtr, n);
    var x = new Float64Array(buf, xPtr, n);
    var y = new Float64Array(buf, yPtr, n);
    var xMax = new Float64Array(buf, xMaxPtr, n);
    var yMax = new Float64Array(buf, yMaxPtr, n);
    var scale = new Float64Array(buf, scalePtr, n);
    var skip = new Uint8Array(buf, skipPtr, n);
    for (var i = 0; i < n; i++) {
      var r = rows[i];
      if (r.skip) { skip[i] = 1; mid[i] = 0; x[i] = y[i] = xMax[i] = yMax[i] = scale[i] = 0; continue; }
      skip[i] = 0;
      mid[i] = r.methodId;
      x[i] = r.x; y[i] = r.y; xMax[i] = r.xMax; yMax[i] = r.yMax; scale[i] = r.scale || 0;
    }
    wasm.exports.score_batch_soa(n, midPtr, xPtr, yPtr, xMaxPtr, yMaxPtr, scalePtr, skipPtr, outPtr);
    return new Float64Array(wasm.memory.buffer.slice(outPtr, outPtr + outB));
  }

  function scoreSync(rows) {
    if (rows.length >= 8 && ensureWasm()) return scoreSyncWasm(rows);
    return scoreSyncJs(rows);
  }

  /**
   * Best-all-pixels field kernel. Prefer zero-copy when layers live in
   * allocFieldArena (pass layerIndex map or useArena:true with L_* indices).
   * Returns { i, score, backend }.
   */
  function fieldBest(opts) {
    var n = opts.n | 0;
    var gw = opts.gw | 0;
    var step = +opts.step || 1;
    var stickyI = opts.stickyI == null ? -1 : (opts.stickyI | 0);
    var align = +opts.align || 0;
    var close = +opts.close || 0;
    var ex = +opts.ex || 0, ey = +opts.ey || 0;
    var px = +opts.px || 0, py = +opts.py || 0;
    var SC = opts.SC, TP = opts.TP, HT = opts.HT, SR = opts.SR;
    var CH = opts.CH, WK = opts.WK, EC = opts.EC, WD = opts.WD;

    // Zero-copy path: layers are views into fieldArena
    if (ensureWasm() && fieldArena && fieldArena.n === n && opts.useArena && opts.idx) {
      refreshFieldArenaViews();
      var idx = opts.idx;
      var base = fieldArena.basePtr;
      var bpe = n * 4;
      var scPtr = base + idx.SC * bpe;
      var tpPtr = base + idx.TP * bpe;
      var htPtr = base + idx.HT * bpe;
      var srPtr = base + idx.SR * bpe;
      var chPtr = base + idx.CH * bpe;
      var wkPtr = base + idx.WK * bpe;
      var ecPtr = base + idx.EC * bpe;
      var wdPtr = base + idx.WD * bpe;
      var outPtr = fieldArena.outPtr;
      wasm.exports.field_best(
        n, gw, step,
        scPtr, tpPtr, htPtr, srPtr, chPtr, wkPtr, ecPtr, wdPtr,
        align, close, ex, ey, px, py, stickyI, outPtr
      );
      var bestI0 = new Int32Array(wasm.memory.buffer, outPtr, 1)[0];
      var bestS0 = new Float64Array(wasm.memory.buffer, outPtr + 8, 1)[0];
      return { i: bestI0, score: bestS0, backend: wasm.simd ? 'wasm-simd' : 'wasm' };
    }

    // Copy path only for modest n (large copies lose to JS)
    if (ensureWasm() && SC && SC.length >= n && n <= 80000) {
      var bytes = n * 4;
      var base0 = scratchBase();
      var scPtr2 = base0;
      var tpPtr2 = scPtr2 + bytes;
      var htPtr2 = tpPtr2 + bytes;
      var srPtr2 = htPtr2 + bytes;
      var chPtr2 = srPtr2 + bytes;
      var wkPtr2 = chPtr2 + bytes;
      var ecPtr2 = wkPtr2 + bytes;
      var wdPtr2 = ecPtr2 + bytes;
      var outPtr2 = (wdPtr2 + bytes + 15) & ~7;
      growMem(outPtr2 + 16);
      var buf = wasm.memory.buffer;
      new Float32Array(buf, scPtr2, n).set(SC.subarray(0, n));
      new Float32Array(buf, tpPtr2, n).set(TP.subarray(0, n));
      new Float32Array(buf, htPtr2, n).set(HT.subarray(0, n));
      new Float32Array(buf, srPtr2, n).set(SR.subarray(0, n));
      new Float32Array(buf, chPtr2, n).set(CH.subarray(0, n));
      new Float32Array(buf, wkPtr2, n).set(WK.subarray(0, n));
      new Float32Array(buf, ecPtr2, n).set(EC.subarray(0, n));
      new Float32Array(buf, wdPtr2, n).set(WD.subarray(0, n));
      wasm.exports.field_best(
        n, gw, step,
        scPtr2, tpPtr2, htPtr2, srPtr2, chPtr2, wkPtr2, ecPtr2, wdPtr2,
        align, close, ex, ey, px, py, stickyI, outPtr2
      );
      var bestI = new Int32Array(wasm.memory.buffer, outPtr2, 1)[0];
      var bestS = new Float64Array(wasm.memory.buffer, outPtr2 + 8, 1)[0];
      return { i: bestI, score: bestS, backend: wasm.simd ? 'wasm-simd' : 'wasm' };
    }

    // JS fallback (same math as field best-all-pixels)
    var rawBest = -Infinity, rawI = -1, stickyRaw = -Infinity;
    for (var i = 0; i < n; i++) {
      var X = SC[i] * 2 + TP[i] * 1.2 + HT[i] * 0.5 + SR[i] * 0.6 +
        CH[i] * 1.1 + WK[i] * 0.9 + EC[i] * 1.3 + WD[i] * 0.8;
      var Y = SC[i] * 3 + HT[i] + TP[i] * 1.5 + SR[i] + CH[i] + WK[i] * 2;
      var sPix = X * 2.2 + Y * 0.01 - align * 3 - close * 2;
      var gx = i % gw;
      var gy = (i / gw) | 0;
      var cx = (gx + 0.5) * step;
      var cy = (gy + 0.5) * step;
      var dShip = Math.hypot(cx - ex, cy - ey);
      var dFoe = Math.hypot(cx - px, cy - py);
      sPix -= dShip * 0.018;
      sPix += Math.max(0, 180 - dFoe) * 0.01;
      sPix *= 0.55;
      if (i === stickyI) stickyRaw = sPix;
      if (sPix > rawBest) { rawBest = sPix; rawI = i; }
    }
    var bestPix = rawI, pixScore = rawBest;
    if (stickyI >= 0 && stickyRaw > -Infinity && stickyRaw + 2.5 >= rawBest - 0.8) {
      bestPix = stickyI;
      pixScore = stickyRaw + 2.5;
    }
    return { i: bestPix, score: pixScore, backend: 'js' };
  }

  ensureWasm();

  var api = {
    scoreSync: scoreSync,
    scoreSyncJs: scoreSyncJs,
    fieldBest: fieldBest,
    allocFieldArena: allocFieldArena,
    refreshFieldArenaViews: refreshFieldArenaViews,
    scoreRow: scoreRowJs,
    ready: true,
    get wasmReady() { return !!wasm.exports; },
    get simd() { return wasm.simd; },
    get fieldArena() { return fieldArena; },
    ensureWasm: ensureWasm
  };
  global.JFExp6SIMD = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);


/**
 * jfactor_exp6_gpu.js — WebGPU batch scorer with sync cache warm path.
 */
(function (global) {
  'use strict';

  var METHOD_DIRECT = 0;
  var METHOD_INDIRECT = 1;
  var METHOD_NEUTRAL = 2;

  function scoreRow(row) {
    if (row.skip) return -Number.MAX_VALUE;
    var x = row.x, y = row.y, xMax = row.xMax, yMax = row.yMax;
    var methodId = row.methodId, scale = row.scale;
    var p = xMax == 0 ? 0 : Math.abs(yMax / xMax);
    var xVal = (Math.abs(x) * p) * 0.5;
    var yVal = Math.abs(y) * 0.5;
    var xNorm = yMax == 0 ? 0 : xVal / Math.abs(yMax);
    var yNorm = yMax == 0 ? 0 : yVal / Math.abs(yMax);
    var xConsuming = (x > 0 && xMax > 0) || (x < 0 && xMax < 0);
    var yConsuming = (y > 0 && yMax > 0) || (y < 0 && yMax < 0);
    var score;
    if (methodId === METHOD_DIRECT) {
      if (xConsuming === yConsuming) {
        score = xNorm + yNorm;
        if (!xConsuming) score += 1.0;
      } else score = -(xNorm + yNorm);
    } else if (methodId === METHOD_NEUTRAL) {
      score = xNorm + yNorm;
      if (!xConsuming && !yConsuming) score += 1.0;
    } else {
      if (xConsuming !== yConsuming) score = xNorm + yNorm;
      else {
        score = -(xNorm + yNorm);
        if (!xConsuming && !yConsuming) score += 1.0;
      }
    }
    if (scale != null && scale > 0) {
      var t = Math.abs(score) / scale;
      return t / (1 + t);
    }
    return score;
  }

  function scoreCpu(rows) {
    var out = new Float32Array(rows.length);
    for (var i = 0; i < rows.length; i++) out[i] = scoreRow(rows[i]);
    return out;
  }

  var gpuState = {
    device: null,
    pipeline: null,
    fieldPipeline: null,
    ready: false,
    cacheKey: '',
    cacheScores: null,
    pending: null
  };

  var WGSL = [
    'struct Row {',
    '  methodId: f32, x: f32, y: f32, xMax: f32, yMax: f32, scale: f32, skip: f32, _pad: f32,',
    '};',
    '@group(0) @binding(0) var<storage, read> rows: array<Row>;',
    '@group(0) @binding(1) var<storage, read_write> scores: array<f32>;',
    '@compute @workgroup_size(64)',
    'fn main(@builtin(global_invocation_id) gid: vec3<u32>) {',
    '  let i = gid.x;',
    '  if (i >= arrayLength(&rows)) { return; }',
    '  let r = rows[i];',
    '  if (r.skip > 0.5) { scores[i] = -3.402823e38; return; }',
    '  let x = r.x; let y = r.y; let xMax = r.xMax; let yMax = r.yMax;',
    '  var p = 0.0;',
    '  if (xMax != 0.0) { p = abs(yMax / xMax); }',
    '  let xVal = (abs(x) * p) * 0.5;',
    '  let yVal = abs(y) * 0.5;',
    '  var xNorm = 0.0; var yNorm = 0.0;',
    '  if (yMax != 0.0) { xNorm = xVal / abs(yMax); yNorm = yVal / abs(yMax); }',
    '  let xConsuming = select(0.0, 1.0, (x > 0.0 && xMax > 0.0) || (x < 0.0 && xMax < 0.0));',
    '  let yConsuming = select(0.0, 1.0, (y > 0.0 && yMax > 0.0) || (y < 0.0 && yMax < 0.0));',
    '  var score = 0.0;',
    '  let mid = i32(r.methodId);',
    '  if (mid == 0) {',
    '    if (xConsuming == yConsuming) { score = xNorm + yNorm; if (xConsuming < 0.5) { score = score + 1.0; } }',
    '    else { score = -(xNorm + yNorm); }',
    '  } else if (mid == 2) {',
    '    score = xNorm + yNorm;',
    '    if (xConsuming < 0.5 && yConsuming < 0.5) { score = score + 1.0; }',
    '  } else {',
    '    if (xConsuming != yConsuming) { score = xNorm + yNorm; }',
    '    else { score = -(xNorm + yNorm); if (xConsuming < 0.5 && yConsuming < 0.5) { score = score + 1.0; } }',
    '  }',
    '  if (r.scale > 0.0) { let t = abs(score) / r.scale; score = t / (1.0 + t); }',
    '  scores[i] = score;',
    '}'
  ].join('\n');

  function rowsKey(rows) {
    var n = rows.length;
    var h = n * 2654435761;
    var step = Math.max(1, (n / 32) | 0);
    for (var i = 0; i < n; i += step) {
      var r = rows[i];
      if (!r || r.skip) { h = (h + 1) | 0; continue; }
      h = (h + ((r.methodId + 1) * 17)) | 0;
      h = (h + ((r.x * 1000) | 0) + ((r.y * 1000) | 0)) | 0;
      h = (h + ((r.xMax * 10) | 0) + ((r.yMax * 10) | 0)) | 0;
    }
    return n + ':' + (h >>> 0);
  }

  async function init() {
    if (!global.navigator || !navigator.gpu) {
      gpuState.ready = false;
      return false;
    }
    try {
      var adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      var device = await adapter.requestDevice();
      var module = device.createShaderModule({ code: WGSL });
      var pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: module, entryPoint: 'main' }
      });
      gpuState.device = device;
      gpuState.pipeline = pipeline;
      gpuState.ready = true;
      return true;
    } catch (err) {
      console.warn('JFExp6GPU.init failed', err);
      gpuState.ready = false;
      return false;
    }
  }

  async function scoreGpuAsync(rows) {
    if (!gpuState.ready || !gpuState.device) return scoreCpu(rows);
    var device = gpuState.device;
    var n = rows.length;
    var stride = 8;
    var rowData = new Float32Array(n * stride);
    for (var i = 0; i < n; i++) {
      var r = rows[i];
      var o = i * stride;
      if (r.skip) { rowData[o + 6] = 1; continue; }
      rowData[o] = r.methodId;
      rowData[o + 1] = r.x; rowData[o + 2] = r.y;
      rowData[o + 3] = r.xMax; rowData[o + 4] = r.yMax;
      rowData[o + 5] = r.scale || 0;
    }
    var rowBuf = device.createBuffer({
      size: rowData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(rowBuf, 0, rowData);
    var scoreBuf = device.createBuffer({
      size: n * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });
    var readBuf = device.createBuffer({
      size: n * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    var bind = device.createBindGroup({
      layout: gpuState.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: rowBuf } },
        { binding: 1, resource: { buffer: scoreBuf } }
      ]
    });
    var enc = device.createCommandEncoder();
    var pass = enc.beginComputePass();
    pass.setPipeline(gpuState.pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(n / 64));
    pass.end();
    enc.copyBufferToBuffer(scoreBuf, 0, readBuf, 0, n * 4);
    device.queue.submit([enc.finish()]);
    await readBuf.mapAsync(GPUMapMode.READ);
    var copy = new Float32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();
    rowBuf.destroy(); scoreBuf.destroy(); readBuf.destroy();
    return copy;
  }

  /** Kick async GPU score; cache for next sync Best if fingerprint matches. */
  function warmScoreAsync(rows) {
    if (!gpuState.ready || rows.length < 64) return;
    var key = rowsKey(rows);
    if (gpuState.pending === key) return;
    gpuState.pending = key;
    scoreGpuAsync(rows).then(function (scores) {
      gpuState.cacheKey = key;
      gpuState.cacheScores = scores;
      if (gpuState.pending === key) gpuState.pending = null;
    }).catch(function () {
      if (gpuState.pending === key) gpuState.pending = null;
    });
  }

  /**
   * Sync scorer for FastBest: use GPU cache when warm + matching fingerprint,
   * else CPU. Always schedules a GPU warm for the next call when eligible.
   */
  function scoreSync(rows) {
    var key = rowsKey(rows);
    if (gpuState.ready && gpuState.cacheScores && gpuState.cacheKey === key &&
        gpuState.cacheScores.length === rows.length) {
      warmScoreAsync(rows);
      return gpuState.cacheScores;
    }
    warmScoreAsync(rows);
    return scoreCpu(rows);
  }

  var api = {
    get ready() { return gpuState.ready; },
    init: init,
    scoreSync: scoreSync,
    scoreGpuAsync: scoreGpuAsync,
    scoreCpu: scoreCpu,
    warmScoreAsync: warmScoreAsync,
    rowsKey: rowsKey
  };

  global.JFExp6GPU = api;
  if (typeof navigator !== 'undefined' && navigator.gpu && typeof api.init === 'function') {
    api.init().catch(function () { /* ignore */ });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);


/**
 * jfactor_exp6_workers.js — worker fan-out helpers.
 */
(function (global) {
  'use strict';

  var pool = {
    workers: [],
    size: 0,
    ready: false,
    backend: 'sync'
  };

  function scoreRowLocal(methodId, x, y, xMax, yMax, scale) {
    var simd = global.JFExp6SIMD;
    if (simd && typeof simd.scoreRow === 'function') {
      return simd.scoreRow(methodId, x, y, xMax, yMax, scale || 0);
    }
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

  function scoreChunkSync(rows) {
    var out = new Float64Array(rows.length);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out[i] = r.skip ? -Number.MAX_VALUE : scoreRowLocal(r.methodId, r.x, r.y, r.xMax, r.yMax, r.scale || 0);
    }
    return out;
  }

  function tryInitPool() {
    if (pool.ready || pool.size) return pool.ready;
    try {
      if (typeof require === 'undefined') return false;
      var wt = require('worker_threads');
      var os = require('os');
      var path = require('path');
      var fs = require('fs');
      var candidates = [
        path.join(process.cwd(), 'tools', 'exp6_score_worker.js'),
        path.join(__dirname, 'exp6_score_worker.js'),
        path.join(__dirname, 'tools', 'exp6_score_worker.js')
      ];
      var workerPath = null;
      for (var c = 0; c < candidates.length; c++) {
        try { fs.accessSync(candidates[c]); workerPath = candidates[c]; break; } catch (_e) {}
      }
      if (!workerPath) return false;
      var n = Math.max(1, Math.min(4, (os.cpus() && os.cpus().length) || 2));
      for (var i = 0; i < n; i++) {
        var worker = new wt.Worker(workerPath);
        worker.unref(); // don't keep Node process alive after tests/benches
        pool.workers.push(worker);
      }
      pool.size = n;
      pool.ready = true;
      pool.backend = 'worker_threads';
      return true;
    } catch (_e) {
      pool.ready = false;
      pool.backend = 'sync';
      return false;
    }
  }

  function mapWorkers(payloads) {
    return new Promise(function (resolve, reject) {
      if (!tryInitPool() || !pool.workers.length) {
        resolve(payloads.map(function (p) {
          if (p.type === 'score') return scoreChunkSync(p.rows);
          return null;
        }));
        return;
      }
      var left = payloads.length;
      var out = new Array(payloads.length);
      var failed = false;
      payloads.forEach(function (payload, idx) {
        var w = pool.workers[idx % pool.workers.length];
        var onMsg = function (msg) {
          w.off('message', onMsg);
          w.off('error', onErr);
          if (failed) return;
          out[idx] = msg;
          if (--left === 0) resolve(out);
        };
        var onErr = function (err) {
          w.off('message', onMsg);
          w.off('error', onErr);
          if (failed) return;
          failed = true;
          reject(err);
        };
        w.on('message', onMsg);
        w.on('error', onErr);
        w.postMessage(payload);
      });
    });
  }

  /** Sync-friendly: chunk on main if no workers; else block via Atomics-free sync map using worker results only async — for sync Best use parallelFn sync split. */
  function scoreBatchParallel(rows) {
    var n = rows.length;
    if (n < 256) return scoreChunkSync(rows);
    // Sync path: split and score chunks on this thread (true workers need async).
    // Overlap-friendly chunking still improves locality vs one giant loop.
    var chunks = 4;
    var size = Math.ceil(n / chunks);
    var out = new Float64Array(n);
    for (var c = 0; c < chunks; c++) {
      var a = c * size;
      var b = Math.min(n, a + size);
      if (a >= b) break;
      var part = rows.slice(a, b);
      var scored = scoreChunkSync(part);
      out.set(scored, a);
    }
    return out;
  }

  async function scoreBatchParallelAsync(rows) {
    var n = rows.length;
    if (n < 256 || !tryInitPool()) return scoreChunkSync(rows);
    var chunks = pool.size || 4;
    var size = Math.ceil(n / chunks);
    var payloads = [];
    for (var c = 0; c < chunks; c++) {
      var a = c * size;
      var b = Math.min(n, a + size);
      if (a >= b) break;
      payloads.push({ type: 'score', rows: rows.slice(a, b), offset: a });
    }
    var parts = await mapWorkers(payloads);
    var out = new Float64Array(n);
    for (var i = 0; i < parts.length; i++) {
      var msg = parts[i];
      var scores = msg && msg.scores ? msg.scores : parts[i];
      out.set(scores, payloads[i].offset);
    }
    return out;
  }

  /**
   * Frame parallel runner: evaluate independent task fns.
   * Uses worker_threads when tasks are serializable score jobs; else sync.
   */
  function makeParallelRunner() {
    return function (tasks) {
      var out = new Array(tasks.length);
      for (var i = 0; i < tasks.length; i++) out[i] = tasks[i]();
      return out;
    };
  }

  /**
   * True worker fan-out for disjoint monoid apply:
   * each task is { stocks: Float64Array, V: { delta, certMin, counts } }
   * Worker returns applied stocks copy — main merges by taking deltas.
   * For sync FastBest we apply V locally but in isolated stock clones then merge
   * (race-free for disjoint masks).
   */
  function applyDisjointParallel(stockLen, jobs) {
    // jobs: [{ delta: Float64Array, certMin: Float64Array, counts }]
    // Compute on cloned stocks in parallel chunks (sync isolate)
    var results = new Array(jobs.length);
    for (var i = 0; i < jobs.length; i++) {
      var st = new Float64Array(stockLen);
      var d = jobs[i].delta;
      for (var r = 0; r < stockLen; r++) st[r] = d[r];
      results[i] = { delta: st, counts: jobs[i].counts };
    }
    return results;
  }

  var api = {
    scoreBatchParallel: scoreBatchParallel,
    scoreBatchParallelAsync: scoreBatchParallelAsync,
    makeParallelRunner: makeParallelRunner,
    applyDisjointParallel: applyDisjointParallel,
    tryInitPool: tryInitPool,
    get ready() { return pool.ready; },
    get backend() { return pool.backend; },
    get size() { return pool.size; }
  };
  global.JFExp6Workers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);


/* Direct locals after helper IIFEs (avoid repeated globalThis lookups). */
var JFExp6Frame = (typeof globalThis !== 'undefined' && globalThis.JFExp6Frame) || null;
var JFExp6SIMD = (typeof globalThis !== 'undefined' && globalThis.JFExp6SIMD) || null;
var JFExp6GPU = (typeof globalThis !== 'undefined' && globalThis.JFExp6GPU) || null;
var JFExp6Workers = (typeof globalThis !== 'undefined' && globalThis.JFExp6Workers) || null;

function clone(obj) {
  if (null == obj || "object" != typeof obj) return obj;
  var copy = Object.create(obj.constructor.prototype);
  for (var attr in obj) {
    if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
  }
  return copy;
}

function getRelations(arr, relSet = new Set()) {
  for (let item of arr) {
    if (item.jX && typeof item.jX.updateInject === 'function') {
      if (item.jX.sequence) relSet.add(item.jX.sequence);
    }
    if (item.jY && typeof item.jY.updateInject === 'function') {
      if (item.jY.sequence) relSet.add(item.jY.sequence);
    }
    if (item.jreq && typeof item.jreq.updateInject === 'function') {
      if (item.jreq.sequence) relSet.add(item.jreq.sequence);
    }
    if (item.jgroup && Array.isArray(item.jgroup)) {
      getRelations(item.jgroup, relSet);
    }
  }
  return relSet;
}

function isRelationJoy(joy) {
  return !!(joy && typeof joy.updateInject === 'function');
}

function actionTouchesRelation(action) {
  return isRelationJoy(action?.jX) || isRelationJoy(action?.jY);
}

/** Active inject-rollback watches (nested commits share the outermost frame). */
var __joyWatchStack = [];

function noteJoyMutation(joy) {
  if (!joy || __joyWatchStack.length === 0) return;
  let watch = __joyWatchStack[__joyWatchStack.length - 1];
  if (watch.snaps.has(joy)) return;
  watch.snaps.set(joy, snapshotJoy(joy));
}

function restoreJoyWatch(watch) {
  if (!watch) return;
  watch.snaps.forEach(snap => restoreJoy(snap));
}

/**
 * Apply a leaf delta to a Joy or JRelation.
 * Relations go through updateInject so sequence stays in sync with jmax.
 */
function applyJoyDelta(joy, delta, buyer) {
  if (!joy) return;
  noteJoyMutation(joy);
  let before = joy.jmax;
  if (isRelationJoy(joy)) {
    joy.updateInject(joy.jmax - delta, null, null, buyer || null);
  } else {
    joy.jmax = joy.jmax - delta;
  }
  emitResourceChange(joy, before, joy.jmax);
}

/** Blueprint-owned resource change bus (live commits only; sim clones stay silent). */
function emitResourceChange(joy, before, after) {
  if (!joy || !joy.__bpOwner || !joy.__bpName) return;
  if (joy.__bpSilent) return;
  if (before === after) return;
  joy.__bpOwner._dispatchResourceEvent(joy.__bpName, before, after);
}

/**
 * Capacity-only twin for SimulatedBest. Relation sequences are NOT shared with
 * live inventory — scoring stays numeric and cannot inject into the real world.
 */
function cloneJoyForSim(joy) {
  if (!joy) return null;
  if (isRelationJoy(joy)) {
    return { jmax: joy.jmax, polarity: joy.polarity };
  }
  return clone(joy);
}

function markRealized(item) {
  if (!item) return;
  item.__realized = true;
}

function isRealized(item) {
  return !!(item && item.__realized);
}

/** Plain capacity snapshot for Validate probes — never mutate live Joys/Relations. */
function joyProbe(joy) {
  if (!joy) return null;
  return { jmax: joy.jmax, polarity: joy.polarity };
}

/** Fork a SimulatedBest joyMap so scoring nested atomics cannot mutate the parent. */
function forkJoyMap(joyMap) {
  if (!joyMap) return null;
  let fork = new Map();
  joyMap.forEach((v, k) => fork.set(k, clone(v)));
  return fork;
}

/** Snapshot relation + plain joy state for rollback. */
function snapshotJoy(joy) {
  if (!joy) return null;
  return {
    joy,
    jmax: joy.jmax,
    _jmax: joy._jmax,
    seq: joy.sequence ? joy.sequence.jgroup.slice() : null
  };
}

function restoreJoy(snap) {
  if (!snap) return;
  if (snap._jmax !== undefined) snap.joy._jmax = snap._jmax;
  snap.joy.jmax = snap.jmax;
  if (snap.seq && snap.joy.sequence) {
    snap.joy.sequence.jgroup.length = 0;
    snap.seq.forEach(item => snap.joy.sequence.jgroup.push(item));
  }
}

/**
 * Live atomic commit: re-score for order, then apply leaves in SimulatedBest
 * order to live Joys (via __joyKey* when present so sim clones are not targeted).
 */
function commitAtomicLive(group) {
  if (!group) return false;
  group.jatomicFail = false;
  let ordered = group.SimulatedBest();
  if (group.jatomic && group.jatomicFail) return false;
  applyOrderedToLive(ordered);
  return true;
}

function applyOrderedToLive(ordered) {
  if (!ordered) return;
  for (let i = 0; i < ordered.length; i++) {
    let step = ordered[i];
    if (!step) continue;
    if (step.SimulatedBest != null && step.jatomic) {
      commitAtomicLive(step);
    } else {
      let joyX = step.__joyKeyX !== undefined ? step.__joyKeyX : step.jX;
      let joyY = step.__joyKeyY !== undefined ? step.__joyKeyY : step.jY;
      applyJoyDelta(joyX, step.x, step);
      applyJoyDelta(joyY, step.y, step);
    }
  }
}

/**
 * Apply a SimulatedBest option onto a parent joyMap in sim order.
 * Nested atomics re-sim against a fork only for ordering, then deltas merge
 * onto the parent map via live joy keys.
 */
function applyOrderedToJoyMap(ordered, joyMap) {
  if (!ordered) return;
  for (let i = 0; i < ordered.length; i++) {
    let step = ordered[i];
    if (!step) continue;
    if (step.SimulatedBest != null && step.jatomic) {
      step.jatomicFail = false;
      let nested = step.SimulatedBest(forkJoyMap(joyMap));
      if (step.jatomic && step.jatomicFail) continue;
      applyOrderedToJoyMap(nested, joyMap);
    } else {
      let keyX = step.__joyKeyX !== undefined ? step.__joyKeyX : step.jX;
      let keyY = step.__joyKeyY !== undefined ? step.__joyKeyY : step.jY;
      if (keyX) {
        if (!joyMap.has(keyX)) joyMap.set(keyX, cloneJoyForSim(keyX));
        joyMap.get(keyX).jmax = joyMap.get(keyX).jmax - step.x;
      }
      if (keyY) {
        if (!joyMap.has(keyY)) joyMap.set(keyY, cloneJoyForSim(keyY));
        joyMap.get(keyY).jmax = joyMap.get(keyY).jmax - step.y;
      }
    }
  }
}

/**
 * Drain `work` into `option`. Relation-touching leaves go through
 * commitLeafWithRelationGate (nested inject allowed). Returns false if stuck.
 */
function drainWorkToOption(work, option, parentGroup, prepareFunc, depth) {
  if (depth > 32) return false;
  let guard = 0;
  let unrealizable = new WeakSet();
  while (work.length > 0 && guard++ < 10000) {
    let bestIdx = -1;
    let bestJ = -Number.MAX_VALUE;
    let unpacked = false;
    for (let i = 0; i < work.length; i++) {
      let candidate = work[i];
      if (isRealized(candidate) || unrealizable.has(candidate)) continue;
      if (candidate.SimulatedBest != null && !candidate.jatomic) {
        let kids = [];
        let stack = candidate.jgroup.filter(c => !isRealized(c)).slice().reverse();
        while (stack.length > 0) {
          let item = stack.pop();
          if (item.jatomic && item.SimulatedBest != null) kids.push(item);
          else if (item.jgroup && item.jgroup.length > 0) {
            item.jgroup.slice().reverse().forEach(c => stack.push(c));
          } else kids.push(item);
        }
        work.splice(i, 1, ...kids);
        unpacked = true;
        break;
      }
      let temp = clone(candidate);
      // Probe on capacity snapshots only — never Validate against live Joy/Relation refs
      temp.jX = joyProbe(candidate.jX);
      temp.jY = joyProbe(candidate.jY);
      let jAwait = temp.Validate(option);
      if (jAwait == null) continue;
      let jV = jAwait.jmethod(jAwait.x, jAwait.y, jAwait.jX, jAwait.jY, parentGroup);
      if (jV > bestJ) {
        bestJ = jV;
        bestIdx = i;
      }
    }
    if (unpacked) continue;
    if (bestIdx < 0) return false;
    let executed = work.splice(bestIdx, 1)[0];
    if (executed.SimulatedBest != null && executed.jatomic) {
      if (!commitAtomicLive(executed)) {
        unrealizable.add(executed);
        work.push(executed);
        let anyOther = work.some(w => w !== executed && !unrealizable.has(w) && !isRealized(w));
        if (!anyOther) return false;
        continue;
      }
      markRealized(executed);
      option.push(executed);
    } else if (executed.SimulatedBest != null) {
      executed.jgroup.filter(c => !isRealized(c)).forEach(c => work.push(c));
    } else if (actionTouchesRelation(executed)) {
      let optionBefore = option.length;
      let ok = commitLeafWithRelationGate(executed, work, option, parentGroup, prepareFunc, depth + 1);
      if (!ok) {
        unrealizable.add(executed);
        work.push(executed);
        // If nothing else can progress, fail the drain
        let anyOther = work.some(w => w !== executed && !unrealizable.has(w) && !isRealized(w));
        if (!anyOther) {
          option.length = optionBefore;
          return false;
        }
      }
    } else {
      if (executed.jX && !isRelationJoy(executed.jX)) executed.jX.jmax -= executed.x;
      if (executed.jY && !isRelationJoy(executed.jY)) executed.jY.jmax -= executed.y;
      markRealized(executed);
      option.push(executed);
    }
  }
  return work.length === 0;
}

/**
 * Apply buyer resource deltas. Relation sides inject with jreq→buyer.
 * Then drain all newly injected units. On any shortfall: rollback every
 * Joy/Relation mutated in this watch frame + false.
 */
function commitLeafWithRelationGate(executedAction, find, option, parentGroup, prepareFunc, depth) {
  depth = depth || 0;
  if (!actionTouchesRelation(executedAction)) {
    let joyX = executedAction.jX;
    let joyY = executedAction.jY;
    if (joyX) {
      let bx = joyX.jmax;
      joyX.jmax = joyX.jmax - executedAction.x;
      emitResourceChange(joyX, bx, joyX.jmax);
    }
    if (joyY) {
      let by = joyY.jmax;
      joyY.jmax = joyY.jmax - executedAction.y;
      emitResourceChange(joyY, by, joyY.jmax);
    }
    markRealized(executedAction);
    option.push(executedAction);
    return true;
  }

  let createdWatch = false;
  if (__joyWatchStack.length === 0) {
    __joyWatchStack.push({ snaps: new Map() });
    createdWatch = true;
  }
  let watch = __joyWatchStack[__joyWatchStack.length - 1];
  let findBefore = find.length;
  let optionBefore = option.length;
  let prep = prepareFunc || (x => x);

  try {
    let joyX = executedAction.jX;
    let joyY = executedAction.jY;
    noteJoyMutation(joyX);
    noteJoyMutation(joyY);
    if (joyX) {
      let bx = joyX.jmax;
      if (isRelationJoy(joyX)) {
        joyX.updateInject(joyX.jmax - executedAction.x, find, prep, executedAction);
      } else {
        joyX.jmax = joyX.jmax - executedAction.x;
      }
      emitResourceChange(joyX, bx, joyX.jmax);
    }
    if (joyY) {
      let by = joyY.jmax;
      if (isRelationJoy(joyY)) {
        joyY.updateInject(joyY.jmax - executedAction.y, find, prep, executedAction);
      } else {
        joyY.jmax = joyY.jmax - executedAction.y;
      }
      emitResourceChange(joyY, by, joyY.jmax);
    }

    let injected = find.splice(findBefore, find.length - findBefore);
    markRealized(executedAction);
    option.push(executedAction);

    if (injected.length === 0) {
      return true;
    }

    let ok = drainWorkToOption(injected, option, parentGroup, prep, (depth || 0) + 1);
    if (!ok) {
      for (let i = optionBefore; i < option.length; i++) {
        if (option[i]) option[i].__realized = false;
      }
      option.length = optionBefore;
      if (createdWatch) restoreJoyWatch(watch);
      executedAction.__realized = false;
      return false;
    }
    return true;
  } finally {
    if (createdWatch) __joyWatchStack.pop();
  }
}

class Joy {
  constructor(jmax, polarity) {
    if (polarity != -Number.MIN_VALUE && polarity != Number.MIN_VALUE) {
      throw new Error("Joy.polarity must be -Number.MIN_VALUE or Number.MIN_VALUE");
    }
    this.jmax = jmax
    this.polarity = polarity
  }
}

function JVerify(x, xmax) {
  if (((xmax >= Number.MIN_VALUE && (xmax - x) <= -Number.MIN_VALUE) || (xmax <= -Number.MIN_VALUE && (xmax - x) >= Number.MIN_VALUE))) {
    return 'verified bad, state switch'
  }
  else if (Math.abs(x) > Math.abs(xmax)) {
    return 'verified bad, new maximum'
  }
  return true
}

/**
 * Exp5: walk a jgroup tree into a plain structure for inspect / promote.
 * kind: 'action' | 'group' | 'blueprint'
 */
function structureOf(node) {
  if (!node) return null
  if (node instanceof JBlueprint) {
    return {
      kind: 'blueprint',
      name: node.name || null,
      node: node,
      children: (node.jgroup || []).map(structureOf)
    }
  }
  if (node instanceof JGroup) {
    return {
      kind: 'group',
      name: node.name || null,
      node: node,
      children: (node.jgroup || []).map(structureOf)
    }
  }
  if (node instanceof JAction) {
    return {
      kind: 'action',
      name: node.name || null,
      node: node,
      children: []
    }
  }
  return {
    kind: 'unknown',
    name: node.name || null,
    node: node,
    children: (node.jgroup || []).map(structureOf)
  }
}

/** Collect Joy/Relation leaves under a group for asBlueprint resource registry. */
function collectLeafResources(group, into, seen) {
  into = into || new Map()
  seen = seen || new Set()
  let stack = (group && group.jgroup) ? group.jgroup.slice() : []
  while (stack.length) {
    let n = stack.pop()
    if (!n || seen.has(n)) continue
    seen.add(n)
    if (n instanceof JGroup) {
      if (n.jgroup && n.jgroup.length) {
        for (let i = 0; i < n.jgroup.length; i++) stack.push(n.jgroup[i])
      }
      continue
    }
    if (n instanceof JAction) {
      ;[n.jX, n.jY].forEach(function (joy) {
        if (!joy || into.has(joy)) return
        let name = joy.__bpName || joy.name
        if (!name) {
          name = 'R' + into.size
          joy.name = name
        }
        into.set(joy, name)
      })
    }
  }
  return into
}

/** Nested built blueprints directly in this jgroup (not deeper templates). */
function nestedBuiltBlueprints(group) {
  let out = []
  let arr = (group && group.jgroup) || []
  for (let i = 0; i < arr.length; i++) {
    let n = arr[i]
    if (n instanceof JBlueprint && n._built && n.root && n !== group) out.push(n)
  }
  return out
}

class JAction {
  constructor(jmethod, req, x, y, jX, jY) {
    this.hash
    this.jmethod = jmethod
    this.jreq = req
    this.x = x
    this.y = y
    this.jX = jX
    this.jY = jY
  }
  /** Exp5: wrap this action as a JGroup (one rung up). */
  asGroup(opts) {
    opts = opts || {}
    let g = new JGroup()
    g.name = opts.name != null ? opts.name : (this.name || 'ActionGroup')
    if (opts.atomic != null) g.jatomic = !!opts.atomic
    g.Consider(this)
    return g
  }
  /** Exp5: one rung — JAction → JGroup. */
  upgrade(opts) {
    return this.asGroup(opts)
  }
  Validate(joption) {
    let ready = this.jreq == null
    if (!ready) {
      for (let i = 0; i < joption.length; i++) {
        let jaction = joption[i]
        if (
          jaction == this.jreq ||
          (this.jreq?.hash == jaction?.hash && jaction?.hash != undefined && this.jreq?.jgroup != undefined)
        ) {
          ready = true
          break
        }
      }
    }
    if (ready) {
      let verified = false
      switch (JVerify(this.x, this.jX.jmax)) {
        case 'verified bad, state switch':
          verified = 3
          break
        case 'verified bad, new maximum':
          verified = 2
          break
        default:
          verified = true
          break;
      }
      switch (JVerify(this.y, this.jY.jmax)) {
        case 'verified bad, state switch':
          verified = false
          break
        case 'verified bad, new maximum':
          if (verified == 2) {
            if (this.jX.polarity > 0 && this.x < 0 || this.jX.polarity < 0 && this.x > 0) {
              this.jX.jmax = this.x
            } else {
              verified = false
            }
          }
          if (verified == 3) {
            verified = false
          }
          else {
            if (this.jY.polarity > 0 && this.y < 0 || this.jY.polarity < 0 && this.y > 0) {
              this.jY.jmax = this.y
              if (verified !== false) verified = true
            } else {
              verified = false
            }
          }
          break
        default:
          if (verified == 2) {
            if (this.jX.polarity > 0 && this.x < 0 || this.jX.polarity < 0 && this.x > 0) {
              this.jX.jmax = this.x
            } else {
              verified = 4
            }
          }
          if (verified == 4) {
            verified = false
          } else if (verified !== false) {
            verified = (verified == 3) ? false : true
          }
          break
      }
      if (verified) {
        return this
      }
    }
    return null
  }
}

class JGroup {
  constructor() {
    this.hash = crypto.randomUUID()
    this.jgroup = []
    this.jatomic = false
    this.jatomicFail = false
    this.j = 0
    this.x
    this.y
    this.jX
    this.jY
    this.jreq
    this.jhash = new Map()
    this.jmethod = function (x, y, jX, jY, jgroup) {
      this.jatomicFail = false
      // Score against a fork of the parent joyMap. Nested SimulatedBest must see
      // parent gate tokens, but must not mutate the parent's map — commit applies
      // in SimulatedBest order once.
      let parentMap = jgroup && jgroup.__simJoyMap
      this.SimulatedBest(forkJoyMap(parentMap) || undefined)
      if (this.jatomicFail && this.jatomic) {
        return -Number.MAX_VALUE
      }
      return this.j
    }
  }
  /** Exp5: inspect layered jgroup tree (actions / groups / blueprints). */
  structure() {
    return structureOf(this)
  }
  /**
   * Exp5: promote this JGroup to a built JBlueprint sharing jgroup identity.
   * Wires a root JRelation so .run() / .runAsync() Best() this group.
   */
  asBlueprint(opts) {
    opts = opts || {}
    if (this instanceof JBlueprint && this._built) return this
    let bp = new JBlueprint()
    bp.name = opts.name != null ? opts.name : (this.name || 'Group')
    let joys = collectLeafResources(this)
    joys.forEach(function (name, joy) {
      if (!bp.resources.has(name)) {
        bp.resources.set(name, joy)
        joy.__bpOwner = bp
        joy.__bpName = name
      }
    })
    // Empty relation shell; sequence IS this group so run() → Best(this).
    let rootRel = new JRelation(new JGroup(), 0, Number.MIN_VALUE)
    rootRel.sequence = this
    rootRel._jmax = 0
    bp.root = rootRel
    bp._built = true
    bp.blueprint = bp
    bp.jgroup = this.jgroup
    bp.jhash = this.jhash
    bp.jatomic = this.jatomic
    bp.jreq = this.jreq
    if (this.jmethod) bp.jmethod = this.jmethod
    if (this.name) bp.name = opts.name != null ? opts.name : this.name
    return bp
  }
  /** Exp5: one rung — JGroup → JBlueprint (built). */
  upgrade(opts) {
    return this.asBlueprint(opts)
  }
  Consider(jaction) {
    if (jaction?.jhash) {
      if (this.jhash.has(jaction.hash)) {
        this.jhash.set(jaction.hash, [jaction, this.jhash.get(jaction.hash)[1] + 1])
      } else {
        this.jhash.set(jaction.hash, [jaction, 1])
      }
    } else {
      jaction.hash = this.hash
    }
    if (jaction.jreq == null) {
      jaction.jreq = this.jreq
    }
    this.jgroup.push(jaction)
  }
  JPreview() {
    this.jgroup.forEach(jaction => {
      jaction.jmethod(jaction.x, jaction.y, jaction.jX, jaction.jY, this)
    })
  }
  Best() {
    let j = 0
    let option = []
    let find = this.jgroup.slice()
    let unrealizable = new WeakSet()
    // Do NOT auto-push joy-target relation sequences into find.
    // That re-unpacks live sequence items already realized via inject (double Relax).
    // Explicitly Consider'd sequences remain in find from jgroup.
    let change = 0
    let changed = 1
    while (find.length > 0 && change != changed) {
      changed = 0
      // Drop dead candidates so we do not re-clone them every pass
      find = find.filter(item => !unrealizable.has(item) && !isRealized(item))
      if (find.length === 0) break
      // Prefer unpacked loose leaves over other non-atomic groups (prevents
      // jreq-unlocked sibling years from unpacking mid-drain). Top-level
      // actions are not marked __unpackedLeaf, so they never trigger this.
      let leafMode = find.some(item => item.__unpackedLeaf && item.SimulatedBest == null)
      let simulatedJGroup = find.slice()
      for (let i = 0; i < simulatedJGroup.length; i++) {
        let jactionClone = clone(simulatedJGroup[i])
        // Capacity snapshots only — Validate must not mutate live Relations/Joys
        jactionClone.jX = joyProbe(jactionClone.jX)
        jactionClone.jY = joyProbe(jactionClone.jY)
        simulatedJGroup[i] = jactionClone
      }
      let jIndex = -1
      let highestJFind = -Number.MAX_VALUE
      let findIndex = 0
      simulatedJGroup.flatMap(
        jaction => {
          let live = find[findIndex]
          if (leafMode && live.SimulatedBest != null && !live.jatomic) {
            findIndex++
            return
          }
          let jAwait = jaction.Validate(option)
          switch (jAwait) {
            case null:
              break
            default:
              let jV = jAwait.jmethod(jAwait.x, jAwait.y, jAwait.jX, jAwait.jY, this)
              if (jV > highestJFind) {
                highestJFind = jV
                jIndex = findIndex
              }
              break
          }
          findIndex++
        }
      )
      if (jIndex > -1) {
        let executedAction = find.splice(jIndex, 1)[0]
        if (executedAction.SimulatedBest != null && executedAction.jatomic) {
          if (!commitAtomicLive(executedAction)) {
            unrealizable.add(executedAction)
            changed = 1
          } else {
            j += highestJFind
            markRealized(executedAction)
            option.push(executedAction)
            changed = 1
          }
        }
        else if (executedAction.SimulatedBest != null) {
          j += highestJFind
          let stack = executedAction.jgroup.slice().reverse()
          while (stack.length > 0) {
            let item = stack.pop()
            // Atomic children are opaque units — do not flatten through them
            if (item.jatomic && item.SimulatedBest != null) {
              if (!isRealized(item)) find.push(item)
            } else if (item.jgroup && item.jgroup.length > 0) {
              let children = item.jgroup.slice().reverse()
              children.forEach(child => stack.push(child))
            } else if (!isRealized(item)) {
              item.__unpackedLeaf = true
              find.push(item)
            }
          }
          changed = 1
        }
        else {
          let ok = commitLeafWithRelationGate(executedAction, find, option, this, x => x, 0)
          if (ok) {
            j += highestJFind
            changed = 1
          } else {
            // Reject buyer; do not re-queue (filter drops unrealizable next pass)
            unrealizable.add(executedAction)
            changed = 1
          }
        }
      }
    }
    j = option.length > 0 ? j / option.length : 0
    this.j = j
    this.preRegroupOption = option.slice() //see test_regroup_order.js
    let totalHashes = 0
    let hashes = new Map()
    // TODO: make this a property and calc total hashes on consider too
    this.jhash.forEach((hashing, hashI) => {
      if (!hashing[0].jatomic) { hashes.set(hashI, hashing[1]); totalHashes += hashing[1] }
    })
    let nonAtomicCount = 0
    for (let i = 0; i < option.length; i++) {
      if (!option[i].jatomic) nonAtomicCount++
    }
    let interval = totalHashes > 0 ? nonAtomicCount / totalHashes : 0
    let oii = interval
    let oSub = []
    let offset = 0
    let intervalHash = 0
    let iHashCounts = new Map()
    let maxHash = 0
    // Process left-to-right, dynamically splitting buckets around atomic groups
    while (offset < option.length) {
      if (option[offset].jatomic) {
        // Force-close the open bucket before stepping over the atomic group
        if (oSub.length > 0) {
          if (intervalHash != 0) {
            let classification = clone(this.jhash.get(intervalHash)[0])
            classification.jgroup = [...oSub]
            classification.jhash = new Map(this.jhash.get(intervalHash)[0].jhash)
            option.splice(offset, 0, classification)
          } else {
            option.splice(offset, 0, ...oSub)
            offset = offset + oSub.length - 1
          }
          intervalHash = 0
          iHashCounts = new Map()
          maxHash = 0
          oSub = []
          offset++
          oii = interval
        }
        // Step over the atomic group
        offset++
        continue
      }

      let currentItem = option[offset]
      if (hashes.get(currentItem.hash) != undefined) {
        if (hashes.get(currentItem.hash) - 1 >= 0) {
          totalHashes--
          hashes.set(currentItem.hash, hashes.get(currentItem.hash) - 1)
          if (iHashCounts.has(currentItem.hash)) {
            let hashTotal = iHashCounts.get(currentItem.hash) + 1
            iHashCounts.set(currentItem.hash, hashTotal)
            if (hashTotal > maxHash) {
              intervalHash = currentItem.hash
              maxHash = hashTotal
            }
          } else {
            iHashCounts.set(currentItem.hash, 1)
            if (1 > maxHash) {
              intervalHash = currentItem.hash
              maxHash = 1
            }
          }
        }
      }

      oSub.push(currentItem)
      option.splice(offset, 1)

      // Close bucket if interval reached, OR if end of array
      if (--oii <= 0 || offset >= option.length) {
        if (intervalHash != 0) {
          let classification = clone(this.jhash.get(intervalHash)[0])
          classification.jgroup = [...oSub]
          classification.jhash = new Map(this.jhash.get(intervalHash)[0].jhash)
          option.splice(offset, 0, classification)
        } else {
          option.splice(offset, 0, ...oSub)
          offset = offset + oSub.length - 1
        }
        intervalHash = 0
        iHashCounts = new Map()
        maxHash = 0
        oSub = []
        offset++
    // TODO split off the atomic groups before interval calc
    // TODO Then using the interval, reading options left to right keep track of how many options per interval for each option hash type
    // TODO Then group the jactions up to that interval in-place, and give it a jgroup with the hash subtracting from the local hash total
        oii = interval
      }
    }
    // TODO Change jhash values from a plain count to { total: count, group: JGroup }
    // TODO (follow-on)
    return option
  }
  SimulatedBest(inheritedJoyMap) {
    if (this.isEvaluating) return [];
    this.isEvaluating = true;
    const prevSimMap = this.__simJoyMap
    try {
    let j = 0
    let option = []
    // Nested atomics must share the parent's simulated Joy clones; otherwise
    // child SimulatedBest re-clones from live state and misses parent gates.
    let joyMap = inheritedJoyMap || new Map()
    this.__simJoyMap = joyMap
    let actionMap = new Map()
    const prepare = (originalAction) => {
      let actionClone = clone(originalAction)
      actionClone.evaluatingChain = this.evaluatingChain ? new Set(this.evaluatingChain) : new Set()
      actionClone.evaluatingChain.add(this.hash)
      actionClone.__joyKeyX = originalAction.jX
      actionClone.__joyKeyY = originalAction.jY
      actionMap.set(originalAction, actionClone)
      if (originalAction.jX) {
        if (!joyMap.has(originalAction.jX)) joyMap.set(originalAction.jX, cloneJoyForSim(originalAction.jX))
        actionClone.jX = joyMap.get(originalAction.jX)
      }
      if (originalAction.jY) {
        if (!joyMap.has(originalAction.jY)) joyMap.set(originalAction.jY, cloneJoyForSim(originalAction.jY))
        actionClone.jY = joyMap.get(originalAction.jY)
      }
      return actionClone
    }
    let originalFind = this.jgroup.slice()
    // Do not auto-push joy-target relation sequences (same rationale as Best)
    let find = originalFind.map(prepare)
    find.forEach(actionClone => {
      if (actionClone.jreq && actionMap.has(actionClone.jreq)) {
        actionClone.jreq = actionMap.get(actionClone.jreq)
      }
    })
    let unrealizable = new WeakSet()
    let change = 0
    let changed = 1
    while (find.length > 0 && change != changed) {
      changed = 0
      find = find.filter(item => !unrealizable.has(item) && !isRealized(item))
      if (find.length === 0) break
      let leafMode = find.some(item => item.__unpackedLeaf && item.SimulatedBest == null)
      let simulatedJGroup = find.slice()
      let jIndex = -1
      let highestJFind = -Number.MAX_VALUE
      let findIndex = 0
      simulatedJGroup.flatMap(
        jaction => {
          let live = find[findIndex]
          if (leafMode && live.SimulatedBest != null && !live.jatomic) {
            findIndex++
            return
          }
          let tempAction = clone(jaction)
          tempAction.jX = joyProbe(jaction.jX)
          tempAction.jY = joyProbe(jaction.jY)
          let jAwait = tempAction.Validate(option)
          switch (jAwait) {
            case null:
              break
            default:
              let jV = jAwait.jmethod(jAwait.x, jAwait.y, jAwait.jX, jAwait.jY, this)
              if (jV > highestJFind) {
                highestJFind = jV
                jIndex = findIndex
              }
              break
          }
          findIndex++
        }
      )
      if (jIndex > -1) {
        let executedAction = find.splice(jIndex, 1)[0]
        if (executedAction.SimulatedBest != null && executedAction.jatomic) {
          j += highestJFind
          executedAction.jatomicFail = false
          let nestedOrdered = executedAction.SimulatedBest(forkJoyMap(joyMap))
          if (!(executedAction.jatomic && executedAction.jatomicFail)) {
            applyOrderedToJoyMap(nestedOrdered, joyMap)
          }
          markRealized(executedAction)
          option.push(executedAction)
          changed = 1
        }
        else if (executedAction.SimulatedBest != null) {
          j += highestJFind
          let stack = executedAction.jgroup.slice().reverse()
          while (stack.length > 0) {
            let item = stack.pop()
            if (item.jatomic && item.SimulatedBest != null) {
              if (!isRealized(item)) find.push(prepare(item))
            } else if (item.jgroup && item.jgroup.length > 0) {
              let children = item.jgroup.slice().reverse()
              children.forEach(child => stack.push(child))
            } else if (!isRealized(item)) {
              let prepared = prepare(item)
              prepared.__unpackedLeaf = true
              find.push(prepared)
            }
          }
          changed = 1
        }
        else {
          // SimulatedBest must not run updateInject (clones share live sequence refs).
          // Apply numeric capacity deltas on joyMap clones only; skip inject/drain.
          let joyX = executedAction.jX
          let joyY = executedAction.jY
          if (joyX) {
            if (isRelationJoy(joyX)) {
              let next = joyX.jmax - executedAction.x
              if (typeof joyX._jmax !== 'undefined') joyX._jmax = next
              else joyX.jmax = next
            } else {
              joyX.jmax = joyX.jmax - executedAction.x
            }
          }
          if (joyY) {
            if (isRelationJoy(joyY)) {
              let next = joyY.jmax - executedAction.y
              if (typeof joyY._jmax !== 'undefined') joyY._jmax = next
              else joyY.jmax = next
            } else {
              joyY.jmax = joyY.jmax - executedAction.y
            }
          }
          markRealized(executedAction)
          option.push(executedAction)
          j += highestJFind
          changed = 1
        }
      }
    }

    this.j = option.length > 0 ? j / option.length : 0
    if (this.jatomic && find.length > 0) {
      this.jatomicFail = true
    }
    return option
    } finally {
      this.__simJoyMap = prevSimMap
      this.isEvaluating = false;
    }
  }
  Validate(joption) {
    if (this.jreq == null) return this
    for (let i = 0; i < joption.length; i++) {
      let jaction = joption[i]
      if (
        jaction == this.jreq ||
        (this.jreq?.hash == jaction?.hash && jaction?.hash != undefined && this.jreq?.jgroup != undefined)
      ) {
        return this
      }
    }
    return null
  }
}

function JDirect(x, y, xmax, ymax, jgroup) {
  let xMaxVal = xmax.jmax
  let yMaxVal = ymax.jmax
  let p = xMaxVal == 0 ? 0 : Math.abs(yMaxVal / xMaxVal)
  let xVal = (Math.abs(x) * p) * 0.5
  let yVal = Math.abs(y) * 0.5
  let xNorm = yMaxVal == 0 ? 0 : xVal / Math.abs(yMaxVal)
  let yNorm = yMaxVal == 0 ? 0 : yVal / Math.abs(yMaxVal)
  let xConsuming = (x > 0 && xMaxVal > 0) || (x < 0 && xMaxVal < 0)
  let yConsuming = (y > 0 && yMaxVal > 0) || (y < 0 && yMaxVal < 0)
  if (xConsuming === yConsuming) {
    let score = xNorm + yNorm
    if (!xConsuming) {
      score += 1.0
    }
    return score
  } else {
    return -(xNorm + yNorm)
  }
}

function JIndirect(x, y, xmax, ymax, jgroup) {
  let xMaxVal = xmax.jmax
  let yMaxVal = ymax.jmax
  let p = xMaxVal == 0 ? 0 : Math.abs(yMaxVal / xMaxVal)
  let xVal = (Math.abs(x) * p) * 0.5
  let yVal = Math.abs(y) * 0.5
  let xNorm = yMaxVal == 0 ? 0 : xVal / Math.abs(yMaxVal)
  let yNorm = yMaxVal == 0 ? 0 : yVal / Math.abs(yMaxVal)
  let xConsuming = (x > 0 && xMaxVal > 0) || (x < 0 && xMaxVal < 0)
  let yConsuming = (y > 0 && yMaxVal > 0) || (y < 0 && yMaxVal < 0)
  if (xConsuming !== yConsuming) {
    return (xNorm + yNorm)
  } else {
    let score = -(xNorm + yNorm)
    if (!xConsuming && !yConsuming) {
      score += 1.0
    }
    return score
  }
}

function JNeutral(x, y, xmax, ymax, jgroup) {
  let xMaxVal = xmax.jmax
  let yMaxVal = ymax.jmax
  let p = xMaxVal == 0 ? 0 : Math.abs(yMaxVal / xMaxVal)
  let xVal = (Math.abs(x) * p) * 0.5
  let yVal = Math.abs(y) * 0.5
  let xNorm = yMaxVal == 0 ? 0 : xVal / Math.abs(yMaxVal)
  let yNorm = yMaxVal == 0 ? 0 : yVal / Math.abs(yMaxVal)
  let xConsuming = (x > 0 && xMaxVal > 0) || (x < 0 && xMaxVal < 0)
  let yConsuming = (y > 0 && yMaxVal > 0) || (y < 0 && yMaxVal < 0)
  let score = xNorm + yNorm
  if (!xConsuming && !yConsuming) {
    score += 1.0
  }
  return score
}

class JRelation {
  constructor(blueprint, count, polarity, options) {
    if (polarity != -Number.MIN_VALUE && polarity != Number.MIN_VALUE) {
      throw new Error("JRelation.polarity must be -Number.MIN_VALUE or Number.MIN_VALUE");
    }
    this.blueprint = blueprint
    this.sequence = new JGroup()
    this.polarity = polarity
    this.chain = !!(options && options.chain)
    this._jmax = count
    let i = 0
    while (i < count) {
      // TODO: Update adding logic for proximity
      this.sequence.Consider(this.instance())
      i++
    }
  }
  instance() {
    const cloneMap = new Map()
    const cloneContainer = (obj) => {
      if (obj instanceof JAction) {
        const newAction = new JAction(obj.jmethod, obj.jreq, obj.x, obj.y, obj.jX, obj.jY)
        newAction.name = obj.name
        newAction.jatomic = obj.jatomic
        // Fresh identity — do not copy blueprint hash (shared UUID unlocked all
        // later jreq siblings at once → interleaved mega-Best hang).
        cloneMap.set(obj, newAction)
        return newAction
      } else if (obj instanceof JGroup) {
        const newGroup = new JGroup()
        newGroup.name = obj.name
        newGroup.jatomic = obj.jatomic
        cloneMap.set(obj, newGroup)
        return newGroup
      }
      return clone(obj)
    }
    let newInstance = cloneContainer(this.blueprint)
    if (this.blueprint instanceof JGroup) {
      let stack = [{ source: this.blueprint, target: newInstance }]
      while (stack.length > 0) {
        let current = stack.pop()
        let source = current.source
        let target = current.target
        if (source.jgroup && source.jgroup.length > 0) {
          source.jgroup.forEach(item => {
            let itemClone = cloneContainer(item)
            target.Consider(itemClone)
            if (item instanceof JGroup) {
              stack.push({ source: item, target: itemClone })
            }
          })
        }
      }
    }
    // Remap intra-blueprint jreq pointers to the cloned instances (not blueprint identities)
    let remapStack = [newInstance]
    while (remapStack.length > 0) {
      let node = remapStack.pop()
      if (node.jreq && cloneMap.has(node.jreq)) {
        node.jreq = cloneMap.get(node.jreq)
      }
      if (node.jgroup && node.jgroup.length > 0) {
        node.jgroup.forEach(child => remapStack.push(child))
      }
    }
    if (this.chain && this.sequence.jgroup.length > 0) {
      newInstance.jreq = this.sequence.jgroup[this.sequence.jgroup.length - 1]
    } else {
      newInstance.jreq = null
    }
    return newInstance;
  }
  update(jmax) {
    let interval = 0
    let direction = 1
    if (jmax != null) {
      if ((jmax < this._jmax && this.polarity == Number.MIN_VALUE) || (jmax > this._jmax && this.polarity == -Number.MIN_VALUE)) {
        direction = -1
      }
      interval = Math.abs(this._jmax - jmax)
      this._jmax = jmax
    }
    // TODO: Update adding and subtracting logic for proximity
    for (let i = 0; i < interval; i++) {
      if (direction == 1) {
        let newInstance = this.instance()
        if (this.chain && this.sequence.jgroup.length > 0) {
          newInstance.jreq = this.sequence.jgroup[this.sequence.jgroup.length - 1]
        }
        this.sequence.Consider(newInstance)
      }
      else {
        if (this.sequence.jgroup.length > 0) {
          this.sequence.jgroup.splice(0, 1)
        }
      }
    }
    // TODO: Make Proximity Compatablie
    this.sequence.Best()
  }
  /**
   * Async update for parallel planners (Promise.all on shared resources).
   * Yields once before Best so another updateAsync can be scheduled; Best
   * itself remains synchronous (full interleaving needs BestAsync later).
   */
  async updateAsync(jmax) {
    let interval = 0
    let direction = 1
    if (jmax != null) {
      if ((jmax < this._jmax && this.polarity == Number.MIN_VALUE) || (jmax > this._jmax && this.polarity == -Number.MIN_VALUE)) {
        direction = -1
      }
      interval = Math.abs(this._jmax - jmax)
      this._jmax = jmax
    }
    for (let i = 0; i < interval; i++) {
      await Promise.resolve()
      if (direction == 1) {
        let newInstance = this.instance()
        if (this.chain && this.sequence.jgroup.length > 0) {
          newInstance.jreq = this.sequence.jgroup[this.sequence.jgroup.length - 1]
        }
        this.sequence.Consider(newInstance)
      } else if (this.sequence.jgroup.length > 0) {
        this.sequence.jgroup.splice(0, 1)
      }
    }
    await Promise.resolve()
    this.sequence.Best()
    return this
  }
  updateInject(jmax, findQueue, prepareFunc, buyerForJreq) {
    noteJoyMutation(this)
    let interval = 0
    let direction = 1
    if (jmax != null) {
      if ((jmax < this._jmax && this.polarity == Number.MIN_VALUE) || (jmax > this._jmax && this.polarity == -Number.MIN_VALUE)) {
        direction = -1
      }
      interval = Math.abs(this._jmax - jmax)
      // Never shrink past existing sequence units; never store negative jmax for +polarity
      if (direction == -1) {
        interval = Math.min(interval, this.sequence.jgroup.length)
        this._jmax = this.polarity == Number.MIN_VALUE
          ? Math.max(0, this._jmax - interval)
          : this._jmax + interval
      } else {
        this._jmax = jmax
      }
    }
    for (let i = 0; i < interval; i++) {
      if (direction == 1) {
        let newInstance = this.instance()
        // chain: later units link to previous; else all units tie to buyer when provided
        if (this.chain && this.sequence.jgroup.length > 0) {
          newInstance.jreq = this.sequence.jgroup[this.sequence.jgroup.length - 1]
        } else if (buyerForJreq) {
          newInstance.jreq = buyerForJreq
        } else {
          newInstance.jreq = null
        }
        // Children Consider'd during instance() saw null parent jreq — propagate buyer/chain now
        if (newInstance.jreq && newInstance.jgroup) {
          newInstance.jgroup.forEach(child => {
            if (child.jreq == null) child.jreq = newInstance.jreq
          })
        }
        this.sequence.Consider(newInstance)
        
        // DYNAMIC INJECTION
        if (findQueue && prepareFunc) {
          findQueue.push(prepareFunc(newInstance))
        }
      }
      else {
        if (this.sequence.jgroup.length > 0) {
          let removed = this.sequence.jgroup.splice(0, 1)[0]
          
          // DYNAMIC REMOVAL from findQueue
          if (findQueue) {
            let foundIndex = findQueue.findIndex(item => item.hash === removed.hash)
            if (foundIndex !== -1) {
              findQueue.splice(foundIndex, 1)
            }
          }
        }
      }
    }
  }
  // TODO: Make a array like get and set for the specific items.
  valueof() {
    return this._jmax
  }
  get jmax() {
    // Passive read — never call update() here (legacy getter ouroboros).
    return this._jmax
  }
  set jmax(value) {
    // Public resize API: grow/shrink sequence (+ Best). Inject paths use updateInject.
    this.update(value)
  }
}

class Quota {
  constructor(jmax, polarity) {
    this.jmax = 0
    this.polarity = Number.MIN_VALUE
  }
  Regulate(amount, jgroup) {
    jgroup.Consider(
      new JAction(
        (x, y, xmax, ymax, jgroup) => { return 7199254740891 },
        null,
        amount, 0, this, this
      )
    )
  }
  Count(jgroup) {
    jgroup.Consider(
      new JAction(
        (x, y, xmax, ymax, jgroup) => { return 7199254740891 },
        null,
        -1, 0, this, this
      )
    )
  }
  Limit(amount) {
    this.jmax = amount
  }
  Deduct(jgroup) {
    jgroup.Consider(
      new JAction(
        (x, y, xmax, ymax, jgroup) => { return 7199254740891 },
        null,
        1, 0, this, this
      )
    )
  }
}

/**
 * ——— Exp6 PlanIR + FastBest v2 ———
 * Lossless data compression (SoA/COW/counts), op compression (repeat blocks /
 * after-fuse / certificates), incremental Best, HW batch score hooks.
 * METHOD ids: 0 direct, 1 indirect, 2 neutral (+ optional unit scale).
 */
var JF_MIN = Number.MIN_VALUE;
var JF_METHOD_DIRECT = 0;
var JF_METHOD_INDIRECT = 1;
var JF_METHOD_NEUTRAL = 2;
var JF_CAND_ACTION = 1;
var JF_CAND_CHAIN = 2;
var JF_CAND_INCLUDE = 3;

function jfScoreNumeric(methodId, x, y, xMax, yMax, scale) {
  var p = xMax == 0 ? 0 : Math.abs(yMax / xMax);
  var xVal = (Math.abs(x) * p) * 0.5;
  var yVal = Math.abs(y) * 0.5;
  var xNorm = yMax == 0 ? 0 : xVal / Math.abs(yMax);
  var yNorm = yMax == 0 ? 0 : yVal / Math.abs(yMax);
  var xConsuming = (x > 0 && xMax > 0) || (x < 0 && xMax < 0);
  var yConsuming = (y > 0 && yMax > 0) || (y < 0 && yMax < 0);
  var score;
  if (methodId === JF_METHOD_DIRECT) {
    if (xConsuming === yConsuming) {
      score = xNorm + yNorm;
      if (!xConsuming) score += 1.0;
    } else score = -(xNorm + yNorm);
  } else if (methodId === JF_METHOD_NEUTRAL) {
    score = xNorm + yNorm;
    if (!xConsuming && !yConsuming) score += 1.0;
  } else {
    if (xConsuming !== yConsuming) score = xNorm + yNorm;
    else {
      score = -(xNorm + yNorm);
      if (!xConsuming && !yConsuming) score += 1.0;
    }
  }
  if (scale != null && scale > 0) {
    var t = Math.abs(score) / scale;
    return t / (1 + t);
  }
  return score;
}

function jfBatchScore(rows) {
  var n = rows.length;
  // Prefer WASM SIMD kernel early; GPU sync uses warm cache when available.
  if (JFExp6SIMD && n >= 8) {
    try {
      var s = JFExp6SIMD.scoreSync(rows);
      if (s && s.length === n) {
        if (JFExp6GPU && n >= 64 && typeof JFExp6GPU.warmScoreAsync === 'function') {
          try { JFExp6GPU.warmScoreAsync(rows); } catch (_w) {}
        }
        return s;
      }
    } catch (_e) { /* fall through */ }
  }
  if (JFExp6Workers && n >= 256 && typeof JFExp6Workers.scoreBatchParallel === 'function') {
    try {
      var sw = JFExp6Workers.scoreBatchParallel(rows);
      if (sw && sw.length === n) return sw;
    } catch (_ew) { /* fall through */ }
  }
  if (JFExp6GPU && typeof JFExp6GPU.scoreSync === 'function' && n >= 64) {
    try {
      var s2 = JFExp6GPU.scoreSync(rows);
      if (s2 && s2.length === n) return s2;
    } catch (_e2) { /* fall through */ }
  }
  var out = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    var r = rows[i];
    if (r.skip) out[i] = -Number.MAX_VALUE;
    else out[i] = jfScoreNumeric(r.methodId, r.x, r.y, r.xMax, r.yMax, r.scale);
  }
  return out;
}

/**
 * Argmax over a JGroup without SimulatedBest cloning — for small combat brains.
 * skipFn(action) => true to ignore (e.g. Pix_/Sec_ samples).
 */
function jfArgmaxJGroup(group, skipFn) {
  var best = null;
  var bestScore = -Infinity;
  var list = (group && group.jgroup) || [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (!a || typeof a.jmethod !== 'function') continue;
    if (skipFn && skipFn(a)) continue;
    a.__realized = false;
    var s = a.jmethod(a.x, a.y, a.jX, a.jY, group);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return { action: best, score: bestScore, n: list.length };
}

/** Field Best-all-pixels via WASM kernel when available. */
function jfFieldBest(opts) {
  if (JFExp6SIMD && typeof JFExp6SIMD.fieldBest === 'function') {
    return JFExp6SIMD.fieldBest(opts);
  }
  return null;
}

function jfVerifySide(delta, stock, polarity) {
  if (((stock >= JF_MIN && (stock - delta) <= -JF_MIN) || (stock <= -JF_MIN && (stock - delta) >= JF_MIN))) {
    return 0;
  }
  if (Math.abs(delta) > Math.abs(stock)) {
    if ((polarity > 0 && delta < 0) || (polarity < 0 && delta > 0)) return 2;
    return 0;
  }
  return 1;
}

function jfCanApplySides(fromIdx, toIdx, x, y, stocks, polarities) {
  return jfVerifySide(x, stocks[fromIdx], polarities[fromIdx]) !== 0 &&
    jfVerifySide(y, stocks[toIdx], polarities[toIdx]) !== 0;
}

/** Sequence recorder: counts + optional full names / id stream (lossless multiset). */
function jfMakeRecorder(ir, mode) {
  mode = mode || 'counts';
  var counts = Object.create(null);
  var names = mode === 'full' ? [] : null;
  var ids = mode === 'full' ? [] : null;
  var nameById = ir.actionNames;
  return {
    mode: mode,
    counts: counts,
    record: function (actionId) {
      var nm = nameById[actionId];
      counts[nm] = (counts[nm] || 0) + 1;
      if (names) {
        names.push(nm);
        ids.push(actionId);
      }
    },
    recordName: function (nm) {
      counts[nm] = (counts[nm] || 0) + 1;
      if (names) names.push(nm);
    },
    fastCount: function (nm) { return counts[nm] || 0; },
    get names() { return names || []; },
    get ids() { return ids || []; }
  };
}

/**
 * Build preRegroupOption from FastBest counts.
 * Small plans expand to repeated {name} stubs (Best-compatible sequence length).
 * Large plans stay compact ({name, __count}) so UI Score stays cheap.
 */
var JF_COUNTS_EXPAND_MAX = 8192;
function jfCountsToOption(counts) {
  var keys = Object.keys(counts || {});
  var total = 0;
  for (var i = 0; i < keys.length; i++) total += counts[keys[i]] || 0;
  if (total > 0 && total <= JF_COUNTS_EXPAND_MAX) {
    var expanded = [];
    for (var k = 0; k < keys.length; k++) {
      var nm = keys[k];
      var c = counts[nm] || 0;
      for (var n = 0; n < c; n++) expanded.push({ name: nm });
    }
    return expanded;
  }
  return keys.map(function (nm) {
    return { name: nm, __count: counts[nm] };
  });
}

/** COW stock vector: clone only when shared. */
function jfCowBorrow(buf) {
  return { data: buf, shared: true };
}
function jfCowUnique(cow) {
  if (!cow.shared) return cow.data;
  var copy = new Float64Array(cow.data);
  cow.data = copy;
  cow.shared = false;
  return copy;
}
function jfCowSnapshot(cow) {
  cow.shared = true;
  return { data: cow.data, shared: true };
}

function jfCompilePlanIR(author, rootName) {
  var resNames = [];
  var resIndex = new Map();
  var starts = [];
  var polarities = [];
  author.resources.forEach(function (joy, name) {
    resIndex.set(name, resNames.length);
    resNames.push(name);
    starts.push(joy.jmax != null ? joy.jmax : 0);
    polarities.push(joy.polarity != null ? joy.polarity : JF_MIN);
  });

  var methodMeta = author._methodMeta || new Map();
  function resolveMethod(specMethod) {
    var m = specMethod || 'indirect';
    if (m === 'direct') return { id: JF_METHOD_DIRECT, scale: 0 };
    if (m === 'neutral') return { id: JF_METHOD_NEUTRAL, scale: 0 };
    if (m === 'indirect') return { id: JF_METHOD_INDIRECT, scale: 0 };
    var meta = methodMeta.get(m);
    if (meta) return { id: meta.id, scale: meta.scale || 0 };
    // Custom method() scorers are not on the numeric FastBest path
    return null;
  }

  var actionNames = [];
  var globalActionId = 0;
  var layers = [];
  var layerIndex = new Map();
  author._layers.forEach(function (L, name) {
    layerIndex.set(name, layers.length);
    layers.push({
      name: name,
      atomic: !!L.atomic,
      repeat: Math.max(1, L.repeatCount | 0),
      chain: !!L.chain,
      steps: [],
      actions: [],
      fastPath: true,
      linear: false,
      // SoA
      fromIdx: null,
      toIdx: null,
      x: null,
      y: null,
      methodId: null,
      scale: null,
      afterIdx: null,
      // op compression
      candidates: null,
      certMin: null,
      touchMask: null,
      readIdxs: null
    });
  });

  author._layers.forEach(function (L, name) {
    var li = layerIndex.get(name);
    var layer = layers[li];
    var namedAction = new Map();
    var actions = [];
    for (var i = 0; i < L.steps.length; i++) {
      var step = L.steps[i];
      if (step.kind === 'include') {
        var childLi = layerIndex.get(step.layer);
        if (childLi == null) { layer.fastPath = false; continue; }
        layer.steps.push({ kind: 'include', layer: childLi });
        continue;
      }
      var spec = step.spec || {};
      if (!resIndex.has(spec.from) || !resIndex.has(spec.to)) {
        layer.fastPath = false;
        continue;
      }
      var meth = resolveMethod(spec.method);
      if (!meth) {
        // Keep compiling the jgroup tree, but leave PlanIR FastBest
        layer.fastPath = false;
        meth = { id: JF_METHOD_INDIRECT, scale: 0 };
      }
      var afterLocal = -1;
      if (spec.after) {
        if (!namedAction.has(spec.after)) layer.fastPath = false;
        else afterLocal = namedAction.get(spec.after);
      }
      var aid = globalActionId++;
      actionNames[aid] = step.name;
      var act = {
        kind: 'action',
        name: step.name,
        actionId: aid,
        fromIdx: resIndex.get(spec.from),
        toIdx: resIndex.get(spec.to),
        x: spec.x != null ? spec.x : 0,
        y: spec.y != null ? spec.y : 0,
        methodId: meth.id,
        scale: meth.scale,
        afterIdx: afterLocal,
        localIdx: actions.length
      };
      namedAction.set(step.name, actions.length);
      actions.push(act);
      layer.steps.push(act);
    }
    layer.actions = actions;
    var nA = actions.length;
    layer.fromIdx = new Int16Array(nA);
    layer.toIdx = new Int16Array(nA);
    layer.x = new Float64Array(nA);
    layer.y = new Float64Array(nA);
    layer.methodId = new Int8Array(nA);
    layer.scale = new Float64Array(nA);
    layer.afterIdx = new Int16Array(nA);
    for (var a = 0; a < nA; a++) {
      layer.fromIdx[a] = actions[a].fromIdx;
      layer.toIdx[a] = actions[a].toIdx;
      layer.x[a] = actions[a].x;
      layer.y[a] = actions[a].y;
      layer.methodId[a] = actions[a].methodId;
      layer.scale[a] = actions[a].scale || 0;
      layer.afterIdx[a] = actions[a].afterIdx;
    }
  });

  // Op compression + certificates (second pass; children known)
  for (var li2 = 0; li2 < layers.length; li2++) {
    jfCompressLayer(layers, li2, resNames.length);
  }

  var ir = {
    resNames: resNames,
    starts: new Float64Array(starts),
    polarities: new Float64Array(polarities),
    layers: layers,
    rootIdx: layerIndex.get(rootName),
    actionNames: actionNames,
    version: 8,
    frame: null
  };
  // zstd-like Frame/SLP monoid compile
  var frameApi = JFExp6Frame;
  if (frameApi && typeof frameApi.jfCompileFrame === 'function') {
    try {
      ir.frame = frameApi.jfCompileFrame(ir);
      // Attach Frame node refs onto include candidates (branched FastBest)
      for (var li3 = 0; li3 < layers.length; li3++) {
        var L3 = layers[li3];
        if (!L3.candidates) continue;
        for (var ci3 = 0; ci3 < L3.candidates.length; ci3++) {
          var cand3 = L3.candidates[ci3];
          if (cand3.kind !== JF_CAND_INCLUDE) continue;
          var fr3 = ir.frame.layerFrames[cand3.layer];
          cand3.frameNode = fr3 ? fr3.rootNode : -1;
          cand3.frameSummarized = !!(fr3 && fr3.fullySummarized);
        }
      }
    } catch (_fe) {
      ir.frame = null;
    }
  }
  return ir;
}

function jfBlockIsAfterChain(block) {
  if (!block.length) return true;
  if (block[0].afterIdx !== -1) return false;
  for (var i = 1; i < block.length; i++) {
    if (block[i].afterIdx !== block[i - 1].localIdx) return false;
  }
  return true;
}

/**
 * True when authoring-order prefix needs an external stock the free include
 * also touches — so Best may run the include before those prefix consumes
 * (e.g. Week taxes-before-Day need energy that Day produces). Such spines
 * are not uniquely ordered; demote from linear / Frame summarization.
 */
function jfPrefixIncludeConflict(layers, layer, prefix, includeLayerIdx, nRes) {
  var child = layers[includeLayerIdx];
  if (!child || !prefix.length || !child.touchMask) return false;
  var sim = new Float64Array(nRes);
  var cert = new Float64Array(nRes);
  for (var i = 0; i < prefix.length; i++) {
    var loc = prefix[i].localIdx;
    var f = layer.fromIdx[loc];
    var t = layer.toIdx[loc];
    var xv = layer.x[loc];
    var yv = layer.y[loc];
    if (xv > 0 && sim[f] < xv) {
      cert[f] = Math.max(cert[f], xv - sim[f]);
      sim[f] = xv;
    }
    if (yv > 0 && sim[t] < yv) {
      cert[t] = Math.max(cert[t], yv - sim[t]);
      sim[t] = yv;
    }
    sim[f] -= xv;
    sim[t] -= yv;
  }
  for (var r = 0; r < nRes; r++) {
    if (cert[r] > 0 && child.touchMask[r]) return true;
  }
  return false;
}

function jfCompressLayer(layers, li, nRes) {
  var layer = layers[li];
  if (!layer.fastPath) return;
  var actions = layer.actions;
  var nA = actions.length;

  // After-fork? (two+ actions share the same after parent)
  var childCount = new Int16Array(nA);
  var hasAfterFork = false;
  for (var af = 0; af < nA; af++) {
    var p = layer.afterIdx[af];
    if (p >= 0) {
      childCount[p]++;
      if (childCount[p] > 1) hasAfterFork = true;
    }
  }

  // Spine-linear: authoring order is the unique Best program when
  //   - no after-forks, and
  //   - steps are prefix-chain / optional single include / suffix-chain
  //   - prefix does not demand stocks the free include can supply earlier
  // (calendar Day/Hour). Pure after-total-order also counts.
  // Branched competing roots (no include) stay on FastBest search.
  var includeCount = 0;
  var includeStepLayer = -1;
  var prefix = [];
  var suffix = [];
  for (var s = 0; s < layer.steps.length; s++) {
    var st = layer.steps[s];
    if (st.kind === 'include') {
      includeCount++;
      includeStepLayer = st.layer;
      if (includeCount > 1) break;
      continue;
    }
    if (includeCount === 0) prefix.push(st);
    else suffix.push(st);
  }
  var spineLinear = layer.fastPath && !hasAfterFork && includeCount <= 1 &&
    jfBlockIsAfterChain(prefix) && jfBlockIsAfterChain(suffix) &&
    (includeCount === 1 || (prefix.length === nA && jfBlockIsAfterChain(prefix)));
  if (spineLinear && includeCount === 1 &&
      jfPrefixIncludeConflict(layers, layer, prefix, includeStepLayer, nRes)) {
    spineLinear = false;
  }
  // also: classic total after-order with zero includes
  var chainLinear = layer.fastPath && includeCount === 0 && nA > 0 && jfBlockIsAfterChain(actions);
  layer.linear = !!(spineLinear || chainLinear);
  layer.hasAfterFork = hasAfterFork;

  // Candidates: when a free include can interleave with after-chains, keep
  // actions solo so FastBest can run include between Kick and taxes, etc.
  // Linear spines still fuse (unused by search — jfRunLinear walks steps).
  var fused = new Uint8Array(nA);
  var candidates = [];
  var stepCursor = 0;
  var soloForInclude = !layer.linear && includeCount > 0;
  while (stepCursor < layer.steps.length) {
    var step = layer.steps[stepCursor];
    if (step.kind === 'include') {
      var child = layers[step.layer];
      candidates.push({
        kind: JF_CAND_INCLUDE,
        layer: step.layer,
        repeat: child ? child.repeat : 1,
        scoreHint: 0.5
      });
      stepCursor++;
      continue;
    }
    if (soloForInclude) {
      if (!fused[step.localIdx]) {
        candidates.push({ kind: JF_CAND_ACTION, localIdx: step.localIdx });
        fused[step.localIdx] = 1;
      }
      stepCursor++;
      continue;
    }
    // start chain at this action if not fused
    if (fused[step.localIdx]) { stepCursor++; continue; }
    var chain = [step.localIdx];
    fused[step.localIdx] = 1;
    var look = stepCursor + 1;
    while (look < layer.steps.length) {
      var nxt = layer.steps[look];
      if (nxt.kind === 'include') break;
      if (nxt.afterIdx === chain[chain.length - 1] && !fused[nxt.localIdx]) {
        // only fuse if nothing else could compete (single after parent)
        var rivals = 0;
        for (var r = 0; r < nA; r++) {
          if (layer.afterIdx[r] === chain[chain.length - 1]) rivals++;
        }
        if (rivals !== 1) break;
        chain.push(nxt.localIdx);
        fused[nxt.localIdx] = 1;
        look++;
        continue;
      }
      break;
    }
    if (chain.length === 1) {
      candidates.push({ kind: JF_CAND_ACTION, localIdx: chain[0] });
    } else {
      candidates.push({ kind: JF_CAND_CHAIN, locals: chain });
    }
    stepCursor = look;
  }
  // Any unfused actions (branched) as solo candidates
  for (var u = 0; u < nA; u++) {
    if (!fused[u]) candidates.push({ kind: JF_CAND_ACTION, localIdx: u });
  }
  layer.candidates = candidates;

  // Spine residue: prefix may reorder around a free include, but authoring
  // suffix still means "after the body". Gate suffix until include + all
  // prefix actions are realized (Kick→Day→taxes→Wrap, not taxes after Wrap).
  layer.spinePrefixMask = null;
  layer.spineSuffixMask = null;
  layer.spineIncludeLayer = -1;
  if (!layer.linear && includeCount === 1 && suffix.length &&
      jfBlockIsAfterChain(prefix) && jfBlockIsAfterChain(suffix)) {
    var prefMask = new Uint8Array(nA);
    var sufMask = new Uint8Array(nA);
    for (var pi = 0; pi < prefix.length; pi++) prefMask[prefix[pi].localIdx] = 1;
    for (var si = 0; si < suffix.length; si++) sufMask[suffix[si].localIdx] = 1;
    layer.spinePrefixMask = prefMask;
    layer.spineSuffixMask = sufMask;
    layer.spineIncludeLayer = includeStepLayer;
  }

  // Touch mask + feasibility cert (for linear layers: exact peak deficit)
  var touch = new Uint8Array(nRes);
  for (var i = 0; i < nA; i++) {
    touch[layer.fromIdx[i]] = 1;
    touch[layer.toIdx[i]] = 1;
  }
  for (var c = 0; c < candidates.length; c++) {
    if (candidates[c].kind !== JF_CAND_INCLUDE) continue;
    var ch0 = layers[candidates[c].layer];
    if (!ch0 || !ch0.touchMask) continue;
    for (var k0 = 0; k0 < nRes; k0++) if (ch0.touchMask[k0]) touch[k0] = 1;
  }
  layer.touchMask = touch;
  var readIdxs = [];
  for (var ri = 0; ri < nRes; ri++) if (touch[ri]) readIdxs.push(ri);
  layer.readIdxs = new Int16Array(readIdxs);

  // Linear layers: walk once from 0 and record peak deficit (exact min starts).
  // Non-linear: conservative sum of positive consumes (pass ⇒ likely ok; miss ⇒ simulate).
  var certMin = new Float64Array(nRes);
  var certExact = false;
  if (layer.linear) {
    certExact = true;
    var sim = new Float64Array(nRes);
    for (var s2 = 0; s2 < layer.steps.length; s2++) {
      var st2 = layer.steps[s2];
      if (st2.kind === 'include') {
        var chL = layers[st2.layer];
        if (!chL || !chL.certMin) { certExact = false; break; }
        var reps = chL.repeat || 1;
        for (var rr = 0; rr < reps; rr++) {
          for (var k1 = 0; k1 < nRes; k1++) {
            if (chL.certMin[k1] > 0 && sim[k1] < chL.certMin[k1]) {
              certMin[k1] = Math.max(certMin[k1], chL.certMin[k1] - sim[k1]);
              sim[k1] = chL.certMin[k1];
            }
            // child net effect unknown unless child linear+exact — apply cert as consume
            if (chL.certMin[k1] > 0) sim[k1] -= chL.certMin[k1];
          }
        }
      } else {
        var f = layer.fromIdx[st2.localIdx];
        var t = layer.toIdx[st2.localIdx];
        var xv = layer.x[st2.localIdx];
        var yv = layer.y[st2.localIdx];
        if (xv > 0 && sim[f] < xv) {
          certMin[f] = Math.max(certMin[f], xv - sim[f]);
          sim[f] = xv;
        }
        if (yv > 0 && sim[t] < yv) {
          certMin[t] = Math.max(certMin[t], yv - sim[t]);
          sim[t] = yv;
        }
        sim[f] -= xv;
        sim[t] -= yv;
      }
    }
  }
  if (!certExact) {
    for (var i2 = 0; i2 < nA; i2++) {
      if (layer.x[i2] > 0) certMin[layer.fromIdx[i2]] += layer.x[i2];
      if (layer.y[i2] > 0) certMin[layer.toIdx[i2]] += layer.y[i2];
    }
    for (var c2 = 0; c2 < candidates.length; c2++) {
      if (candidates[c2].kind !== JF_CAND_INCLUDE) continue;
      var ch2 = layers[candidates[c2].layer];
      if (!ch2 || !ch2.certMin) continue;
      for (var k2 = 0; k2 < nRes; k2++) {
        if (ch2.certMin[k2] > 0) certMin[k2] += ch2.certMin[k2] * candidates[c2].repeat;
      }
    }
  }
  layer.certMin = certMin;
  layer.certExact = certExact;
}

/**
 * Certificate pass ⇒ eligible without dry-run when certExact (linear peak deficit).
 * Conservative cert pass is optimistic; miss always falls back to simulate.
 */
function jfCertOk(layer, stocks) {
  var cert = layer.certMin;
  if (!cert) return false;
  for (var i = 0; i < cert.length; i++) {
    if (cert[i] > 0 && stocks[i] + 1e-12 < cert[i]) return false;
  }
  return !!layer.certExact;
}

function jfFingerprint(layer, stocks) {
  var idxs = layer.readIdxs;
  var h = layer.name ? layer.name.length : 0;
  for (var i = 0; i < idxs.length; i++) {
    var v = stocks[idxs[i]];
    h = (h * 31 + (v * 1000) | 0) | 0;
  }
  return h;
}

function jfApplyLocal(layer, localIdx, stocks) {
  stocks[layer.fromIdx[localIdx]] -= layer.x[localIdx];
  stocks[layer.toIdx[localIdx]] -= layer.y[localIdx];
}

function jfCanApplyLocal(layer, localIdx, stocks, polarities) {
  return jfCanApplySides(
    layer.fromIdx[localIdx], layer.toIdx[localIdx],
    layer.x[localIdx], layer.y[localIdx],
    stocks, polarities
  );
}

function jfRecordLocal(layer, localIdx, rec) {
  rec.record(layer.actions[localIdx].actionId);
}

/** Apply summarized child layer (includes its repeat) via Frame monoid. */
function jfTryIncludeMonoid(ir, childLayerIdx, stocks, rec) {
  // Full name order needs interpretive expand — skip monoid (counts mode only)
  if (!ir.frame || (rec && rec.mode === 'full')) return false;
  var api = JFExp6Frame;
  if (!api || typeof api.jfTryApplyIncludeMonoid !== 'function') return false;
  return api.jfTryApplyIncludeMonoid(ir, ir.frame, childLayerIdx, stocks, rec, false);
}

/** Straight-line program (fully compressed Best). */
function jfRunLinear(ir, layerIdx, stocks, rec, depth) {
  var layer = ir.layers[layerIdx];
  // Whole layer summarized → one monoid apply (counts mode; full mode keeps order)
  if (layer.frameSummarized && layer.frameVInstance && ir.frame && !(rec && rec.mode === 'full')) {
    var apiL = JFExp6Frame;
    if (apiL) return apiL.jfApplyV(stocks, layer.frameVInstance, rec, ir, false);
  }
  var apiPar = JFExp6Frame;
  for (var s = 0; s < layer.steps.length; s++) {
    var st = layer.steps[s];
    if (st.kind === 'include') {
      // Batch consecutive summarized disjoint includes for parallel monoid apply
      if (apiPar && ir.frame && !(rec && rec.mode === 'full')) {
        var batch = [st.layer];
        var look = s + 1;
        while (look < layer.steps.length && layer.steps[look].kind === 'include') {
          var nextLi = layer.steps[look].layer;
          var frA = ir.frame.layerFrames[batch[batch.length - 1]];
          var frB = ir.frame.layerFrames[nextLi];
          if (!frA || !frB || !frA.fullySummarized || !frB.fullySummarized) break;
          if (apiPar.jfMasksOverlap(frA.touchMask, frB.touchMask)) break;
          batch.push(nextLi);
          look++;
        }
        if (batch.length > 1) {
          var runner = apiPar.jfMakeParallelRunner && apiPar.jfMakeParallelRunner();
          if (apiPar.jfApplyDisjointMonoid(ir, ir.frame, batch, stocks, rec, false, runner || undefined)) {
            s = look - 1;
            continue;
          }
        }
      }
      if (jfTryIncludeMonoid(ir, st.layer, stocks, rec)) continue;
      var child = ir.layers[st.layer];
      var reps = child.repeat || 1;
      for (var r = 0; r < reps; r++) {
        if (!jfRunLayerOnce(ir, st.layer, stocks, rec, depth + 1)) return false;
      }
    } else {
      if (!jfCanApplyLocal(layer, st.localIdx, stocks, ir.polarities)) return false;
      jfApplyLocal(layer, st.localIdx, stocks);
      jfRecordLocal(layer, st.localIdx, rec);
    }
  }
  return true;
}

function jfApplyChain(layer, locals, stocks, polarities, rec) {
  for (var i = 0; i < locals.length; i++) {
    if (!jfCanApplyLocal(layer, locals[i], stocks, polarities)) return false;
    jfApplyLocal(layer, locals[i], stocks);
    if (rec) jfRecordLocal(layer, locals[i], rec);
  }
  return true;
}

function jfScoreCandidate(cand, layer, stocks, polarities) {
  if (cand.kind === JF_CAND_INCLUDE) return cand.scoreHint;
  if (cand.kind === JF_CAND_ACTION) {
    var i = cand.localIdx;
    return jfScoreNumeric(
      layer.methodId[i], layer.x[i], layer.y[i],
      stocks[layer.fromIdx[i]], stocks[layer.toIdx[i]],
      layer.scale[i] || null
    );
  }
  // chain: score first action (same as Best seeing the head first)
  var h = cand.locals[0];
  return jfScoreNumeric(
    layer.methodId[h], layer.x[h], layer.y[h],
    stocks[layer.fromIdx[h]], stocks[layer.toIdx[h]],
    layer.scale[h] || null
  );
}

/**
 * Emit full-mode names for a summarized spine prefix without touching counts
 * (counts/stocks already applied via Frame monoid).
 */
function jfEmitSpineNames(ir, layer, prefixLen, rec) {
  if (!rec || !rec.names || prefixLen <= 0) return;
  var stepN = 0;
  for (var sp = 0; sp < layer.steps.length && stepN < prefixLen; sp++) {
    stepN++;
    var stp = layer.steps[sp];
    if (stp.kind === 'include') {
      jfEmitLayerNames(ir, stp.layer, rec);
    } else {
      var nm = ir.actionNames[layer.actions[stp.localIdx].actionId];
      rec.names.push(nm);
      if (rec.ids) rec.ids.push(layer.actions[stp.localIdx].actionId);
    }
  }
}

function jfEmitLayerNames(ir, layerIdx, rec) {
  var layer = ir.layers[layerIdx];
  if (!layer) return;
  var reps = layer.repeat || 1;
  for (var r = 0; r < reps; r++) {
    for (var s = 0; s < layer.steps.length; s++) {
      var st = layer.steps[s];
      if (st.kind === 'include') jfEmitLayerNames(ir, st.layer, rec);
      else {
        var nm = ir.actionNames[layer.actions[st.localIdx].actionId];
        rec.names.push(nm);
        if (rec.ids) rec.ids.push(layer.actions[st.localIdx].actionId);
      }
    }
  }
}

/**
 * Compressed FastBest — all graphs. Uses certificates instead of dry-run;
 * incremental rescoring via dirty resource bitset.
 */
function jfFastBestLayerInstance(ir, layerIdx, stocks, rec, depth, memo) {
  if (depth > 64) return false;
  var layer = ir.layers[layerIdx];
  if (!layer || layer.fastPath === false) return false;
  if (layer.linear) return jfRunLinear(ir, layerIdx, stocks, rec, depth);

  // Flat action-only branch: specialized O(picks × dirty) path (no includes/chains)
  var cands0 = layer.candidates;
  var onlyActions = true;
  for (var ca = 0; ca < cands0.length; ca++) {
    if (cands0[ca].kind !== JF_CAND_ACTION) { onlyActions = false; break; }
  }
  if (onlyActions) return jfFastBestActionsOnly(ir, layerIdx, stocks, rec);

  memo = memo || new Map();
  var candidates = layer.candidates;
  var nC = candidates.length;
  var done = new Uint8Array(nC);
  var remaining = nC;
  var realizedActions = new Uint8Array(layer.actions.length);

  // Frame prefix monoid: apply summarized spine before after-fork; mark those done.
  // Stocks+counts always; full-mode names emitted via step walk (not bulk expand).
  if (layer.framePrefixV && ir.frame) {
    var apiP = JFExp6Frame;
    if (apiP) {
      if (!apiP.jfApplyV(stocks, layer.framePrefixV, rec, ir, false)) return false;
      if (rec && rec.mode === 'full') {
        jfEmitSpineNames(ir, layer, layer.framePrefixLen, rec);
      }
      var stepN = 0;
      for (var sp = 0; sp < layer.steps.length && stepN < layer.framePrefixLen; sp++) {
        var stp = layer.steps[sp];
        stepN++;
        if (stp.kind === 'include') {
          for (var ic = 0; ic < nC; ic++) {
            if (!done[ic] && candidates[ic].kind === JF_CAND_INCLUDE &&
                candidates[ic].layer === stp.layer) {
              done[ic] = 1;
              remaining--;
              break;
            }
          }
        } else {
          realizedActions[stp.localIdx] = 1;
        }
      }
      for (var ac = 0; ac < nC; ac++) {
        if (done[ac]) continue;
        var cd = candidates[ac];
        if (cd.kind === JF_CAND_ACTION && realizedActions[cd.localIdx]) {
          done[ac] = 1; remaining--;
        } else if (cd.kind === JF_CAND_CHAIN && cd.locals) {
          var allR = true;
          for (var cl = 0; cl < cd.locals.length; cl++) {
            if (!realizedActions[cd.locals[cl]]) { allR = false; break; }
          }
          if (allR) { done[ac] = 1; remaining--; }
        }
      }
    }
  }
  var scores = new Float64Array(nC);
  var scoreValid = new Uint8Array(nC);
  var dirty = new Uint8Array(ir.polarities.length);
  var allDirty = true;
  var guard = 0;
  var scratch = null;

  function markDirtyFromCand(cand) {
    if (cand.kind === JF_CAND_ACTION) {
      dirty[layer.fromIdx[cand.localIdx]] = 1;
      dirty[layer.toIdx[cand.localIdx]] = 1;
    } else if (cand.kind === JF_CAND_CHAIN) {
      for (var i = 0; i < cand.locals.length; i++) {
        dirty[layer.fromIdx[cand.locals[i]]] = 1;
        dirty[layer.toIdx[cand.locals[i]]] = 1;
      }
    } else {
      var ch = ir.layers[cand.layer];
      if (ch && ch.touchMask) {
        for (var k = 0; k < dirty.length; k++) if (ch.touchMask[k]) dirty[k] = 1;
      } else {
        allDirty = true;
      }
    }
  }

  function candReadsDirty(cand) {
    if (allDirty) return true;
    if (cand.kind === JF_CAND_ACTION) {
      return dirty[layer.fromIdx[cand.localIdx]] || dirty[layer.toIdx[cand.localIdx]];
    }
    if (cand.kind === JF_CAND_CHAIN) {
      for (var i = 0; i < cand.locals.length; i++) {
        if (dirty[layer.fromIdx[cand.locals[i]]] || dirty[layer.toIdx[cand.locals[i]]]) return true;
      }
      return false;
    }
    var ch = ir.layers[cand.layer];
    if (!ch || !ch.touchMask) return true;
    for (var k = 0; k < dirty.length; k++) {
      if (ch.touchMask[k] && dirty[k]) return true;
    }
    return false;
  }

  function spineSuffixBlocked(localIdx) {
    if (!layer.spineSuffixMask || !layer.spineSuffixMask[localIdx]) return false;
    var incDone = false;
    for (var ic = 0; ic < nC; ic++) {
      if (done[ic] && candidates[ic].kind === JF_CAND_INCLUDE &&
          candidates[ic].layer === layer.spineIncludeLayer) {
        incDone = true;
        break;
      }
    }
    if (!incDone) return true;
    var pref = layer.spinePrefixMask;
    for (var p = 0; p < pref.length; p++) {
      if (pref[p] && !realizedActions[p]) return true;
    }
    return false;
  }

  function eligible(cand) {
    if (cand.kind === JF_CAND_ACTION) {
      var li = cand.localIdx;
      if (layer.afterIdx[li] >= 0 && !realizedActions[layer.afterIdx[li]]) return false;
      if (spineSuffixBlocked(li)) return false;
      return jfCanApplyLocal(layer, li, stocks, ir.polarities);
    }
    if (cand.kind === JF_CAND_CHAIN) {
      var head = cand.locals[0];
      if (layer.afterIdx[head] >= 0 && !realizedActions[layer.afterIdx[head]]) return false;
      if (spineSuffixBlocked(head)) return false;
      if (!scratch || scratch.length !== stocks.length) scratch = new Float64Array(stocks.length);
      scratch.set(stocks);
      return jfApplyChain(layer, cand.locals, scratch, ir.polarities, null);
    }
    var child = ir.layers[cand.layer];
    if (!child) return false;
    var fp = jfFingerprint(child, stocks);
    var key = cand.layer + ':' + fp;
    if (memo.has(key)) return memo.get(key);
    if (jfCertOk(child, stocks)) {
      memo.set(key, true);
      return true;
    }
    if (!scratch || scratch.length !== stocks.length) scratch = new Float64Array(stocks.length);
    scratch.set(stocks);
    var probeRec = jfMakeRecorder(ir, 'counts');
    var ok = jfRunLayerOnce(ir, cand.layer, scratch, probeRec, depth + 1, memo);
    memo.set(key, ok);
    return ok;
  }

  while (remaining > 0 && guard++ < 200000) {
    var elig = [];
    var rows = [];
    for (var i = 0; i < nC; i++) {
      if (done[i]) continue;
      var cand = candidates[i];
      if (!eligible(cand)) continue;
      elig.push(i);
      if (!scoreValid[i] || candReadsDirty(cand)) {
        scores[i] = jfScoreCandidate(cand, layer, stocks, ir.polarities);
        scoreValid[i] = 1;
      }
    }
    if (elig.length === 0) {
      return !layer.atomic;
    }
    if (elig.length >= 32) {
      rows = [];
      for (var e = 0; e < elig.length; e++) {
        var cd = candidates[elig[e]];
        if (cd.kind === JF_CAND_INCLUDE) {
          rows.push({ skip: true });
          continue;
        }
        var loc = cd.kind === JF_CAND_CHAIN ? cd.locals[0] : cd.localIdx;
        rows.push({
          methodId: layer.methodId[loc],
          x: layer.x[loc],
          y: layer.y[loc],
          xMax: stocks[layer.fromIdx[loc]],
          yMax: stocks[layer.toIdx[loc]],
          scale: layer.scale[loc] || 0
        });
      }
      var batch = jfBatchScore(rows);
      for (var e2 = 0; e2 < elig.length; e2++) {
        if (!rows[e2].skip) {
          scores[elig[e2]] = batch[e2];
          scoreValid[elig[e2]] = 1;
        }
      }
    }

    var bestI = -1;
    var bestS = -Number.MAX_VALUE;
    for (var e3 = 0; e3 < elig.length; e3++) {
      var idx = elig[e3];
      if (scores[idx] > bestS) {
        bestS = scores[idx];
        bestI = idx;
      }
    }
    var pick = candidates[bestI];
    done[bestI] = 1;
    remaining--;
    for (var d = 0; d < dirty.length; d++) dirty[d] = 0;
    allDirty = false;
    markDirtyFromCand(pick);

    if (pick.kind === JF_CAND_ACTION) {
      jfApplyLocal(layer, pick.localIdx, stocks);
      realizedActions[pick.localIdx] = 1;
      jfRecordLocal(layer, pick.localIdx, rec);
    } else if (pick.kind === JF_CAND_CHAIN) {
      if (!jfApplyChain(layer, pick.locals, stocks, ir.polarities, rec)) return false;
      for (var ci = 0; ci < pick.locals.length; ci++) realizedActions[pick.locals[ci]] = 1;
    } else {
      // Include block: Frame monoid when child spine is fully summarized
      if (!jfTryIncludeMonoid(ir, pick.layer, stocks, rec)) {
        for (var rr = 0; rr < pick.repeat; rr++) {
          if (!jfRunLayerOnce(ir, pick.layer, stocks, rec, depth + 1, memo)) return false;
        }
      }
    }
    for (var iv = 0; iv < nC; iv++) {
      if (!done[iv] && candReadsDirty(candidates[iv])) scoreValid[iv] = 0;
    }
  }

  if (layer.atomic) {
    for (var a = 0; a < layer.actions.length; a++) {
      if (!realizedActions[a]) return false;
    }
  }
  return remaining === 0 || !layer.atomic;
}

/**
 * Fast path for flat competing actions: max-heap + dirty-resource updates.
 * Tie-break: lower candidate index wins (matches scan-left Best).
 */
function jfFastBestActionsOnly(ir, layerIdx, stocks, rec) {
  var layer = ir.layers[layerIdx];
  var candidates = layer.candidates;
  var nC = candidates.length;
  var nA = layer.actions.length;
  var done = new Uint8Array(nC);
  var realized = new Uint8Array(nA);
  var scores = new Float64Array(nC);
  var localOf = new Int16Array(nC);
  for (var c0 = 0; c0 < nC; c0++) localOf[c0] = candidates[c0].localIdx;
  var polarities = ir.polarities;
  var fromIdx = layer.fromIdx;
  var toIdx = layer.toIdx;
  var xs = layer.x;
  var ys = layer.y;
  var methodId = layer.methodId;
  var scales = layer.scale;
  var afterIdx = layer.afterIdx;
  var actionIds = new Int32Array(nA);
  for (var ai = 0; ai < nA; ai++) actionIds[ai] = layer.actions[ai].actionId;

  // resource → candidate idxs that read it
  var nRes = stocks.length;
  var readers = new Array(nRes);
  for (var r0 = 0; r0 < nRes; r0++) readers[r0] = [];
  for (var c1 = 0; c1 < nC; c1++) {
    var L = localOf[c1];
    readers[fromIdx[L]].push(c1);
    if (toIdx[L] !== fromIdx[L]) readers[toIdx[L]].push(c1);
  }
  var waiters = new Array(nA);
  for (var w0 = 0; w0 < nA; w0++) waiters[w0] = [];
  for (var w1 = 0; w1 < nC; w1++) {
    var d0 = afterIdx[localOf[w1]];
    if (d0 >= 0) waiters[d0].push(w1);
  }

  // binary max-heap of candidate indices; better score, then lower index
  var heap = new Int32Array(nC + 1);
  var heapN = 0;
  var at = new Int32Array(nC);
  for (var z = 0; z < nC; z++) at[z] = -1;

  function better(a, b) {
    var sa = scores[a];
    var sb = scores[b];
    if (sa !== sb) return sa > sb;
    return a < b;
  }
  function siftUp(i) {
    var v = heap[i];
    while (i > 1) {
      var p = i >> 1;
      if (!better(v, heap[p])) break;
      heap[i] = heap[p];
      at[heap[i]] = i;
      i = p;
    }
    heap[i] = v;
    at[v] = i;
  }
  function siftDown(i) {
    var v = heap[i];
    for (;;) {
      var l = i << 1;
      if (l > heapN) break;
      var r = l + 1;
      var best = (r <= heapN && better(heap[r], heap[l])) ? r : l;
      if (!better(heap[best], v)) break;
      heap[i] = heap[best];
      at[heap[i]] = i;
      i = best;
    }
    heap[i] = v;
    at[v] = i;
  }
  function heapPush(c) {
    if (at[c] !== -1) return;
    heap[++heapN] = c;
    at[c] = heapN;
    siftUp(heapN);
  }
  function heapRemove(c) {
    var i = at[c];
    if (i === -1) return;
    at[c] = -1;
    if (i === heapN) { heapN--; return; }
    var last = heap[heapN--];
    heap[i] = last;
    at[last] = i;
    siftUp(i);
    siftDown(i);
  }
  function heapPopValid() {
    while (heapN > 0) {
      var c = heap[1];
      heapRemove(c);
      if (done[c]) continue;
      var li = localOf[c];
      if (afterIdx[li] >= 0 && !realized[afterIdx[li]]) continue;
      if (!jfCanApplySides(fromIdx[li], toIdx[li], xs[li], ys[li], stocks, polarities)) continue;
      return c;
    }
    return -1;
  }
  function scoreOne(c) {
    var li = localOf[c];
    scores[c] = jfScoreNumeric(
      methodId[li], xs[li], ys[li],
      stocks[fromIdx[li]], stocks[toIdx[li]],
      scales[li] || null
    );
  }

  // seed heap
  for (var i = 0; i < nC; i++) {
    var li0 = localOf[i];
    if (afterIdx[li0] >= 0) continue;
    if (!jfCanApplySides(fromIdx[li0], toIdx[li0], xs[li0], ys[li0], stocks, polarities)) continue;
    scoreOne(i);
    heapPush(i);
  }

  var picks = 0;
  var guard = 0;
  while (guard++ < 200000) {
    var bestI = heapPopValid();
    if (bestI < 0) break;
    var pickLi = localOf[bestI];
    done[bestI] = 1;
    picks++;
    var df = fromIdx[pickLi];
    var dt = toIdx[pickLi];
    stocks[df] -= xs[pickLi];
    stocks[dt] -= ys[pickLi];
    realized[pickLi] = 1;
    rec.record(actionIds[pickLi]);

    // dirty readers: rescore / drop
    var touched = df === dt ? [df] : [df, dt];
    for (var t = 0; t < touched.length; t++) {
      var list = readers[touched[t]];
      for (var k = 0; k < list.length; k++) {
        var c = list[k];
        if (done[c]) continue;
        var lc = localOf[c];
        if (afterIdx[lc] >= 0 && !realized[afterIdx[lc]]) {
          heapRemove(c);
          continue;
        }
        if (!jfCanApplySides(fromIdx[lc], toIdx[lc], xs[lc], ys[lc], stocks, polarities)) {
          heapRemove(c);
          continue;
        }
        scoreOne(c);
        if (at[c] === -1) heapPush(c);
        else { siftUp(at[c]); siftDown(at[c]); }
      }
    }
    // unlock waiters
    var unlocked = waiters[pickLi];
    for (var u = 0; u < unlocked.length; u++) {
      var uc = unlocked[u];
      if (done[uc]) continue;
      var ul = localOf[uc];
      if (!jfCanApplySides(fromIdx[ul], toIdx[ul], xs[ul], ys[ul], stocks, polarities)) continue;
      scoreOne(uc);
      heapPush(uc);
    }
  }

  if (layer.atomic) {
    for (var a = 0; a < nA; a++) if (!realized[a]) return false;
    return true;
  }
  return true;
}

/**
 * Reference: pre-plan dry-run FastBest on the same PlanIR (actions-only layers).
 * Every pick: stocks.slice() per remaining candidate + full rescore. For benches.
 */
function jfFastBestDryRunRef(ir, layerIdx, stocks, rec) {
  var layer = ir.layers[layerIdx];
  var nA = layer.actions.length;
  var done = new Uint8Array(nA);
  var realized = new Uint8Array(nA);
  var left = nA;
  var guard = 0;
  while (left > 0 && guard++ < 200000) {
    var best = -1;
    var bestS = -Number.MAX_VALUE;
    for (var i = 0; i < nA; i++) {
      if (done[i]) continue;
      if (layer.afterIdx[i] >= 0 && !realized[layer.afterIdx[i]]) continue;
      var snap = stocks.slice();
      if (!jfCanApplyLocal(layer, i, snap, ir.polarities)) continue;
      jfApplyLocal(layer, i, snap);
      var s = jfScoreNumeric(
        layer.methodId[i], layer.x[i], layer.y[i],
        stocks[layer.fromIdx[i]], stocks[layer.toIdx[i]],
        layer.scale[i] || null
      );
      if (s > bestS) { bestS = s; best = i; }
    }
    if (best < 0) return !layer.atomic;
    jfApplyLocal(layer, best, stocks);
    realized[best] = 1;
    done[best] = 1;
    left--;
    rec.record(layer.actions[best].actionId);
  }
  return left === 0 || !layer.atomic;
}

function jfRunLayerOnce(ir, layerIdx, stocks, rec, depth, memo) {
  var layer = ir.layers[layerIdx];
  if (!layer) return false;
  // Summarized linear instance via Frame monoid (counts mode)
  if (layer.frameSummarized && layer.frameVInstance && ir.frame && !(rec && rec.mode === 'full')) {
    var api1 = JFExp6Frame;
    if (api1) {
      if (layer.atomic) {
        var snap1 = stocks.slice();
        if (!api1.jfApplyV(snap1, layer.frameVInstance, rec, ir, false)) return false;
        stocks.set(snap1);
        return true;
      }
      return api1.jfApplyV(stocks, layer.frameVInstance, rec, ir, false);
    }
  }
  if (layer.atomic) {
    var snap = stocks.slice();
    var ok = jfFastBestLayerInstance(ir, layerIdx, snap, rec, depth, memo);
    if (!ok) return false;
    stocks.set(snap);
    return true;
  }
  return jfFastBestLayerInstance(ir, layerIdx, stocks, rec, depth, memo);
}

function jfRunLayerRepeated(ir, layerIdx, stocks, rec) {
  var layer = ir.layers[layerIdx];
  // Full layer value (instance × repeat) in one monoid apply (counts mode)
  if (layer.frameSummarized && layer.frameV && ir.frame && !(rec && rec.mode === 'full')) {
    var apiR = JFExp6Frame;
    if (apiR) return apiR.jfApplyV(stocks, layer.frameV, rec, ir, false);
  }
  var reps = layer.repeat || 1;
  var memo = new Map();
  for (var r = 0; r < reps; r++) {
    if (!jfRunLayerOnce(ir, layerIdx, stocks, rec, 0, memo)) return false;
  }
  return true;
}

function jfRunPlanIR(ir, liveResources, opts) {
  opts = opts || {};
  var mode = opts.sequenceMode || 'counts';
  var stocks = new Float64Array(ir.starts.length);
  for (var i = 0; i < ir.resNames.length; i++) {
    var joy = liveResources.get(ir.resNames[i]);
    stocks[i] = joy && joy.jmax != null ? joy.jmax : ir.starts[i];
  }
  var rec = jfMakeRecorder(ir, mode);
  var ok = false;
  var usedFrame = false;
  // Prefer full Frame monoid eval when root spine is fully summarized
  var apiF = JFExp6Frame;
  if (mode !== 'full' && ir.frame && apiF && typeof apiF.jfEvalFrame === 'function') {
    ok = apiF.jfEvalFrame(ir, ir.frame, stocks, rec, { sequenceMode: mode });
    usedFrame = ok;
  }
  if (!ok) {
    ok = jfRunLayerRepeated(ir, ir.rootIdx, stocks, rec);
  }
  if (ok) {
    // Snapshot → write stocks → emit net changes so onGain/onSpend/when fire
    // (handlers may further mutate via give/take after the FastBest commit).
    var befores = new Float64Array(ir.resNames.length);
    for (var j0 = 0; j0 < ir.resNames.length; j0++) {
      var res0 = liveResources.get(ir.resNames[j0]);
      befores[j0] = res0 && res0.jmax != null ? res0.jmax : 0;
    }
    for (var j = 0; j < ir.resNames.length; j++) {
      var res = liveResources.get(ir.resNames[j]);
      if (!res) continue;
      if (typeof res.updateInject === 'function') {
        if (typeof res._jmax !== 'undefined') res._jmax = stocks[j];
        else res.jmax = stocks[j];
        if (res.sequence && res.sequence.jgroup) res.sequence.jgroup.length = 0;
      } else {
        res.jmax = stocks[j];
      }
    }
    for (var j1 = 0; j1 < ir.resNames.length; j1++) {
      var res1 = liveResources.get(ir.resNames[j1]);
      if (!res1) continue;
      emitResourceChange(res1, befores[j1], stocks[j1]);
    }
  }
  return {
    ok: ok,
    names: rec.names,
    counts: rec.counts,
    stocks: stocks,
    sequenceMode: mode,
    usedFrame: usedFrame,
    frame: !!ir.frame
  };
}

/**
 * JBlueprint extends JGroup.
 *
 * After build(), the returned handle's jgroup shares identity with the compiled
 * root relation's sequence — so bp.Best() / outer.Consider(bp) use the same
 * members run() does. Layer templates remain plain JGroups inside JRelation
 * (clone-safe). One authoring BP may .build() multiple roots (shared resources).
 *
 * Exp6: build() also emits planIR; run() uses FastBest when planIR is valid.
 */
class JBlueprint extends JGroup {
  /**
   * Fluent authoring → compiled JRelation, exposed as a JGroup handle.
   *
   *   const bp = JBlueprint.create()
   *     .resource('X', { start: 10 })
   *     .resource('Y', { start: 0 })
   *     .layer('Day')
   *       .do('Work', { from: 'X', to: 'Y', x: 1, y: -1 })
   *       .end()
   *     .build()
   *   bp.Best()                 // JGroup
   *   outer.Consider(bp)        // nest like any group
   *   bp.plan()                 // bag handle { root, run, resource, … }
   */
  constructor() {
    super()
    this.name = 'Blueprint'
    this.resources = new Map()
    this.methods = new Map()
    /** Named value methods: transform / compute from event ctx (not scorers). */
    this.fns = new Map()
    this._layers = new Map()
    this._stack = []
    this._rootLayer = null
    /** Exp6: methodFrom metadata for PlanIR scorers */
    this._methodMeta = new Map()
    /** @type {Map<string, Array<{type:string, fn?:Function, spec?:object, fired?:boolean}>>} */
    this._events = new Map()
    this._eventDepth = 0
    /** @type {JRelation|null} compiled root after build() */
    this.root = null
    this._built = false
    /** @type {object|null} Exp6 PlanIR */
    this.planIR = null
    this._lastFastRun = null
  }

  static create() {
    return new JBlueprint()
  }

  _tagResource(name, joy) {
    joy.__bpName = name
    joy.__bpOwner = this
    return joy
  }

  /**
   * Easy resource mutation helpers for event handlers / tests.
   * amount > 0 adds capacity; for relations uses updateInject.
   */
  give(name, amount, opts) {
    amount = amount == null ? 1 : amount
    if (!amount) return this
    let joy = this._resolveResource(name)
    let before = joy.jmax
    if (isRelationJoy(joy)) {
      joy.updateInject(joy.jmax + amount, null, null, null)
    } else {
      joy.jmax = joy.jmax + amount
    }
    if (!(opts && opts.silent)) emitResourceChange(joy, before, joy.jmax)
    return this
  }

  take(name, amount) {
    amount = amount == null ? 1 : amount
    return this.give(name, -amount)
  }

  get(name) {
    return this._resolveResource(name).jmax
  }

  /**
   * Register a named value method — does something with resource value(s).
   * Unlike .method() (action scorers), these run from events / call().
   *
   *   .fn('kickback', ({ amount }) => amount * 0.1)
   *   .onGain('money', { give: { happy: 'kickback' } })
   *
   *   .fn('interest', ({ amount }) => amount * 0.05)
   *   .onGain('savings', { apply: 'interest' })
   *
   *   .fn('payday', (ctx) => { ctx.give('money', 500) })
   *   .when({ resource: 'monthDone', gte: 1, call: 'payday' })
   */
  fn(name, handler) {
    if (typeof handler !== 'function') throw new Error('JBlueprint.fn: need a function')
    this.fns.set(name, handler)
    return this
  }

  /** Invoke a named value method with an optional partial event ctx. */
  call(name, partial) {
    if (typeof partial === 'number') partial = { amount: partial }
    let ctx = Object.assign(this._makeEventCtx(
      (partial && partial.resource) || '',
      (partial && partial.before) != null ? partial.before : 0,
      (partial && partial.after) != null ? partial.after : ((partial && partial.value) != null ? partial.value : 0)
    ), partial || {})
    if (partial && partial.amount != null && partial.delta == null && partial.before == null) {
      // amount-only calls: keep amount authoritative
      ctx.amount = Math.abs(partial.amount)
      ctx.delta = partial.amount
    }
    return this._callFn(name, ctx)
  }

  /** Shared helpers for user jmethods + layer score fns (includes .fn / call). */
  _methodHelpers() {
    let self = this
    return {
      norm: JBlueprint.norm,
      resources: self.resources,
      blueprint: self,
      get: function (n) { return self.get(n) },
      /** Run a named event/value fn; number arg ≡ { amount }. */
      call: function (name, partial) { return self.call(name, partial) },
      /** Look up a raw .fn handler. */
      fn: function (name) {
        if (!self.fns.has(name)) throw new Error('JBlueprint: unknown fn "' + name + '"')
        return self.fns.get(name)
      },
      // Live resource mutations — prefer onGain/onSpend events; available if a jmethod must side-effect.
      give: function (n, amt) { self.give(n, amt); return this },
      take: function (n, amt) { self.take(n, amt); return this }
    }
  }

  /** Fire on any capacity change. */
  onChange(resourceName, handlerOrSpec) {
    return this._addEvent(resourceName, 'change', handlerOrSpec)
  }

  /** Fire when capacity increases (mint / refund / give). */
  onGain(resourceName, handlerOrSpec) {
    return this._addEvent(resourceName, 'gain', handlerOrSpec)
  }

  /** Fire when capacity decreases (spend / consume). */
  onSpend(resourceName, handlerOrSpec) {
    return this._addEvent(resourceName, 'spend', handlerOrSpec)
  }

  /**
   * Threshold event. Examples:
   *   .when({ resource: 'monthDone', gte: 12, once: true, give: { happy: 5 } })
   *   .when({ resource: 'energy', cross: 50, run: (ctx) => ctx.give('happy', 1) })
   *   .when({ resource: 'monthDone', gte: 1, call: 'payday' })
   */
  when(spec) {
    if (!spec || !spec.resource) throw new Error('JBlueprint.when: need { resource, ... }')
    return this._addEvent(spec.resource, 'when', spec)
  }

  _addEvent(resourceName, type, handlerOrSpec) {
    if (!this._events.has(resourceName)) this._events.set(resourceName, [])
    let entry = { type: type, fired: false }
    if (typeof handlerOrSpec === 'function') {
      entry.fn = handlerOrSpec
    } else if (typeof handlerOrSpec === 'string') {
      // .onGain('money', 'kickback') → call named value method
      entry.spec = { call: handlerOrSpec }
    } else {
      entry.spec = handlerOrSpec || {}
      if (typeof entry.spec.run === 'function') entry.fn = entry.spec.run
    }
    this._events.get(resourceName).push(entry)
    return this
  }

  _callFn(nameOrFn, ctx) {
    let fn = nameOrFn
    if (typeof nameOrFn === 'string') {
      if (!this.fns.has(nameOrFn)) throw new Error('JBlueprint: unknown fn "' + nameOrFn + '"')
      fn = this.fns.get(nameOrFn)
    }
    if (typeof fn !== 'function') throw new Error('JBlueprint: fn must be a function')
    return fn(ctx)
  }

  _resolveAmount(amt, ctx) {
    if (typeof amt === 'number') return amt
    if (typeof amt === 'string') {
      let out = this._callFn(amt, ctx)
      return typeof out === 'number' ? out : 0
    }
    if (typeof amt === 'function') {
      let out = amt(ctx)
      return typeof out === 'number' ? out : 0
    }
    return 0
  }

  _makeEventCtx(name, before, after) {
    let self = this
    return {
      resource: name,
      name: name,
      before: before,
      after: after,
      value: after,
      delta: after - before,
      gain: after > before,
      spend: after < before,
      amount: Math.abs(after - before),
      norm: JBlueprint.norm,
      resources: self.resources,
      get: function (n) { return self.get(n) },
      give: function (n, amt) { self.give(n, amt); return this },
      take: function (n, amt) { self.take(n, amt); return this },
      call: function (fnName, extra) {
        return self._callFn(fnName, Object.assign({}, this, extra || {}))
      },
      /** Add returned number to this resource (or named one). */
      apply: function (fnName, target) {
        let out = self._callFn(fnName, this)
        if (typeof out === 'number' && out !== 0) {
          self.give(target || name, out, { silent: true })
        }
        return this
      },
      /** Set resource to returned absolute value. */
      set: function (n, amtOrFn) {
        let joy = self._resolveResource(n)
        let target = typeof amtOrFn === 'number'
          ? amtOrFn
          : self._resolveAmount(amtOrFn, this)
        let before = joy.jmax
        let delta = target - before
        if (delta !== 0) self.give(n, delta)
        return this
      }
    }
  }

  _applyEventSpec(spec, ctx) {
    if (!spec) return
    let self = this
    // call named value method first (may give/take itself)
    if (spec.call != null) this._callFn(spec.call, ctx)
    // apply: add fn(ctx) onto the triggering resource (or spec.target).
    // Silent so the same onGain/apply rule does not compound on its own grant.
    if (spec.apply != null) {
      let out = this._callFn(spec.apply, ctx)
      if (typeof out === 'number' && out !== 0) {
        self.give(spec.target || ctx.resource, out, { silent: true })
      }
    }
    if (spec.give) {
      Object.keys(spec.give).forEach(function (n) {
        ctx.give(n, self._resolveAmount(spec.give[n], ctx))
      })
    }
    if (spec.take) {
      Object.keys(spec.take).forEach(function (n) {
        ctx.take(n, self._resolveAmount(spec.take[n], ctx))
      })
    }
    if (spec.set) {
      Object.keys(spec.set).forEach(function (n) {
        ctx.set(n, spec.set[n])
      })
    }
  }

  _dispatchResourceEvent(name, before, after) {
    let list = this._events.get(name)
    if (!list || list.length === 0) return
    if (this._eventDepth > 8) return // re-entrancy guard
    this._eventDepth++
    try {
      let ctx = this._makeEventCtx(name, before, after)
      for (let i = 0; i < list.length; i++) {
        let ev = list[i]
        if (ev.type === 'gain' && !ctx.gain) continue
        if (ev.type === 'spend' && !ctx.spend) continue
        if (ev.type === 'when') {
          let spec = ev.spec || {}
          if (spec.once && ev.fired) continue
          let ok = false
          if (spec.cross != null) {
            let t = spec.cross
            ok = (before < t && after >= t) || (before > t && after <= t)
          } else if (spec.eq != null) {
            ok = after === spec.eq && before !== spec.eq
          } else if (spec.lte != null) {
            ok = after <= spec.lte && before > spec.lte
          } else if (spec.gte != null) {
            ok = after >= spec.gte && before < spec.gte
          } else {
            ok = true // bare when({ resource }) ≡ onChange
          }
          if (!ok) continue
          ev.fired = true
          this._applyEventSpec(spec, ctx)
          if (ev.fn) ev.fn(ctx)
          continue
        }
        // change / gain / spend
        if (ev.spec) this._applyEventSpec(ev.spec, ctx)
        if (ev.fn) ev.fn(ctx)
      }
    } finally {
      this._eventDepth--
    }
  }

  /** Score helpers for user-written jmethods (0–1 friendly). */
  static get norm() {
    return {
      clamp01(v) {
        if (v !== v) return 0
        if (v < 0) return 0
        if (v > 1) return 1
        return v
      },
      /** Map raw magnitude into (0,1) with soft saturation. */
      unit(raw, scale) {
        scale = scale == null ? 1 : Math.abs(scale) || 1
        let t = Math.abs(raw) / scale
        return JBlueprint.norm.clamp01(t / (1 + t))
      },
      /** Layer compression: mean of child scores → still in a comparable band. */
      layerAverage(scores) {
        if (!scores || scores.length === 0) return 0
        let s = 0
        for (let i = 0; i < scores.length; i++) s += scores[i]
        return s / scores.length
      },
      /** Sum then divide by count (alias). */
      layerMean(scores) {
        return JBlueprint.norm.layerAverage(scores)
      },
      /**
       * Lightweight pair scorer from deltas + capacity probes.
       * Not a replacement for JDirect — a starting point for custom methods.
       */
      pair(x, y, xmax, ymax) {
        let X = xmax && xmax.jmax != null ? xmax.jmax : 0
        let Y = ymax && ymax.jmax != null ? ymax.jmax : 0
        let mag = Math.abs(x) + Math.abs(y)
        let cap = Math.abs(X) + Math.abs(Y) + 1
        return JBlueprint.norm.clamp01(mag / cap)
      }
    }
  }

  /**
   * Register: .resource(name, opts) → this
   * Lookup:   .resource(name) → Joy | JRelation  (after register / build)
   */
  resource(name, opts) {
    if (arguments.length < 2 || opts == null) {
      if (!this.resources.has(name)) {
        throw new Error('JBlueprint: unknown resource "' + name + '"')
      }
      return this.resources.get(name)
    }
    let polarity = opts.polarity === '-' || opts.polarity === -Number.MIN_VALUE
      ? -Number.MIN_VALUE
      : Number.MIN_VALUE
    let start = opts.start != null ? opts.start : 0
    // Scalar stocks (money, energy) stay Joy — a 8000-unit token relation is wasteful.
    // Gates / banks use JRelation (default when gate:true or kind:'relation').
    let asJoy = opts.kind === 'joy' || opts.scalar ||
      (opts.kind !== 'relation' && !opts.gate && start > 0)
    if (asJoy) {
      this.resources.set(name, this._tagResource(name, new Joy(start, polarity)))
      return this
    }
    let tok = new JGroup()
    tok.jatomic = true
    tok.name = 'Tok_' + name
    let rel = new JRelation(tok, start, polarity, opts.chain ? { chain: true } : undefined)
    rel.sequence.jatomic = false
    rel.sequence.name = name
    this.resources.set(name, this._tagResource(name, rel))
    return this
  }

  /** Register a user jmethod. fn(ctx) → number; ctx has x,y,X,Y,group,norm,call,fn,get. */
  method(name, fn) {
    let self = this
    this.methods.set(name, function (x, y, xmax, ymax, jgroup) {
      let helpers = self._methodHelpers()
      let raw = fn(Object.assign({
        x: x,
        y: y,
        X: xmax,
        Y: ymax,
        group: jgroup,
        // Convenience mirrors of the action delta for event fns
        amount: Math.abs(y != null ? y : (x != null ? x : 0)),
        delta: y != null ? -y : (x != null ? -x : 0)
      }, helpers))
      return typeof raw === 'number' ? raw : 0
    })
    return this
  }

  /** Wrap an existing jmethod (e.g. JDirect) so its return is compressed to ~0–1. */
  methodFrom(name, baseFn, scale) {
    scale = scale == null ? 2 : scale
    var id = JF_METHOD_INDIRECT
    if (baseFn === JDirect) id = JF_METHOD_DIRECT
    else if (baseFn === JNeutral) id = JF_METHOD_NEUTRAL
    else if (baseFn === JIndirect) id = JF_METHOD_INDIRECT
    this._methodMeta.set(name, { id: id, scale: scale, baseFn: baseFn })
    return this.method(name, function (ctx) {
      let raw = baseFn(ctx.x, ctx.y, ctx.X, ctx.Y, ctx.group)
      return JBlueprint.norm.unit(raw, scale)
    })
  }

  layer(name, opts) {
    opts = opts || {}
    let layer = {
      name: name,
      atomic: !!opts.atomic,
      steps: [],
      repeatCount: 1,
      chain: !!opts.chain,
      /** Optional: custom group jmethod using layered child scores. */
      scoreFn: opts.score || null
    }
    this._layers.set(name, layer)
    this._stack.push(layer)
    // Last declared layer is default root (outermost usually declared last)
    this._rootLayer = name
    return this
  }

  do(stepName, spec) {
    if (this._stack.length === 0) throw new Error('JBlueprint.do: no active layer (call layer first)')
    let layer = this._stack[this._stack.length - 1]
    layer.steps.push({ kind: 'action', name: stepName, spec: spec || {} })
    return this
  }

  include(layerName) {
    if (this._stack.length === 0) throw new Error('JBlueprint.include: no active layer')
    let layer = this._stack[this._stack.length - 1]
    layer.steps.push({ kind: 'include', layer: layerName })
    return this
  }

  repeat(n) {
    if (this._stack.length === 0) throw new Error('JBlueprint.repeat: no active layer')
    let layer = this._stack[this._stack.length - 1]
    layer.repeatCount = Math.max(1, n | 0)
    this._stack.pop()
    return this
  }

  /** Close layer without repeating (count 1). */
  end() {
    if (this._stack.length === 0) throw new Error('JBlueprint.end: no active layer')
    this._stack.pop()
    return this
  }

  _resolveResource(name) {
    if (!this.resources.has(name)) throw new Error('JBlueprint: unknown resource "' + name + '"')
    return this.resources.get(name)
  }

  _resolveMethod(name) {
    if (name === 'direct') return JDirect
    if (name === 'indirect') return JIndirect
    if (name === 'neutral') return JNeutral
    if (this.methods.has(name)) return this.methods.get(name)
    throw new Error('JBlueprint: unknown method "' + name + '"')
  }

  _compileLayer(layerName, compiled) {
    compiled = compiled || new Map()
    if (compiled.has(layerName)) return compiled.get(layerName)
    let layer = this._layers.get(layerName)
    if (!layer) throw new Error('JBlueprint: unknown layer "' + layerName + '"')

    let self = this
    function makeBP() {
      let g = new JGroup()
      g.jatomic = layer.atomic
      g.name = layer.name
      let named = new Map()
      for (let i = 0; i < layer.steps.length; i++) {
        let step = layer.steps[i]
        if (step.kind === 'include') {
          let childRel = self._compileLayer(step.layer, compiled)
          g.Consider(childRel.sequence)
          continue
        }
        let spec = step.spec
        let method = self._resolveMethod(spec.method || 'indirect')
        let jX = self._resolveResource(spec.from)
        let jY = self._resolveResource(spec.to)
        let req = null
        if (spec.after) {
          if (!named.has(spec.after)) throw new Error('JBlueprint: after "' + spec.after + '" not found in ' + layerName)
          req = named.get(spec.after)
        }
        let act = new JAction(method, req, spec.x, spec.y, jX, jY)
        act.name = step.name
        named.set(step.name, act)
        g.Consider(act)
      }
      if (typeof layer.scoreFn === 'function') {
        let userScore = layer.scoreFn
        g.jmethod = function (x, y, jX, jY, jgroup) {
          this.jatomicFail = false
          let parentMap = jgroup && jgroup.__simJoyMap
          this.SimulatedBest(forkJoyMap(parentMap) || undefined)
          if (this.jatomicFail && this.jatomic) return -Number.MAX_VALUE
          let helpers = self._methodHelpers()
          let v = userScore(Object.assign({
            j: this.j,
            option: this.preRegroupOption || [],
            group: this,
            x: x,
            y: y,
            X: jX,
            Y: jY
          }, helpers))
          return typeof v === 'number' ? v : this.j
        }
      }
      return g
    }

    let blueprintGroup = makeBP()
    let rel = new JRelation(blueprintGroup, layer.repeatCount, Number.MIN_VALUE, layer.chain ? { chain: true } : undefined)
    rel.sequence.jatomic = false
    rel.sequence.name = layer.name + 's'
    compiled.set(layerName, rel)
    return rel
  }

  /**
   * Compile root layer → a built JBlueprint that *is* that jgroup.
   *
   * Returns a new handle (still instanceof JBlueprint / JGroup) sharing this
   * authoring BP's resources/methods/events/layers — so one façade can
   * .build('Life') and .build('Budget') as two planners.
   *
   * Built handle: .root, .run(), .runAsync(), .Best(), .resource(name) lookup, …
   * Alternate: .plan() → bag { blueprint, root, run, resource, … }.
   */
  build(rootName) {
    if (this._stack.length > 0) {
      throw new Error('JBlueprint.build: unclosed layer(s) — call repeat() or end()')
    }
    let root = rootName || this._rootLayer
    if (!root) throw new Error('JBlueprint.build: no layers')
    let compiled = new Map()
    let rootRel = this._compileLayer(root, compiled)

    // Fresh handle so multiple builds from one authoring BP stay independent
    let built = new JBlueprint()
    built.resources = this.resources
    built.methods = this.methods
    built.fns = this.fns
    built._events = this._events
    built._eventDepth = this._eventDepth
    built._layers = this._layers
    built._rootLayer = this._rootLayer
    built._stack = []
    built.root = rootRel
    built._built = true
    built.name = root
    built.blueprint = built
    built._methodMeta = this._methodMeta
    try {
      built.planIR = jfCompilePlanIR(this, root)
      built.planFrame = built.planIR && built.planIR.frame
      built._useFastBest = !!(built.planIR && built.planIR.rootIdx != null &&
        built.planIR.layers.every(function (L) { return L.fastPath !== false; }))
    } catch (_e) {
      built.planIR = null
      built.planFrame = null
      built._useFastBest = false
    }

    // Interface JGroup: share the live sequence array with the root relation.
    let seq = rootRel.sequence
    built.jgroup = seq.jgroup
    built.jhash = seq.jhash
    built.jatomic = seq.jatomic
    built.jreq = seq.jreq
    if (seq.jmethod) built.jmethod = seq.jmethod

    return built
  }

  /**
   * Plan-bag use case: same compiled BP as a plain object handle
   * ({ blueprint, root, run, resource lookup, … }) without JGroup methods on the value.
   */
  plan() {
    if (!this._built || !this.root) {
      throw new Error('JBlueprint.plan: call build() first')
    }
    let self = this
    let rootRel = this.root
    return {
      blueprint: self,
      resources: self.resources,
      root: rootRel,
      resource(name) { return self.resource(name) },
      get(name) { return self.get(name) },
      give(name, amount) { self.give(name, amount); return this },
      take(name, amount) { self.take(name, amount); return this },
      call(name, partial) { return self.call(name, partial) },
      fn(name, handler) { self.fn(name, handler); return this },
      run() { return self.run() },
      runAsync() { return self.runAsync() }
    }
  }

  /**
   * Exp6: prefer PlanIR FastBest when available; else exp5-style root.update→Best.
   * When FastBest is enabled but incomplete, fail closed (no Best fallback) so
   * large spines cannot hang the UI. Inspect _lastFastRun.ok / fastCount.
   * opts.sequenceMode: 'counts' (default) | 'full'
   */
  run(opts) {
    if (!this.root) throw new Error('JBlueprint.run: call build() first')
    if (this._useFastBest && this.planIR) {
      var mode = (opts && opts.sequenceMode) || this.sequenceMode || 'counts'
      var result = jfRunPlanIR(this.planIR, this.resources, { sequenceMode: mode })
      this._lastFastRun = result
      this._fastCounts = result.counts || {}
      var option
      if (mode === 'full' && result.names && result.names.length) {
        option = result.names.map(function (n) { return { name: n }; })
      } else {
        option = jfCountsToOption(result.counts || {})
      }
      this.root.sequence.preRegroupOption = option
      this.preRegroupOption = option
      if (!result.ok && typeof console !== 'undefined') {
        console.warn('JFactor_exp6 FastBest incomplete — not falling back to Best()')
      }
      return this.root
    }
    this.root.update()
    return this.root
  }

  /** Exp6: O(1) leaf multiset count from last FastBest run. */
  fastCount(name) {
    if (this._fastCounts && this._fastCounts[name] != null) return this._fastCounts[name]
    if (this._lastFastRun && this._lastFastRun.counts) return this._lastFastRun.counts[name] || 0
    return 0
  }

  /**
   * Exp6 async: FastBest is sync; yield once then run().
   */
  async runAsync() {
    if (!this.root) throw new Error('JBlueprint.runAsync: call build() first')
    await Promise.resolve()
    return this.run()
  }

  /** Nest another built blueprint into this jgroup (same as Consider). */
  considerBp(other) {
    if (!(other instanceof JGroup)) {
      throw new Error('JBlueprint.considerBp: need a JGroup / built JBlueprint')
    }
    this.Consider(other)
    return this
  }

  /** Exp5: already a blueprint — upgrade is identity. */
  upgrade(opts) {
    if (this._built) return this
    return JGroup.prototype.asBlueprint.call(this, opts)
  }

  /** Exp5: static alias of group.asBlueprint. */
  static fromGroup(group, opts) {
    if (!group || typeof group.asBlueprint !== 'function') {
      throw new Error('JBlueprint.fromGroup: need a JGroup')
    }
    return group.asBlueprint(opts)
  }
}

/**
 * JWorld — multi-perspective façade over shared live resources.
 *
 * Perspectives are planners (JRelation or blueprint plan.root) that mutate the
 * same Joys/Relations. Best() stays single-threaded; runAsync() cooperatively
 * interleaves via JRelation.updateAsync (see test_parallel_update.js).
 * Parallelizing Best itself was tried (Exp3) and shelved.
 *
 *   JWorld.create()
 *     .resource('money', moneyJoy)
 *     .perspective('life', lifeRel)
 *     .perspective('budget', budgetRel)
 *     .run()        // sequential update()
 *     .runAsync()   // Promise.all(updateAsync)
 *
 *   JWorld.fromBlueprint(bp).perspective('life', lifePlan).runAsync()
 */
class JWorld {
  constructor() {
    this.resources = new Map()
    /** @type {Map<string, { name:string, rel: object }>} */
    this.perspectives = new Map()
    this._order = []
    this._blueprint = null
  }

  static create() {
    return new JWorld()
  }

  /** Adopt a blueprint's resource Map (same identity — events keep working). */
  static fromBlueprint(bp) {
    if (!bp || !bp.resources) throw new Error('JWorld.fromBlueprint: need a JBlueprint')
    let w = new JWorld()
    w.resources = bp.resources
    w._blueprint = bp
    return w
  }

  /** Convenience: bp.world() ≡ JWorld.fromBlueprint(bp) */
  // wired on JBlueprint.prototype below after class

  /**
   * Register a shared resource, or look one up.
   *   .resource('money', joyOrOpts)  // register
   *   .resource('money')             // → Joy/JRelation
   */
  resource(name, joyOrOpts) {
    if (arguments.length < 2) {
      if (!this.resources.has(name)) throw new Error('JWorld: unknown resource "' + name + '"')
      return this.resources.get(name)
    }
    if (joyOrOpts && (typeof joyOrOpts.jmax === 'number' || typeof joyOrOpts.updateInject === 'function' || joyOrOpts instanceof Joy)) {
      this.resources.set(name, joyOrOpts)
      return this
    }
    let opts = joyOrOpts || {}
    let polarity = opts.polarity === '-' || opts.polarity === -Number.MIN_VALUE
      ? -Number.MIN_VALUE
      : Number.MIN_VALUE
    let start = opts.start != null ? opts.start : 0
    let asJoy = opts.kind === 'joy' || opts.scalar ||
      (opts.kind !== 'relation' && !opts.gate && start > 0)
    if (asJoy) {
      this.resources.set(name, new Joy(start, polarity))
      return this
    }
    let tok = new JGroup()
    tok.jatomic = true
    tok.name = 'Tok_' + name
    let rel = new JRelation(tok, start, polarity, opts.chain ? { chain: true } : undefined)
    rel.sequence.jatomic = false
    rel.sequence.name = name
    this.resources.set(name, rel)
    return this
  }

  /**
   * Attach or look up a named planner.
   *   .perspective('life', relationOrPlan)  // register
   *   .perspective('life')                  // → JRelation
   */
  perspective(name, relationOrPlan) {
    if (arguments.length < 2) {
      if (!this.perspectives.has(name)) throw new Error('JWorld: unknown perspective "' + name + '"')
      return this.perspectives.get(name).rel
    }
    if (!name) throw new Error('JWorld.perspective: need a name')
    let rel = JWorld._resolvePlanner(relationOrPlan)
    if (!this.perspectives.has(name)) this._order.push(name)
    this.perspectives.set(name, { name: name, rel: rel })
    return this
  }

  static _resolvePlanner(relationOrPlan) {
    if (!relationOrPlan) throw new Error('JWorld.perspective: need a JRelation or plan')
    if (typeof relationOrPlan.update === 'function' && typeof relationOrPlan.updateAsync === 'function') {
      return relationOrPlan
    }
    if (relationOrPlan.root && typeof relationOrPlan.root.update === 'function') {
      return relationOrPlan.root
    }
    throw new Error('JWorld.perspective: expected JRelation or blueprint plan with .root')
  }

  get(name) {
    return this.resource(name).jmax
  }

  give(name, amount) {
    amount = amount == null ? 1 : amount
    if (!amount) return this
    let joy = this.resource(name)
    if (this._blueprint && typeof this._blueprint.give === 'function' && joy.__bpOwner === this._blueprint) {
      this._blueprint.give(name, amount)
      return this
    }
    if (isRelationJoy(joy)) {
      joy.updateInject(joy.jmax + amount, null, null, null)
    } else {
      joy.jmax = joy.jmax + amount
    }
    return this
  }

  take(name, amount) {
    amount = amount == null ? 1 : amount
    return this.give(name, -amount)
  }

  /** Sequential: each perspective update() in registration order. */
  run() {
    for (let i = 0; i < this._order.length; i++) {
      let entry = this.perspectives.get(this._order[i])
      entry.rel.update()
    }
    return this
  }

  /** Cooperative interleave: Promise.all of updateAsync() on each perspective. */
  runAsync() {
    let self = this
    let jobs = this._order.map(function (name) {
      return self.perspectives.get(name).rel.updateAsync()
    })
    return Promise.all(jobs).then(function () { return self })
  }
}

function main() {
  // Exp6: Blueprint PlanIR + FastBest (+ optional WebGPU)
}


if (typeof module !== 'undefined') {
  module.exports = {
    main, Joy, JAction, JGroup, JDirect, JIndirect, JNeutral, JRelation, JBlueprint, JWorld, Quota,
    // Exp6 bench hooks
    jfRunPlanIR, jfFastBestDryRunRef, jfFastBestLayerInstance, jfCompilePlanIR,
    JFExp6Frame: JFExp6Frame,
    JFExp6SIMD: JFExp6SIMD,
    JFExp6GPU: JFExp6GPU,
    JFExp6Workers: typeof JFExp6Workers !== 'undefined' ? JFExp6Workers : null,
    jfBatchScore: jfBatchScore,
    jfArgmaxJGroup: jfArgmaxJGroup,
    jfFieldBest: jfFieldBest,
    jfScoreNumeric: jfScoreNumeric
  };
}

// Blueprint → world convenience (after exports so class is defined)
JBlueprint.prototype.world = function () {
  return JWorld.fromBlueprint(this)
}

