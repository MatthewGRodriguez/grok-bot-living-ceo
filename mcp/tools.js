/**
 * Living-core MCP tool catalog + dispatch (root of living-core).
 */
'use strict';

var path = require('path');

var rootDir = path.join(__dirname, '..');
var rt = null;
var createRuntime = null;

function clearSrcCache() {
  var srcDir = path.resolve(rootDir, 'src');
  var modDir = path.resolve(rootDir, 'modalities');
  Object.keys(require.cache).forEach(function (key) {
    var k = path.resolve(key);
    if (
      k.indexOf(srcDir + path.sep) === 0 ||
      k.indexOf(modDir + path.sep) === 0 ||
      k === srcDir ||
      k === modDir ||
      /living-core[\\/]src[\\/]/.test(k) ||
      /living-core[\\/]modalities[\\/]/.test(k)
    ) {
      delete require.cache[key];
    }
  });
}

function runtime() {
  if (!rt) {
    // Lazy-load Exp6 + runtime only when a tool runs (fast MCP initialize)
    createRuntime = require('../src/runtime').createRuntime;
    rt = createRuntime({ rootDir: rootDir });
  }
  return rt;
}

/** Drop cached runtime + re-require src (picks up code changes without MCP process restart). */
function hardReload() {
  rt = null;
  createRuntime = null;
  clearSrcCache();
  var r = runtime();
  var st = r.status();
  return {
    ok: true,
    hard: true,
    modalities: st.modalities || r.listModalities().map(function (m) { return m.id; }),
    note: 'Runtime recreated; src + modality require cache cleared'
  };
}

/**
 * P46/P61 A4: progressive disclosure densest (Anthropic skills≠MCP law).
 * MCP = hands (connectivity). Skills = procedure/judgment (Grok SKILL + living_skill).
 * tools/list default = **core** operate set (fast init · low context) — not all 26 tools.
 * LIVING_MCP_LIST=dense|full expands catalog. living_tool_help get = schema JIT.
 */
var TOOL_GROUPS = {
  // P61: densest operate hands — rankCycle covers sense→Best; skill packages = procedure
  core: [
    'living_tool_help',
    'living_sense',
    'living_rank_cycle',
    'living_status',
    'living_skill',
    'living_token_view',
    'living_reload',
    'living_capture',
    'living_jfactor_lab',
    'living_exotelos'
  ],
  loop: [
    'living_sense',
    'living_simulated_best',
    'living_explore',
    'living_best',
    'living_rank_cycle',
    'living_auto_tick',
    'living_status'
  ],
  surface: [
    'living_invoke',
    'living_resolve_external',
    'living_scaffold_probe',
    'living_explore'
  ],
  store: [
    'living_samples',
    'living_token_view',
    'living_vault_export',
    'living_capture',
    'living_densify',
    'living_get_docs',
    'living_reload'
  ],
  ranking: ['living_ranking'],
  skills: ['living_skill'],
  lifecycle: ['living_graduate', 'living_revoke', 'living_audit'],
  meta: ['living_tool_help', 'living_perf', 'living_lore', 'living_status']
};

