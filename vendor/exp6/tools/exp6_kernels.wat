;; JFactor Exp6 — WASM kernels (scalar + SIMD where lanes are uniform).
;; Build: node tools/build_exp6_wasm.js
(module
  (memory (export "memory") 256 1024)

  ;; score_one: methodId,x,y,xMax,yMax,scale -> f64 score (jfScoreNumeric)
  (func $score_one (param $mid i32) (param $x f64) (param $y f64)
                   (param $xMax f64) (param $yMax f64) (param $scale f64)
                   (result f64)
    (local $p f64) (local $xVal f64) (local $yVal f64)
    (local $xNorm f64) (local $yNorm f64)
    (local $xC i32) (local $yC i32) (local $score f64) (local $t f64)
    (local.set $p (f64.const 0))
    (if (f64.ne (local.get $xMax) (f64.const 0))
      (then (local.set $p (f64.abs (f64.div (local.get $yMax) (local.get $xMax))))))
    (local.set $xVal (f64.mul (f64.mul (f64.abs (local.get $x)) (local.get $p)) (f64.const 0.5)))
    (local.set $yVal (f64.mul (f64.abs (local.get $y)) (f64.const 0.5)))
    (local.set $xNorm (f64.const 0))
    (local.set $yNorm (f64.const 0))
    (if (f64.ne (local.get $yMax) (f64.const 0))
      (then
        (local.set $xNorm (f64.div (local.get $xVal) (f64.abs (local.get $yMax))))
        (local.set $yNorm (f64.div (local.get $yVal) (f64.abs (local.get $yMax))))))
    (local.set $xC
      (i32.or
        (i32.and (f64.gt (local.get $x) (f64.const 0)) (f64.gt (local.get $xMax) (f64.const 0)))
        (i32.and (f64.lt (local.get $x) (f64.const 0)) (f64.lt (local.get $xMax) (f64.const 0)))))
    (local.set $yC
      (i32.or
        (i32.and (f64.gt (local.get $y) (f64.const 0)) (f64.gt (local.get $yMax) (f64.const 0)))
        (i32.and (f64.lt (local.get $y) (f64.const 0)) (f64.lt (local.get $yMax) (f64.const 0)))))
    (local.set $score (f64.const 0))
    (if (i32.eq (local.get $mid) (i32.const 0))
      (then
        (if (i32.eq (local.get $xC) (local.get $yC))
          (then
            (local.set $score (f64.add (local.get $xNorm) (local.get $yNorm)))
            (if (i32.eqz (local.get $xC))
              (then (local.set $score (f64.add (local.get $score) (f64.const 1))))))
          (else
            (local.set $score (f64.neg (f64.add (local.get $xNorm) (local.get $yNorm)))))))
      (else
        (if (i32.eq (local.get $mid) (i32.const 2))
          (then
            (local.set $score (f64.add (local.get $xNorm) (local.get $yNorm)))
            (if (i32.and (i32.eqz (local.get $xC)) (i32.eqz (local.get $yC)))
              (then (local.set $score (f64.add (local.get $score) (f64.const 1))))))
          (else
            (if (i32.ne (local.get $xC) (local.get $yC))
              (then (local.set $score (f64.add (local.get $xNorm) (local.get $yNorm))))
              (else
                (local.set $score (f64.neg (f64.add (local.get $xNorm) (local.get $yNorm))))
                (if (i32.and (i32.eqz (local.get $xC)) (i32.eqz (local.get $yC)))
                  (then (local.set $score (f64.add (local.get $score) (f64.const 1)))))))))))
    (if (f64.gt (local.get $scale) (f64.const 0))
      (then
        (local.set $t (f64.div (f64.abs (local.get $score)) (local.get $scale)))
        (local.set $score (f64.div (local.get $t) (f64.add (f64.const 1) (local.get $t))))))
    (local.get $score)
  )
  (export "score_one" (func $score_one))

  ;; score_batch_soa:
  ;; memory layout (bytes):
  ;;   mid: Int8  @ midPtr   (n)
  ;;   x,y,xMax,yMax,scale: Float64 @ their ptrs (n each)
  ;;   skip: Uint8 @ skipPtr (n)
  ;;   out: Float64 @ outPtr (n)
  (func $score_batch_soa
    (param $n i32) (param $midPtr i32) (param $xPtr i32) (param $yPtr i32)
    (param $xMaxPtr i32) (param $yMaxPtr i32) (param $scalePtr i32)
    (param $skipPtr i32) (param $outPtr i32)
    (local $i i32) (local $s f64)
    (loop $L
      (if (i32.lt_u (local.get $i) (local.get $n))
        (then
          (if (i32.load8_u (i32.add (local.get $skipPtr) (local.get $i)))
            (then
              (f64.store (i32.add (local.get $outPtr) (i32.shl (local.get $i) (i32.const 3)))
                (f64.const -1.7976931348623157e+308)))
            (else
              (local.set $s
                (call $score_one
                  (i32.load8_s (i32.add (local.get $midPtr) (local.get $i)))
                  (f64.load (i32.add (local.get $xPtr) (i32.shl (local.get $i) (i32.const 3))))
                  (f64.load (i32.add (local.get $yPtr) (i32.shl (local.get $i) (i32.const 3))))
                  (f64.load (i32.add (local.get $xMaxPtr) (i32.shl (local.get $i) (i32.const 3))))
                  (f64.load (i32.add (local.get $yMaxPtr) (i32.shl (local.get $i) (i32.const 3))))
                  (f64.load (i32.add (local.get $scalePtr) (i32.shl (local.get $i) (i32.const 3))))))
              (f64.store (i32.add (local.get $outPtr) (i32.shl (local.get $i) (i32.const 3)))
                (local.get $s))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L))))
  )
  (export "score_batch_soa" (func $score_batch_soa))

  ;; field_best: score every cell; write bestIndex (i32) @ outPtr, bestScore (f64) @ outPtr+8
  ;; Layer ptrs are Float32 arrays of length n.
  (func $field_best
    (param $n i32) (param $gw i32) (param $step f64)
    (param $scPtr i32) (param $tpPtr i32) (param $htPtr i32) (param $srPtr i32)
    (param $chPtr i32) (param $wkPtr i32) (param $ecPtr i32) (param $wdPtr i32)
    (param $align f64) (param $close f64)
    (param $ex f64) (param $ey f64) (param $px f64) (param $py f64)
    (param $stickyI i32) (param $outPtr i32)
    (local $i i32) (local $bestI i32) (local $bestS f64) (local $stickyS f64)
    (local $X f64) (local $Y f64) (local $s f64)
    (local $gx i32) (local $gy i32) (local $cx f64) (local $cy f64)
    (local $dx f64) (local $dy f64) (local $dShip f64) (local $dFoe f64)
    (local $sc f64) (local $tp f64) (local $ht f64) (local $sr f64)
    (local $ch f64) (local $wk f64) (local $ec f64) (local $wd f64)
    (local $rawBest f64) (local $rawI i32)
    (local.set $bestI (i32.const -1))
    (local.set $bestS (f64.const -1.0e300))
    (local.set $stickyS (f64.const -1.0e300))
    (local.set $rawBest (f64.const -1.0e300))
    (local.set $rawI (i32.const -1))
    (loop $L
      (if (i32.lt_u (local.get $i) (local.get $n))
        (then
          (local.set $sc (f64.promote_f32 (f32.load (i32.add (local.get $scPtr) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $tp (f64.promote_f32 (f32.load (i32.add (local.get $tpPtr) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $ht (f64.promote_f32 (f32.load (i32.add (local.get $htPtr) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $sr (f64.promote_f32 (f32.load (i32.add (local.get $srPtr) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $ch (f64.promote_f32 (f32.load (i32.add (local.get $chPtr) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $wk (f64.promote_f32 (f32.load (i32.add (local.get $wkPtr) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $ec (f64.promote_f32 (f32.load (i32.add (local.get $ecPtr) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $wd (f64.promote_f32 (f32.load (i32.add (local.get $wdPtr) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $X
            (f64.add (f64.add (f64.add (f64.add
              (f64.add (f64.add (f64.add
                (f64.mul (local.get $sc) (f64.const 2))
                (f64.mul (local.get $tp) (f64.const 1.2)))
                (f64.mul (local.get $ht) (f64.const 0.5)))
                (f64.mul (local.get $sr) (f64.const 0.6)))
                (f64.mul (local.get $ch) (f64.const 1.1)))
                (f64.mul (local.get $wk) (f64.const 0.9)))
                (f64.mul (local.get $ec) (f64.const 1.3)))
                (f64.mul (local.get $wd) (f64.const 0.8))))
          (local.set $Y
            (f64.add (f64.add (f64.add (f64.add (f64.add
              (f64.mul (local.get $sc) (f64.const 3))
              (local.get $ht))
              (f64.mul (local.get $tp) (f64.const 1.5)))
              (local.get $sr))
              (local.get $ch))
              (f64.mul (local.get $wk) (f64.const 2))))
          (local.set $s
            (f64.sub (f64.sub
              (f64.add (f64.mul (local.get $X) (f64.const 2.2)) (f64.mul (local.get $Y) (f64.const 0.01)))
              (f64.mul (local.get $align) (f64.const 3)))
              (f64.mul (local.get $close) (f64.const 2))))
          (local.set $gx (i32.rem_u (local.get $i) (local.get $gw)))
          (local.set $gy (i32.div_u (local.get $i) (local.get $gw)))
          (local.set $cx (f64.mul (f64.add (f64.convert_i32_u (local.get $gx)) (f64.const 0.5)) (local.get $step)))
          (local.set $cy (f64.mul (f64.add (f64.convert_i32_u (local.get $gy)) (f64.const 0.5)) (local.get $step)))
          (local.set $dx (f64.sub (local.get $cx) (local.get $ex)))
          (local.set $dy (f64.sub (local.get $cy) (local.get $ey)))
          (local.set $dShip (f64.sqrt (f64.add (f64.mul (local.get $dx) (local.get $dx)) (f64.mul (local.get $dy) (local.get $dy)))))
          (local.set $dx (f64.sub (local.get $cx) (local.get $px)))
          (local.set $dy (f64.sub (local.get $cy) (local.get $py)))
          (local.set $dFoe (f64.sqrt (f64.add (f64.mul (local.get $dx) (local.get $dx)) (f64.mul (local.get $dy) (local.get $dy)))))
          (local.set $s (f64.sub (local.get $s) (f64.mul (local.get $dShip) (f64.const 0.018))))
          (local.set $s
            (f64.add (local.get $s)
              (f64.mul
                (f64.max (f64.const 0) (f64.sub (f64.const 180) (local.get $dFoe)))
                (f64.const 0.01))))
          (local.set $s (f64.mul (local.get $s) (f64.const 0.55)))
          (if (i32.eq (local.get $i) (local.get $stickyI))
            (then (local.set $stickyS (local.get $s))))
          (if (f64.gt (local.get $s) (local.get $rawBest))
            (then
              (local.set $rawBest (local.get $s))
              (local.set $rawI (local.get $i))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L))))
    ;; hysteresis: keep sticky if sticky+2.5 >= rawBest-0.8
    (local.set $bestI (local.get $rawI))
    (local.set $bestS (local.get $rawBest))
    (if (i32.and (i32.ge_s (local.get $stickyI) (i32.const 0))
                  (f64.gt (local.get $stickyS) (f64.const -1.0e299)))
      (then
        (if (f64.ge (f64.add (local.get $stickyS) (f64.const 2.5))
                    (f64.sub (local.get $rawBest) (f64.const 0.8)))
          (then
            (local.set $bestI (local.get $stickyI))
            (local.set $bestS (f64.add (local.get $stickyS) (f64.const 2.5)))))))
    (i32.store (local.get $outPtr) (local.get $bestI))
    (f64.store (i32.add (local.get $outPtr) (i32.const 8)) (local.get $bestS))
  )
  (export "field_best" (func $field_best))

  ;; SIMD path: sum f32 lanes for a simple reduction helper (used in tests / cover)
  (func $simd_sum_f32 (param $ptr i32) (param $n i32) (result f32)
    (local $i i32) (local $acc v128) (local $sum f32) (local $tmp v128)
    (local.set $acc (v128.const i32x4 0 0 0 0))
    (block $done
      (loop $L
        (br_if $done (i32.gt_u (i32.add (local.get $i) (i32.const 4)) (local.get $n)))
        (local.set $tmp (v128.load (i32.add (local.get $ptr) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $acc (f32x4.add (local.get $acc) (local.get $tmp)))
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $L)))
    (local.set $sum
      (f32.add (f32.add
        (f32x4.extract_lane 0 (local.get $acc))
        (f32x4.extract_lane 1 (local.get $acc)))
        (f32.add
          (f32x4.extract_lane 2 (local.get $acc))
          (f32x4.extract_lane 3 (local.get $acc)))))
    (loop $T
      (if (i32.lt_u (local.get $i) (local.get $n))
        (then
          (local.set $sum (f32.add (local.get $sum)
            (f32.load (i32.add (local.get $ptr) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $T))))
    (local.get $sum)
  )
  (export "simd_sum_f32" (func $simd_sum_f32))
)
