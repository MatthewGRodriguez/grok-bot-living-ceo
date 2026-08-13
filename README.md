# living-ceo (Grok Bot harness)

A process kernel that runs **on** Grok Bot: explore while you are gone, rank what to do next, and only wake the phone when a new layer is real.

This is not a fork of Grok Bot. Chat stays in Grok Bot. Discoveries notify outbound (Discord). Money and approvals stay human.

## What it does

- **In-rank "what next?"** — `ceo_next` scores act-children (manage-self, encode, play, generate) so the idle loop is not a vibes paragraph.
- **Idle explore** — a standing Grok Bot routine wakes often; `sample-only` is a thrash brake *inside* a tick, not parking between discoveries.
- **Phone path** — Grok Bot chat does not reliably lock-screen. New exploration layers fingerprint-notify Discord, outbound only, and only for new-layer / REVIEW / infra-dead.
- **Laptop can sleep** — the box is source of truth; a Mac is an optional seat.

## Layout

```
modalities/ceo_next/   ranked CEO decision node
scripts/               Discord notify (DISCORD_WEBHOOK_URL)
docs/                  operate notes
```

## Setup

```bash
export DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/...'   # local only
python3 scripts/ceo-discord-notify.py test
```

Never commit the webhook. Never invent money. Never auto-approve REVIEW.

## Law

Explore = new layers + scoring models, not health checks.
Quiet most minutes is the product.

## Exp6

Optimization / ranking engine. `vendor/exp6/` is the bundled JFactor Exp6 (FastBest, Frame/SLP, SIMD, GPU kernels). Living-core uses it so **SimulatedBest → Best** can steer `ceo_next` instead of a prose "what next?".

```
vendor/exp6/JFactor_exp6.js     engine
vendor/exp6/simulated_best.js   living-core ranking glue
vendor/exp6/tools/              wasm / worker runtimes
```