/** MCP tool schemas (name, description, inputSchema) — full SoT for living_tool_help. */
var TOOL_DEFS = [
  {
    name: 'living_tool_help',
    description: 'P46 progressive tools: action=list|groups|get|core|measure. Catalog densest; get=full schema JIT.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'list|groups|get|core|measure (default list)'
        },
        name: { type: 'string', description: 'tool name for get' },
        group: { type: 'string', description: 'filter list by group' }
      }
    }
  },
  {
    name: 'living_status',
    description: 'Status: modalities, loop, bytes, last Best.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'living_sense',
    description: 'Densest hop0 for modality (default host).',
    inputSchema: {
      type: 'object',
      properties: {
        modality: { type: 'string', description: 'host|data|…' }
      }
    }
  },
  {
    name: 'living_simulated_best',
    description: 'SimulatedBest: no side effects; effectiveness only.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: { type: 'string', description: 'default host' }
      }
    }
  },
  {
    name: 'living_explore',
    description: 'Explore host surface (apps/CLIs). No auto-install.',
    inputSchema: {
      type: 'object',
      properties: {
        modality: { type: 'string' }
      }
    }
  },
  {
    name: 'living_scaffold_probe',
    description: 'Author probe modality from app:/cli:. No open.',
    inputSchema: {
      type: 'object',
      properties: {
        external_id: { type: 'string', description: 'app:Name|cli:name' },
        id: { type: 'string', description: 'optional modality id' },
        parent_id: { type: 'string', description: 'default host' },
        force: { type: 'boolean', description: 'overwrite' }
      },
      required: ['external_id']
    }
  },
  {
    name: 'living_invoke',
    description:
      'Intentional Mac open/CLI (no shell). Prefer dry_run. ' +
      'Moho Pro: NEVER open -a (untitled+docs crash windowDidMove). ' +
      'action=design|animate|scaffold|lua|preview|render only.',
    inputSchema: {
      type: 'object',
      properties: {
        external_id: { type: 'string', description: 'app:Name|cli:name' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Moho lua: [project.moho,] script.lua · open: ignore docs (stripped)'
        },
        action: {
          type: 'string',
          description:
            'Moho: lua|scaffold|animate|preview|render · bare open=app only'
        },
        dry_run: { type: 'boolean', description: 'command only' },
        timeout_ms: { type: 'number', description: 'default 8000 · Moho lua default 120000' },
        stdin: { type: 'string', description: 'CLI stdin ≤64KB' }
      },
      required: ['external_id']
    }
  },
  {
    name: 'living_resolve_external',
    description: 'Resolve app:/cli: → path/kind.',
    inputSchema: {
      type: 'object',
      properties: {
        external_id: { type: 'string' }
      },
      required: ['external_id']
    }
  },
  {
    name: 'living_best',
    description: 'Real Best() with side effects.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: { type: 'string' }
      }
    }
  },
  {
    name: 'living_rank_cycle',
    description: 'sense→sim→explore→Best. Prefer one-shot. thorough=denser explore.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: { type: 'string' },
        thorough: { type: 'boolean', description: 'fresher explore' }
      }
    }
  },
  {
    name: 'living_auto_tick',
    description: 'Bounded rankCycle×N (cap 12). Stops on no_help streak.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: { type: 'string', description: 'default host' },
        max_cycles: { type: 'number', description: 'default 3 max 12' },
        stop_no_help_streak: { type: 'number', description: 'default 2' },
        thorough: { type: 'boolean', description: 'first cycle denser' },
        thorough_every: { type: 'boolean', description: 'every cycle denser' }
      }
    }
  },
  {
    name: 'living_vault_export',
    description: 'Export densest pages → store/vault (no Obsidian open).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'living_capture',
    description: 'One-line capture → captures_tail. hop0 last_capture=.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'max 500' },
        kind: { type: 'string', description: 'capture|idea|signal|link' }
      },
      required: ['text']
    }
  },
  {
    name: 'living_jfactor_lab',
    description:
      'JFactor Lab densest: status|prepare|seed|harness|arxiv_open. prepare=pack zip; harness=open grok+HARNESS seeds; arxiv_open=prepare+browser submit (human auth). dry_run default for open.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'status|prepare|seed|harness|arxiv_open'
        },
        dry_run: {
          type: 'boolean',
          description: 'true=plan only for harness/arxiv (default)'
        },
        apply: {
          type: 'boolean',
          description: 'true=actually open Terminal/browser'
        },
        lab_root: {
          type: 'string',
          description: 'optional override path to jfactor-lab'
        },
        prepare: {
          type: 'boolean',
          description: 'arxiv_open: run pack first (default true)'
        },
        extra: {
          type: 'string',
          description: 'extra seed text for harness'
        }
      }
    }
  },
  {
    name: 'living_exotelos',
    description:
      'Exotelos densest: status|law|list|get|validate|live|bonds|bonds_get|expand|compress|temporal|bond|world_list|world_get. Modality bonds feed soft rank. Fiction pantheon demo separate.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description:
            'status|law|list|get|validate|live|bonds|bonds_get|expand|compress|temporal|bond|world_list|world_get'
        },
        id: { type: 'string', description: 'modality id' },
        origin: { type: 'string', description: 'alias of id' },
        name: { type: 'string', description: 'world file for world_get' },
        depth: { type: 'number', description: 'expand depth 1–3' },
        open_goal: {
          type: 'string',
          description: 'optional goal text for live overlap'
        },
        a: { type: 'string', description: 'bond from origin' },
        b: { type: 'string', description: 'bond to origin' },
        fear: { type: 'string' },
        role: { type: 'string' },
        covenant: { type: 'string' },
        incantatory: { type: 'string' }
      }
    }
  },
  {
    name: 'living_lore',
    description: 'Lore VCS densest: info|status|stage|commit|submit|… hop0 last_lore=.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'info|status|stage|commit|submit|…' },
        message: { type: 'string', description: 'commit msg' },
        scan: { type: 'boolean', description: 'fs scan' },
        revision_only: { type: 'boolean', description: 'cheap status' },
        push: { type: 'boolean', description: 'submit push' },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'stage paths'
        }
      }
    }
  },
  {
    name: 'living_ranking',
    description: 'Optional review/approve path (not shipped in this slice). Never invent joy values.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'status|list|review|approve|discover|export_ics|import_ics|quick_add|free_busy|write_joy|…'
        },
        ranking_root: {
          type: 'string',
          description: 'optional path to review_sot html root (default REVIEW_SOT_ROOT or sibling legacy/legacy/html)'
        },
        id: { type: 'string', description: 'joy or view id' },
        title: { type: 'string' },
        polarity: {
          type: 'string',
          description: 'cost | produce | neutral (for write_joy)'
        },
        relates_to: {
          type: 'array',
          items: { type: 'string' },
          description: 'related joy ids'
        },
        jmethod_js: {
          type: 'string',
          description: 'full jmethod.js source for write_joy'
        },
        how: { type: 'string', description: 'HOW.md body' },
        research: { type: 'string' },
        body: { type: 'string', description: 'view markdown/html body or asset content' },
        path: {
          type: 'string',
          description: 'relative path under review_sot for write_asset (vendor/|joys/|views/)'
        },
        force: { type: 'boolean', description: 'overwrite existing' },
        status: { type: 'string', description: 'probe|testing|stable' },
        amountMonthly: { type: 'number', description: 'for write_action: monthly $ amount' },
        amount: { type: 'number' },
        cadence: { type: 'string', description: 'daily|weekly|monthly|yearly|always|every_n_days' },
        hours: { type: 'array', items: { type: 'number' } },
        days: { type: 'array', items: { type: 'number' }, description: 'weekday 0=Sun..6=Sat' },
        note: { type: 'string' },
        kind: { type: 'string', description: 'custom|work|living|joy|action for propose' },
        propose: { type: 'boolean', description: 'if true, queue proposal instead of writing SoT (review gate)' },
        workbook: { type: 'object', description: 'optional live workbook summary for review' },
        clear_pending: { type: 'boolean' },
        decisions: { type: 'object', description: 'map review item key → accept|reject for apply_decisions' },
        apply: {
          type: 'boolean',
          description: 'import_ics/quick_add: write calendar_actions · discover: queue proposals (default true)'
        },
        dry_run: {
          type: 'boolean',
          description: 'discover: candidates only, no pending queue'
        },
        refresh: {
          type: 'boolean',
          description: 'discover: replace same-id pending proposals'
        },
        text: {
          type: 'string',
          description: 'import_ics ICS body · quick_add line e.g. Focus weekdays 10'
        },
        line: { type: 'string', description: 'quick_add alias for text' },
        format: { type: 'string', description: 'list format toon|json' },
        dow: { type: 'number', description: 'free_busy weekday 0=Sun..6=Sat' },
        mode: { type: 'string', description: 'free_busy: day|week|vfb' },
        date: { type: 'string', description: 'free_busy optional YYYY-MM-DD' }
      }
    }
  },
  {
    name: 'living_perf',
    description: 'Perf densest: last rankCycle ms, free_gb, accel. bench=true optional.',
    inputSchema: {
      type: 'object',
      properties: {
        history_n: { type: 'number', description: 'default 6 max 16' },
        bench: { type: 'boolean', description: 'Exp6 scoreBatch' },
        bench_n: { type: 'number', description: 'default 128' },
        force_probe: { type: 'boolean', description: 'bypass accel cache' }
      }
    }
  },
  {
    name: 'living_list_modalities',
    description: 'List modalities (id, parent, status, last_j).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'living_get_docs',
    description: 'Read modality docs quartet.',
    inputSchema: {
      type: 'object',
      properties: {
        modality: { type: 'string' }
      },
      required: ['modality']
    }
  },
  {
    name: 'living_reload',
    description: 'Reload modalities from disk (hard recreate).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'living_samples',
    description: 'Outcome samples / stats. format=toon|json pack.',
    inputSchema: {
      type: 'object',
      properties: {
        modality: { type: 'string', description: 'stats for id' },
        recent_n: { type: 'number', description: 'default 10' },
        format: { type: 'string', description: 'toon|json|json_pretty' }
      }
    }
  },
  {
    name: 'living_skill',
    description: 'Skill packages JIT: list|get id=research__wrote.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'list|get|id' },
        id: { type: 'string', description: 'package id' },
        child: { type: 'string' },
        did_prefix: { type: 'string' }
      }
    }
  },
  {
    name: 'living_token_view',
    description:
      'Token dual boundary: pack/status/cold/purge/handoff. kind=edges|actions|joys|invoke. handoff modality=here parent-local (P58).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'status|pack|compare|handoff|hide|cold_*|purge_noise|archive_thrash'
        },
        format: { type: 'string', description: 'toon|json' },
        recent_n: { type: 'number' },
        name: { type: 'string' },
        kind: { type: 'string', description: 'edges|actions|joys|invoke' },
        id: { type: 'string' },
        apply_trim: { type: 'boolean' },
        cap: { type: 'number' },
        modality: {
          type: 'string',
          description: 'P58 handoff here= parent (host|data|research|…)'
        },
        here: { type: 'string', description: 'alias modality for handoff' },
        parent: { type: 'string', description: 'alias modality for handoff' }
      }
    }
  },
  {
    name: 'living_graduate',
    description: 'Graduate probe→testing→stable. apply=true writes MANIFEST.',
    inputSchema: {
      type: 'object',
      properties: {
        modality: { type: 'string' },
        apply: { type: 'boolean' }
      }
    }
  },
  {
    name: 'living_revoke',
    description: 'Revoke dead probes. host+data protected.',
    inputSchema: {
      type: 'object',
      properties: {
        modality: { type: 'string' },
        apply: { type: 'boolean' }
      }
    }
  },
  {
    name: 'living_audit',
    description: 'Lifecycle audit densest.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'living_densify',
    description: 'Densify EXTERNALS/RESEARCH under bytes.',
    inputSchema: {
      type: 'object',
      properties: {
        modality: { type: 'string' },
        dry_run: { type: 'boolean' },
        force: { type: 'boolean' }
      }
    }
  }
];

