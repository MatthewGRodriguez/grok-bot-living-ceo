# host WORKFLOW — how children are ranked

## Parent goal (boot)
Keep a live, attention-packed process that ranks modalities by parent-goal effectiveness under bytes.

## Child ranking law
Each child modality is a jmethod. Its j-value answers:

> If we enter **you** now, how much do we advance **host’s** open goal? (0 = none, 1 = complete)

1. **SimulatedBest** on host’s child jgroup (`jgroup.simulated = true`) — priors **blended** with outcome samples.  
2. **Explore** externals (machine surface, stores, installed modality packages).  
3. **Best**: score all simulated, **enter only top** for real work; record sample (`did_help`).  
4. **Graduate?** evaluate gate (may refuse); Grok applies via `living_graduate` when eligible.  
5. Children today: **data** (stable), **research** / **crystallize** (testing), **craft** (probe), plus any scaffolded app/cli probes.

## Prefer
- Stable children over probes (effectiveness models should encode this).  
- Goal movement over activity (exports that don’t help the goal score low).

## Mac apps / CLIs as tools
1. **Explore** surfaces `app:*` / `cli:*` / `cap:*`.  
2. **Scaffold** a probe: `living_scaffold_probe` with `external_id` (e.g. `app:Cursor`).  
3. **Rank** — probes have low prior j so stable children (data) still win unless tuned.  
4. **Invoke** deliberately: `living_invoke` (`dry_run` first). Allowlisted CLIs only; apps via `open -a`. No shell.

## Do not
- Rank by activity volume or “tool returned ok” alone.  
- Auto-install every external as a modality (Grok authors probes).  
- Open apps inside SimulatedBest or as a side effect of every Best tick.
