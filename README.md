# living-ceo (Grok Bot harness)

Public slice of a process kernel that runs **on** Grok Bot: explore while you are gone, rank what to do next, and only wake the phone when a new layer is real.

This is **not** a fork of Grok Bot and **not** the full living-core runtime. Chat stays in Grok Bot. Discoveries notify outbound (Discord). Money and approvals stay human.

## What this repo is

- `scripts/ceo-discord-notify.py` — the one thing you can run after clone (webhook optional).
- `vendor/exp6/` — bundled JFactor Exp6 ranking engine (FastBest, Frame/SLP, SIMD, GPU kernels).
- `modalities/ceo_next/` — excerpt of the ranked "what next?" decision node. Not a full runtime.
- `docs/operate_ceo_grok_bot.md` — laws and operate notes for **this** slice.

## What this repo is not

- The private living-core kernel (MCP, lore CLI, idle explore loop, ranking_ui).
- Secrets, webhooks, workbook / money data, or local box paths.
- Sibling act-children (`ceo_mgmt_self`, `ceo_play_adonia`, `ceo_encode_priors`, `ceo_exo_gen`) that `ceo_next` scores. They live in living-core; here they fall back to a default score.

## Clone and requirements

Clone this repository, then work from the repo root.

```bash
git clone https://github.com/MatthewGRodriguez/grok-bot-living-ceo.git
cd grok-bot-living-ceo
```

Needs **Python 3** (notify script) and **Node.js** (Exp6 / `ceo_next`).
No package install step. There are no runtime dependencies.

## Run the notify test

Without a webhook this is supposed to fail cleanly:

```bash
python3 scripts/ceo-discord-notify.py test
```

Expected when unset: ok false, error discord not configured.

To actually post, set DISCORD_WEBHOOK_URL in the local environment, or put the URL in secrets/discord_webhook.url (gitignored). Never print or commit webhook URLs.

## Exp6

Optimization / ranking engine. Living-core uses it so SimulatedBest can steer ceo_next instead of a prose "what next?".

Load the engine:

```js
const exp6 = require('./vendor/exp6/JFactor_exp6.js');
```

Or run the tiny example:

```bash
node examples/require-exp6.js
```

`vendor/exp6/simulated_best.js` is living-core ranking glue. It requires a `modality` module that is not shipped here, so it will not load standalone. Use `JFactor_exp6.js` if you just want the engine.

```
vendor/exp6/JFactor_exp6.js     engine (this is the require target)
vendor/exp6/simulated_best.js   living-core glue — needs modality
vendor/exp6/tools/              wasm / worker runtimes
```

## ceo_next

`modalities/ceo_next/lambda/index.js` is a decision-node excerpt. `require` it and call `effectiveness({ simulated: true })` — that works. `work()` expects living-core `store/pages/` and sibling modalities that are not in this repo.

## Law

- Never invent money.
- Never auto-approve REVIEW.
- Never commit a webhook, .env, or secrets/.
- Explore = new layers + scoring models, not health checks.
- Quiet most minutes is the product.

## License

MIT. See [LICENSE](LICENSE).