function groupOf(toolName) {
  var g;
  for (g in TOOL_GROUPS) {
    if (Object.prototype.hasOwnProperty.call(TOOL_GROUPS, g) && TOOL_GROUPS[g].indexOf(toolName) >= 0) {
      return g;
    }
  }
  return 'other';
}

/** Strip prop descriptions for dense tools/list (names + types remain). */
function densifyInputSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
  var out = {
    type: schema.type || 'object',
    properties: {}
  };
  if (schema.required) out.required = schema.required;
  var props = schema.properties || {};
  Object.keys(props).forEach(function (k) {
    var p = props[k] || {};
    var slim = { type: p.type };
    if (p.items) slim.items = p.items.type ? { type: p.items.type } : p.items;
    if (p.enum) slim.enum = p.enum;
    out.properties[k] = slim;
  });
  return out;
}

function densestToolDefs() {
  return TOOL_DEFS.map(function (t) {
    return {
      name: t.name,
      description: String(t.description || '').slice(0, 96),
      inputSchema: densifyInputSchema(t.inputSchema)
    };
  });
}

/**
 * tools/list payload.
 * P61 default **core** (Anthropic progressive disclosure — MCP hands densest).
 * LIVING_MCP_LIST=dense → all tools short schemas
 * LIVING_MCP_LIST=full → verbose schemas
 */
