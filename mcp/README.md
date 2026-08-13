# living-core MCP

Treat **`living-core/` as project root**. MCP servers live here.

## Servers

| Entry | Transport | Use |
|-------|-----------|-----|
| `mcp/stdio.js` | stdio (JSON-RPC + Content-Length) | Grok Build / Cursor (spawned process) |
| `mcp/http.js` | HTTP POST `/mcp` | curl, remote clients (`LIVING_MCP_PORT`, default 3850) |

## Configure when living-core is cwd

### Grok Build — `.grok/config.toml`

```toml
[mcp_servers.living]
command = "node"
args = ["mcp/stdio.js"]
enabled = true
```

### Cursor — `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "living": {
      "command": "node",
      "args": ["mcp/stdio.js"]
    }
  }
}
```

## Tools

- `living_status` — process status + bytes
- `living_sense` — hop0 attention pack
- `living_simulated_best` — `jgroup.simulated=true` + SimulatedBest
- `living_explore` — host surface: OS, caps, CLIs, /Applications apps
- `living_scaffold_probe` — author probe package from `app:` / `cli:` external
- `living_invoke` — intentional open app / allowlisted CLI (prefer `dry_run`)
- `living_resolve_external` — resolve external id → path/kind
- `living_samples` — outcome samples / effectiveness stats
- `living_graduate` — graduation gate (evaluate or apply)
- `living_best` — real Best
- `living_rank_cycle` — full pipeline (`thorough` for denser explore)
- `living_auto_tick` — bounded opt-in rank cycles
- `living_vault_export` — densest pages → `store/vault`
- `living_perf` — P12/P20 last timing + hw/accel (read-only; optional bench)
- `living_capture` — P28 densest one-line capture → captures_tail
- `living_list_modalities` / `living_get_docs` / `living_reload`

## Run

```bash
# from living-core/
node mcp/stdio.js          # stdio (for MCP hosts)
node mcp/http.js           # http://127.0.0.1:3850
npm run mcp                # same as http
npm run mcp:stdio          # stdio entry
```
