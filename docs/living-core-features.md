# Living-core features

This slice ships the bootstrap modalities and the ranking engine. The MCP server and hop0 runtime stay in private living-core. The features below are what those modalities are for.

## Rank pipeline

```
sense → SimulatedBest → explore-externals → Best(enter top only)
  → record outcome sample → blend j next tick → graduate?
```

- **j** = blend(author prior, outcome samples). Rank without rewriting priors is an echo chamber.
- **SimulatedBest** scores every child with `jgroup.simulated = true` (effectiveness only, no I/O).
- **Best** enters only the winner for real work.
- **Judge** re-scores `did_help` from durable evidence, not lambda self-report alone.
- **Graduation** (`probe → testing → stable`) can refuse even when j is high.
- **Revoke** drops noisy probes from the jgroup. `host` and `data` stay.
- **Densify** collapses EXTERNALS / research bloat under bytes.

Nested rank: `living_rank_cycle` with `parent: "data"` localizes pages / exports / samples the same way.

## Outcome samples

After real Best, a row lands in `store/pages/effectiveness_samples.jsonl`:

`{parent, child, goal, j, did_help, did, bytes_pressure}`

Next tick blends author prior with sample mean.

## Explore vs invoke

Explore writes candidate surfaces to EXTERNALS (`cap:*`, `cli:*`, `app:*`). Nothing auto-installs.

| Step | Tool | Effect |
|------|------|--------|
| Discover | `living_explore` | candidates |
| Author probe | `living_scaffold_probe` | writes `modalities/<id>/` (status `probe`) |
| Rank | `living_rank_cycle` | multi-child Best + sample |
| Samples | `living_samples` | outcome stats |
| Graduate | `living_graduate` | evaluate / apply status step |
| Revoke | `living_revoke` | noise control |
| Densify | `living_densify` | collapse bloat |
| Use tool | `living_invoke` | intentional open/CLI; prefer `dry_run` |

Probe Best verifies presence. It does not surprise-open apps.

## MCP tools (private kernel)

These are the living-core process hands. This repo does not run the server.

- `living_status` — process status + bytes
- `living_sense` — hop0 attention pack
- `living_simulated_best` — SimulatedBest
- `living_explore` — host surface
- `living_scaffold_probe` — author a probe package
- `living_invoke` — intentional tool use
- `living_samples` / `living_graduate` / `living_best` / `living_rank_cycle`
- `living_auto_tick` — bounded rank cycles
- `living_list_modalities` / `living_get_docs` / `living_reload`
- `living_capture` / `living_vault_export` / `living_perf`

## Roles

- **Outer author (Grok Bot):** writes modalities, docs, effectiveness, goals, exotelos.
- **Host:** Exp6 ranking + lifecycle + MCP. Does not invent goals alone.

## What is not here

The hop0 runtime, MCP server, lore CLI, idle explore loop, and ranking_ui stay private. Lambdas in this slice that write `store/pages/` expect that kernel.