function listToolsForMcp() {
  var mode = String(process.env.LIVING_MCP_LIST || 'core').toLowerCase();
  if (mode === 'full' || mode === 'verbose') return TOOL_DEFS.slice();
  if (mode === 'dense' || mode === 'all') return densestToolDefs();
  // core (default)
  var coreSet = TOOL_GROUPS.core || [];
  var byName = Object.create(null);
  TOOL_DEFS.forEach(function (t) {
    byName[t.name] = t;
  });
  return coreSet
    .map(function (name) {
      var t = byName[name];
      if (!t) return null;
      return {
        name: t.name,
        description: String(t.description || '').slice(0, 96),
        inputSchema: densifyInputSchema(t.inputSchema)
      };
    })
    .filter(Boolean);
}

function measureToolList() {
  var full = JSON.stringify(TOOL_DEFS);
  var dense = JSON.stringify(densestToolDefs());
  var prev = process.env.LIVING_MCP_LIST;
  process.env.LIVING_MCP_LIST = 'core';
  var core = JSON.stringify(listToolsForMcp());
  if (prev == null) delete process.env.LIVING_MCP_LIST;
  else process.env.LIVING_MCP_LIST = prev;
  return {
    ok: true,
    n: TOOL_DEFS.length,
    n_core: TOOL_GROUPS.core.length,
    full_chars: full.length,
    dense_chars: dense.length,
    core_chars: core.length,
    save_vs_full_dense: full.length
      ? Math.round((1 - dense.length / full.length) * 1000) / 1000
      : 0,
    save_vs_full_core: full.length
      ? Math.round((1 - core.length / full.length) * 1000) / 1000
      : 0,
    full_tok_est: Math.ceil(full.length / 4),
    dense_tok_est: Math.ceil(dense.length / 4),
    core_tok_est: Math.ceil(core.length / 4),
    mode_default: 'core',
    law:
      'P61 tools/list=core · MCP hands densest · skills=procedure · LIVING_MCP_LIST=dense|full · tool_help get JIT'
  };
}

