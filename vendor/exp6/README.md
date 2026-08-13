# JFactor Exp6

This folder is the ranking engine living-core uses. The large file is the bundled engine, not a mystery blob.

A **Joy** is a named scalar stock the engine ranks and moves. Energy, attention, a calendar seat, a budget line — each can be a Joy. The engine comments use `money` as a *sample stock name*, the same way they use `energy`. That is an identifier, not a claim that Joy means currency.

## What to require

```js
const exp6 = require('./JFactor_exp6.js');
```

That is the only standalone entry. It exports `Joy`, `JAction`, `JGroup`, `JDirect`, `JIndirect`, `JNeutral`, `JRelation`, `JBlueprint`, `JWorld`, plan / FastBest helpers, and the Frame / SIMD / GPU / worker APIs.

What the engine does:

- You register Joys (and relations) on a blueprint / world.
- Actions rotate an origin toward an interest and change those Joys over time.
- **Best** / **SimulatedBest** pick the next action by scoring Joys, not by a vibes paragraph.
- Frame/SLP, SIMD, and GPU kernels evaluate long plans without walking every leaf.

## Layout

```
JFactor_exp6.js          bundled engine (require this)
jfactor_exp6_frame.js    thin re-export of Frame/SLP
jfactor_exp6_simd.js     thin re-export of SIMD scorer
jfactor_exp6_gpu.js      thin re-export of GPU helper
simulated_best.js        living-core ranking glue
tools/                   wasm / worker runtimes used by the bundled kernels
```

`simulated_best.js` requires a `modality` module that is not in this repo. It will not load standalone. Do not treat it as a runnable demo.

There is no test suite in this slice. A preload that remapped `./JFactor.js` for a private suite was removed on purpose.
