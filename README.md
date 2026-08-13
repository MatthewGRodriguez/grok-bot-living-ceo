# living-ceo (Grok Bot harness)

Public teaching slice of a process kernel that runs **on** Grok Bot: explore while you are gone, rank what to do next, and only wake the phone when a new layer is real.

Chat stays in Grok Bot. Discoveries notify outbound (Discord). Ranked joys and approvals stay human. This is not a fork of Grok Bot and not the full living-core runtime (hop0, MCP, idle loop, and ranking_ui stay private).

## Try it

```bash
git clone https://github.com/MatthewGRodriguez/grok-bot-living-ceo.git
cd grok-bot-living-ceo
python3 scripts/ceo-discord-notify.py test
```

Needs **Python 3** (notify) and **Node.js** (JFactor / `ceo_next`). No package install. There are no runtime dependencies.

Without a webhook the notify test fails cleanly: `ok false`, `error discord not configured`.

To actually post, set `DISCORD_WEBHOOK_URL` in the local environment, or put the URL in `secrets/discord_webhook.url` (gitignored). Never print or commit webhook URLs.

Then load the ranking engine:

```js
const exp6 = require('./vendor/exp6/JFactor_exp6.js');
```

Then read how modalities work: [`modalities/host/docs/HOW.md`](modalities/host/docs/HOW.md).

## What's here

- `scripts/ceo-discord-notify.py` — the one thing you can run after clone (webhook optional).
- `vendor/exp6/` — JFactor Exp6, the ranking engine. A Joy is a ranked stock, not currency. See [`vendor/exp6/README.md`](vendor/exp6/README.md).
- `modalities/` — bootstrap tree (`joy` → `host` → `data` / `research` / `crystallize` / `craft`) plus `ceo_next`.
- [`docs/exotelos.md`](docs/exotelos.md) — full Exotelos law (axes, origin, recursion, expansion / compression).
- [`docs/modalities.md`](docs/modalities.md) — bootstrap tree, jmethod, layer-local j.
- [`docs/living-core-features.md`](docs/living-core-features.md) — rank pipeline, explore / graduate / MCP tools (documented; the server is not here).
- [`docs/operate_ceo_grok_bot.md`](docs/operate_ceo_grok_bot.md) — operate law for this slice.

Secrets, webhooks, workbook / joy data, and local box paths are not in this repo. Sibling act-children that `ceo_next` scores (`ceo_mgmt_self`, `ceo_play_adonia`, `ceo_encode_priors`, `ceo_exo_gen`) live in living-core; here they fall back to a default score.

## Bootstrap modalities

A modality is a ranked child: MANIFEST + lambda + docs. Siblings sit in a JGroup. Best enters only the winner.

```
joy
 └── host            process kernel — this is the modality that explains modalities
      ├── data       durable store
      │    ├── pages
      │    ├── exports
      │    └── samples
      ├── research   densest findings
      ├── crystallize  hop0 digest
      └── craft      structured page author
```

Front door: [`modalities/README.md`](modalities/README.md). Then [`host/docs/HOW.md`](modalities/host/docs/HOW.md).

**research** writes attention-packed findings. **crystallize** compresses those tails into a short hop0 digest so context does not go flat. **craft** authors one small structured page when entered. **data** holds pages / exports / samples under bytes.

## Living-core features

```
sense → SimulatedBest → explore → Best(enter top) → sample → graduate?
```

j blends author prior with outcome samples. High j cannot force graduation. Explore writes candidates; nothing auto-installs. Invoke is separate from rank (prefer dry_run).

Full table of tools and the judge / revoke / densify law: [docs/living-core-features.md](docs/living-core-features.md).

## JFactor (Exp6)

JFactor is the ranking / optimization engine. Exp6 is this generation of it (`vendor/exp6/JFactor_exp6.js`).

A **Joy** is a named scalar stock the engine ranks and moves. Energy, attention, a calendar seat, a budget line — each can be a Joy. The engine's own comments use `money` as a *sample stock name*, the same way they use `energy`. That is an example identifier, not a claim that Joy means currency.

What the engine actually does:

- You register Joys (and relations) on a blueprint / world.
- Actions rotate an origin toward an interest and change those Joys over time.
- **Best** / **SimulatedBest** pick the next action by scoring Joys, not by a vibes paragraph.
- Frame/SLP, SIMD, and GPU kernels are how long plans evaluate without walking every leaf.

Living-core uses that so `ceo_next` is steered by SimulatedBest → Best.

```js
const exp6 = require('./vendor/exp6/JFactor_exp6.js');
```

`vendor/exp6/simulated_best.js` is living-core ranking glue. It requires a `modality` module that is not shipped here, so it will not load standalone. Use `JFactor_exp6.js` if you just want the engine.

```
vendor/exp6/JFactor_exp6.js     engine (this is the require target)
vendor/exp6/simulated_best.js   living-core glue — needs modality
vendor/exp6/tools/              wasm / worker runtimes
```

## Exotelos

An origin's **tertiary** interest in **exogenous intention** of **perpendicular interest** on a **separate grid**.

In future time the other origin must also develop their **independent** exotelos, separate from all current origins. Interest (primary / secondary) may change. Exotelos only exists in tertiary interest that does **not** affect primary or secondary. It may fade in time.

The artist's focus on oil painting (primary) and charcoal sketching (secondary) was entirely separate from her exotelos: a detached hope that a musician she admired would eventually explore merging classical composition with electronic beats.

That hope sits on another origin's grid. It does not steer her painting. If it fades, her primary and secondary are still intact.

**Endotelos** is the other move: new points on the *same* grid.

How the grid is drawn (short):

- One axis needs two opposites. A perpendicular axis needs two more, independent of the first.
- The **origin** sits at the center of those four opposites.
- Moving along an axis is a rotation around that origin. Alignment on one axis is a proportional change on the perpendicular.
- **Actions** take an origin toward an interest over time. Stronger alignment makes a small rotation cheaper; a large rotation costs more time.
- Recursing the other origin's exotelos is how time layers. Each recursion is an increase in time. Alignments may move; they stay in the frame of an exotelos until it fades.
- Axes can expand (origin → 2 core → 4 metaphysical → 8 physical) or compress the other way. Collapse is non-deterministic. Tertiary that was not on the collapsed axis can still exist: the exotelos.
- Unknown lasts beyond the axis currently known. Unknown is a catalyst for exotelos.

Full drawing, expansion / compression, actions, unknown, and a world-making seed: [docs/exotelos.md](docs/exotelos.md).

## ceo_next

`modalities/ceo_next/lambda/index.js` is a decision-node excerpt. `require` it and call `effectiveness({ simulated: true })` — that works. `work()` expects living-core `store/pages/` and sibling modalities that are not in this repo.

## Law

- Never invent joy values.
- Never auto-approve REVIEW.
- Never commit a webhook, `.env`, or `secrets/`.
- Explore = new exotelos layers + scoring models, not health checks.
- Quiet most minutes is the product.

## License

MIT. See [LICENSE](LICENSE).