function toolHelp(opts) {
  opts = opts || {};
  var action = String(opts.action || opts.op || 'list').toLowerCase();
  if (action === 'measure' || action === 'compare') {
    return measureToolList();
  }
  if (action === 'groups' || action === 'group') {
    var groups = {};
    Object.keys(TOOL_GROUPS).forEach(function (g) {
      groups[g] = TOOL_GROUPS[g].slice();
    });
    return {
      ok: true,
      groups: groups,
      core: TOOL_GROUPS.core.slice(),
      law: 'prefer core tools; get full schema via living_tool_help get'
    };
  }
  if (action === 'core') {
    return {
      ok: true,
      core: TOOL_GROUPS.core.slice(),
      note: 'prefer living_rank_cycle for one-shot; living_tool_help get for schema'
    };
  }
  if (action === 'get' || action === 'schema' || action === 'full') {
    var name = opts.name || opts.tool || opts.id;
    if (!name) return { ok: false, error: 'name required', actions: ['list', 'get', 'groups', 'core', 'measure'] };
    var def = TOOL_DEFS.filter(function (t) {
      return t.name === name;
    })[0];
    if (!def) {
      return {
        ok: false,
        error: 'unknown_tool',
        name: name,
        names: TOOL_DEFS.map(function (t) {
          return t.name;
        })
      };
    }
    return {
      ok: true,
      name: def.name,
      group: groupOf(def.name),
      description: def.description,
      inputSchema: def.inputSchema,
      densest: false,
      law: 'full schema JIT'
    };
  }
  // list densest catalog
  var rows = TOOL_DEFS.map(function (t) {
    return {
      name: t.name,
      group: groupOf(t.name),
      desc: String(t.description || '').slice(0, 72)
    };
  });
  if (opts.group) {
    rows = rows.filter(function (r) {
      return r.group === opts.group;
    });
  }
  return {
    ok: true,
    n: rows.length,
    tools: rows,
    core: TOOL_GROUPS.core.slice(),
    measure: measureToolList(),
    law: 'catalog densest · get name= for full inputSchema'
  };
}

