# modality:host — execution environment

**Densest law:** you are on the computer-hosted process. All other modalities live under this root.

## What this modality is
- OS process, filesystem roots under policy, **bytes** budget, time, MCP port, I/O surfaces.
- Parent of the living jgroup of child modalities (starts with **data**).

## How modalities work (foundation)

### Separate
Children of a parent are **siblings** in a JGroup.  
**Best** picks one child jmethod by highest j-value ∈ [0,1] under the **parent goal**.

### Together
1. **Nested enter:** host → data → … (path deepens; hop0 always shows loop phase).  
2. **Pipeline:** one modality’s outputs feed another (declared edges; still scored by parent goal).

### Workflow
A workflow is not “run everything.” It is an ordered or Best-guided use of modalities  
**scored only by effectiveness of completing the parent modality’s goal.**

### Ranking pipeline (always)
```
sense → SimulatedBest → explore-externals → Best(enter top only)
  → record outcome sample → blend j next tick → graduate? (gate may refuse)
```

### Nested pipeline (host → data → children)
When densest **store debt** exists (samples over cap, missing exports_index, craft pages over soft-cap, debt-marked index), `data` effectiveness spikes so host Best enters **data**.  
If debt still holds after data work, host Best runs a **nested** `Best(data)` on `pages` / `exports` / `samples` (same localize law).

### Layer-local scores (0–1 per jgroup)
Each child first gets **j_raw** ∈ [0,1] (effectiveness + sample blend).  
Then the layer of **n** siblings is localized:

| field | formula | meaning |
|-------|---------|---------|
| `j_raw` | absolute | effectiveness under parent goal |
| `j_n` | `j_raw / n` | per-item scale (your /n idea) |
| `j_share` | `j_raw / sum` | competitive share (sums to 1) |
| `j` | `= j_share` | **primary** Best / parent_j / samples |

So scores stay 0–1 **and** stay comparable when a layer has 4 kids vs 40 probes.

### Outcome samples
After real Best, living-core appends a row to `store/pages/effectiveness_samples.jsonl`:
`{parent, child, goal, j, did_help, did, bytes_pressure}`.  
Next SimulatedBest/Best **blends** author prior with sample mean (help_rate nudge).  
Priors alone are not the long-term law.

### Parent-goal judge
After enter, `judge.judgeEnter` re-scores **did_help** from durable evidence (file exists, structure,
goal alignment) — not lambda `helped=true` alone. Sample j is softened when self-report disagrees.

### Graduation gate
`probe → testing → stable` only if docs complete, enough samples, mean_j/help_rate thresholds,
bytes pressure OK, and modality-friendly durable output exists.  
**High j alone cannot force promotion.** Use `living_graduate` (apply=true only when eligible).

### Revoke / noise
Probes/testing with enough no-help samples can be **revoked** (`living_revoke`).  
Revoked modalities leave the jgroup. `host` and `data` are protected.

### Densify
Explore appends EXTERNALS; rankCycle densifies when EXTERNALS > ~2.5KB.  
`living_densify` collapses unique ids under bytes (densest law).

### SimulatedBest (JFactor)
```
jgroup.simulated = true
jgroup.SimulatedBest()   // engine simulates regular joys automatically
```
JMethod signature: `(x, y, jX, jY, jgroup)`.  
If `jgroup.simulated`: **effectiveness only** (no world side effects).  
Else: full work + effectiveness. Always return j ∈ [0,1].

### Explore-externals
After SimulatedBest, before real Best: scan for factors that could become **new modalities**.  
Host surface includes:
- OS / arch / Node runtime / cwd / home / stores  
- **capabilities** (`cap:spawn`, `cap:open`, `cap:osascript`, …)  
- **allowlisted CLIs** (`cli:git`, `cli:open`, …)  
- **macOS apps** under `/Applications` and `~/Applications` (`app:Cursor`, …)

Write findings to EXTERNALS.md. **Nothing auto-installs.**  
Grok authors probes via `living_scaffold_probe` (external_id → `modalities/<id>/`).  
Intentional tool use (open app / run CLI) is `living_invoke` — separate from rank Best  
(probe lambdas **verify presence only** on real Best, so ranking does not surprise-open apps).

### Graduation
Probe → testing → stable only if outputs are modality-friendly, help the parent goal,  
are re-enterable from docs, and fit bytes.

## Roles
- **Grok:** outer author of modalities, docs, effectiveness, goals.  
- **Host:** Exp6 ranking + lifecycle + MCP; never pretends to invent goals alone.

## Exotelos
See `docs/EXOTELOS.md` · tertiary exogenous intention · [[exotelos_law]].