function dispatch(name, args) {
  args = args || {};
  if (name === 'living_tool_help') {
    return toolHelp(args);
  }
  var r = runtime();
  switch (name) {
    case 'living_status':
      return r.status();
    case 'living_sense':
      return r.sense(args.modality);
    case 'living_simulated_best':
      return r.simulatedBest(args.parent);
    case 'living_explore':
      return r.explore(args.modality);
    case 'living_scaffold_probe':
      return r.scaffoldProbe({
        external_id: args.external_id,
        id: args.id,
        parent_id: args.parent_id,
        force: args.force
      });
    case 'living_invoke':
      return r.invoke({
        external_id: args.external_id,
        args: args.args,
        action: args.action,
        dry_run: args.dry_run,
        timeout_ms: args.timeout_ms,
        stdin: args.stdin
      });
    case 'living_resolve_external':
      return r.resolveExternal(args.external_id);
    case 'living_best':
      return r.best(args.parent);
    case 'living_rank_cycle':
      return r.rankCycle({
        parent: args.parent,
        thorough: !!args.thorough
      });
    case 'living_auto_tick':
      return r.autoTick({
        parent: args.parent,
        max_cycles: args.max_cycles,
        stop_no_help_streak: args.stop_no_help_streak,
        thorough: !!args.thorough,
        thorough_every: !!args.thorough_every
      });
    case 'living_vault_export':
      return r.exportVault({});
    case 'living_capture':
      return r.capture({ text: args.text, kind: args.kind });
    case 'living_jfactor_lab': {
      var jfl = require('../src/jfactor_lab_ops');
      return jfl.dispatch({
        action: args.action || 'status',
        dry_run: args.dry_run,
        apply: args.apply,
        lab_root: args.lab_root,
        prepare: args.prepare,
        extra: args.extra
      });
    }
    case 'living_exotelos': {
      var exoOps = require('../src/exotelos_ops');
      return exoOps.dispatch(rootDir, {
        action: args.action || 'status',
        id: args.id || args.origin,
        origin: args.origin,
        name: args.name || args.id,
        depth: args.depth,
        open_goal: args.open_goal,
        a: args.a,
        b: args.b,
        fear: args.fear,
        role: args.role,
        covenant: args.covenant,
        incantatory: args.incantatory
      });
    }
    case 'living_lore':
      return r.livingLore({
        action: args.action,
        message: args.message,
        scan: args.scan,
        revision_only: args.revision_only,
        push: args.push,
        paths: args.paths
      });
    case 'living_ranking':
      return r.livingRanking({
        action: args.action,
        ranking_root: args.ranking_root,
        id: args.id,
        title: args.title,
        polarity: args.polarity,
        relates_to: args.relates_to,
        jmethod_js: args.jmethod_js,
        how: args.how,
        research: args.research,
        body: args.body,
        path: args.path,
        force: args.force,
        status: args.status,
        amountMonthly: args.amountMonthly,
        amount: args.amount,
        cadence: args.cadence,
        hours: args.hours,
        days: args.days,
        note: args.note,
        kind: args.kind,
        name: args.name || args.title,
        propose: args.propose,
        workbook: args.workbook,
        clear_pending: args.clear_pending,
        payload: args.payload,
        decisions: args.decisions,
        format: args.format,
        apply: args.apply,
        text: args.text || args.line,
        line: args.line,
        file: args.file,
        calname: args.calname,
        dow: args.dow,
        mode: args.mode,
        date: args.date,
        view: args.view,
        dry_run: args.dry_run,
        refresh: args.refresh
      });
    case 'living_perf':
      return r.livingPerf({
        history_n: args.history_n,
        bench: !!args.bench,
        bench_n: args.bench_n,
        force_probe: !!args.force_probe
      });
    case 'living_list_modalities':
      return { ok: true, modalities: r.listModalities() };
    case 'living_get_docs':
      return r.getDocs(args.modality);
    case 'living_reload':
      // Hard recreate so roadmap/code changes land without full MCP process restart
      return hardReload();
    case 'living_samples':
      if (args.modality) {
        return r.samplesStats(args.modality);
      }
      if (args.format) {
        var recentRows = r.samplesRecent(args.recent_n || 10).samples || [];
        var slim = recentRows.map(function (row) {
          return {
            at: row.at,
            parent: row.parent,
            child: row.child,
            j: row.j,
            help: row.did_help ? 1 : 0,
            status: row.status
          };
        });
        return r.tokenView({
          action: 'pack',
          rows: slim,
          format: args.format,
          name: 'samples'
        });
      }
      return {
        ok: true,
        recent: r.samplesRecent(args.recent_n || 10).samples,
        stats: r.samplesStats().by_modality
      };
    case 'living_skill':
      return r.livingSkill({
        action: args.action || 'list',
        id: args.id,
        child: args.child,
        did_prefix: args.did_prefix || args.did
      });
    case 'living_token_view':
      return r.tokenView({
        action: args.action || 'status',
        format: args.format,
        recent_n: args.recent_n,
        id: args.id,
        file: args.file,
        name: args.name,
        kind: args.kind,
        apply_trim: args.apply_trim,
        cap: args.cap,
        rows: args.rows,
        modality: args.modality,
        here: args.here,
        parent: args.parent
      });
    case 'living_graduate':
      return r.graduate(args.modality, !!args.apply);
    case 'living_revoke':
      return r.revoke(args.modality, !!args.apply);
    case 'living_audit':
      return r.audit();
    case 'living_densify':
      return r.densifyDocs({
        modality: args.modality,
        dry_run: args.dry_run,
        force: args.force
      });
    default:
      throw new Error('unknown tool: ' + name);
  }
}

function hasTool(name) {
  return TOOL_DEFS.some(function (t) { return t.name === name; });
}

module.exports = {
  TOOL_DEFS: TOOL_DEFS,
  TOOL_GROUPS: TOOL_GROUPS,
  listToolsForMcp: listToolsForMcp,
  densestToolDefs: densestToolDefs,
  toolHelp: toolHelp,
  measureToolList: measureToolList,
  dispatch: dispatch,
  hasTool: hasTool,
  runtime: runtime,
  hardReload: hardReload,
  rootDir: rootDir
};
