/**
 * Moho.app Pro command-line / Lua bridge (living-core densest).
 *
 * Crash law (2026-08-05, two crashes same stack):
 *   open -a Moho <any document> → AE open docs → OnFileOpen / window layout
 *   → -[LMi_ContentView windowDidMove:] nil  (EXC_BAD_ACCESS)
 *   Seen with SVG and with CLI-scaffolded .moho under macOS 27 beta
 *   WindowManagement applyAgentPropertySnapshot / tiling.
 *
 * FAIL-CLOSED for Launch Services document open:
 *   open -a Moho  → app only, NEVER pass file args.
 *   User File→Open in GUI, or use Pro CLI below.
 *
 * Pro CLI (verified 2026-08-05 Moho 14.3 Pro ARM — reliable):
 *   /Applications/Moho.app/Contents/MacOS/Moho script.lua
 *   /Applications/Moho.app/Contents/MacOS/Moho file.moho script.lua
 *   /Applications/Moho.app/Contents/MacOS/Moho -render file.moho
 *   Entry: function MohoScript(moho) ... end
 *   Do NOT use --console/--verbose before script (hang risk).
 *   Prefer io.stderr:write for logs.
 *   FileNew/CreateNewLayer/FileSaveAs/Quit works ~8s → real .moho zip.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var { execFileSync, spawnSync } = require('child_process');

var MOHO_APP = '/Applications/Moho.app';
var MOHO_BIN = path.join(MOHO_APP, 'Contents', 'MacOS', 'Moho');

var OPEN_SAFE_EXT = /\.(moho|anme|mohoproj|anime|animeproj)$/i;
var LUA_EXT = /\.lua$/i;

function isMohoExternal(resolved) {
  if (!resolved) return false;
  if (resolved.id === 'app:Moho') return true;
  if (resolved.name === 'Moho') return true;
  if (resolved.path && /Moho\.app$/i.test(String(resolved.path))) return true;
  return false;
}

/**
 * open -a Moho must NEVER receive document paths on this host.
 * Even native .moho triggers windowDidMove SIGSEGV via AE open docs + tiling.
 */
function sanitizeOpenArgs(args) {
  var list = Array.isArray(args) ? args.map(String) : [];
  var stripped = list.slice();
  var note =
    'Moho crash guard (14.3 + macOS WindowManagement): ' +
    'open -a Moho never opens documents (SVG or .moho). ' +
    'Use bare open, then File→Open in GUI; or action=lua / action=scaffold (Pro CLI).';
  if (stripped.length) {
    note +=
      ' Stripped: ' +
      stripped
        .map(function (s) {
          return path.basename(s);
        })
        .join(', ');
  }
  return { args: [], stripped: stripped, note: note };
}

function mohoBinary() {
  if (fs.existsSync(MOHO_BIN)) return MOHO_BIN;
  return null;
}

function mohoAppExists() {
  return fs.existsSync(MOHO_APP);
}

/**
 * Run Moho Pro CLI: binary [optional.moho] script.lua
 * Never prepend --console/--verbose (hang risk on some builds).
 */
function runLua(opts) {
  opts = opts || {};
  var bin = mohoBinary();
  if (!bin) {
    return { ok: false, error: 'moho_binary_missing', path: MOHO_BIN };
  }
  var script = opts.script && path.resolve(String(opts.script));
  if (!script || !fs.existsSync(script)) {
    return { ok: false, error: 'lua_script_missing', script: script };
  }
  if (!LUA_EXT.test(script)) {
    return { ok: false, error: 'not_lua', script: script };
  }
  // Verified: CLI does NOT auto-load argv .moho into moho.document.
  // Scripts must moho:FileOpen(path). We pass path via MOHO_LIVING_PROJECT.
  var proj = null;
  if (opts.project) {
    proj = path.resolve(String(opts.project));
    if (!fs.existsSync(proj)) {
      return { ok: false, error: 'project_missing', project: proj };
    }
    if (!OPEN_SAFE_EXT.test(proj)) {
      return { ok: false, error: 'project_not_moho', project: proj };
    }
  }
  var argv = [script];

  if (opts.dry_run) {
    return {
      ok: true,
      dry_run: true,
      kind: 'moho_cli',
      command: bin,
      args: argv,
      env_project: proj,
      law: 'Moho Pro CLI MohoScript — FileOpen via MOHO_LIVING_PROJECT; no open -a docs'
    };
  }

  var timeout = opts.timeout_ms != null ? opts.timeout_ms : 90000;
  var env = Object.assign({}, process.env);
  if (proj) env.MOHO_LIVING_PROJECT = proj;
  if (opts.render_out) env.MOHO_LIVING_RENDER_OUT = String(opts.render_out);
  if (opts.motion_out) env.MOHO_LIVING_MOTION_OUT = String(opts.motion_out);
  // spawnSync keeps both stdout and stderr
  var res = spawnSync(bin, argv, {
    timeout: timeout,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: env
  });
  var stdout = res.stdout != null ? String(res.stdout) : '';
  var stderr = res.stderr != null ? String(res.stderr) : '';
  var combined = stderr + '\n' + stdout;
  var timedOut = !!(res.error && res.error.code === 'ETIMEDOUT');
  var looksOk =
    /SMOKE_OK|CREATE_START|saved |layer L0_void|LIST_OK|MARKERS_OK|layers_n |ANIMATE_OK|RENDER_OK|animated |DRAW_OK|drew |MOTION_EXPORT_OK|export_layer |DESIGN_UPGRADE_OK|designed |keyed |LIGHTING_ANIM_OK|light_keyed /i.test(
      combined
    ) && !/Error \(\d+\):/i.test(combined);
  var exitOk = res.status === 0;
  if (timedOut && !looksOk) {
    return {
      ok: false,
      kind: 'moho_cli',
      command: bin,
      args: argv,
      error: 'moho_cli_timeout',
      stdout: stdout.slice(0, 4000),
      stderr: stderr.slice(0, 4000),
      pro: true
    };
  }
  if (exitOk || looksOk) {
    return {
      ok: true,
      kind: 'moho_cli',
      command: bin,
      args: argv,
      stdout: stdout.slice(0, 8000),
      stderr: stderr.slice(0, 8000),
      did: 'moho_cli:' + path.basename(script),
      status: res.status,
      pro: true,
      note: !exitOk && looksOk ? 'ok_via_stderr_markers' : undefined
    };
  }
  return {
    ok: false,
    kind: 'moho_cli',
    command: bin,
    args: argv,
    error: res.error ? String(res.error.message || res.error) : 'moho_cli_exit_' + res.status,
    stdout: stdout.slice(0, 4000),
    stderr: stderr.slice(0, 4000),
    status: res.status,
    pro: true
  };
}

/**
 * -render project.moho  (Pro CLI renderer)
 */
function runRender(opts) {
  opts = opts || {};
  var bin = mohoBinary();
  if (!bin) return { ok: false, error: 'moho_binary_missing' };
  var project = opts.project && path.resolve(String(opts.project));
  if (!project || !fs.existsSync(project)) {
    return { ok: false, error: 'project_missing', project: project };
  }
  // Verified: only project path — second arg is treated as project and fails.
  var argv = ['-render', project];
  if (opts.dry_run) {
    return { ok: true, dry_run: true, kind: 'moho_render', command: bin, args: argv };
  }
  var timeout = opts.timeout_ms != null ? opts.timeout_ms : 300000;
  var projDir = path.dirname(project);
  var base = path.basename(project, path.extname(project));
  var before = {};
  try {
    fs.readdirSync(projDir).forEach(function (f) {
      if (f.indexOf(base + '_') === 0 && /\.(jpe?g|png)$/i.test(f)) before[f] = 1;
    });
  } catch (_b) { /* */ }
  var res = spawnSync(bin, argv, {
    timeout: timeout,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    cwd: projDir,
    env: process.env
  });
  var frames = [];
  try {
    fs.readdirSync(projDir)
      .filter(function (f) {
        return f.indexOf(base + '_') === 0 && /\.(jpe?g|png)$/i.test(f);
      })
      .sort()
      .forEach(function (f) {
        frames.push(path.join(projDir, f));
      });
  } catch (_f) { /* */ }
  var ok = res.status === 0 && frames.length > 0;
  return {
    ok: ok,
    kind: 'moho_render',
    command: bin,
    args: argv,
    frames_n: frames.length,
    frames_dir: projDir,
    frames_prefix: base + '_',
    stdout: res.stdout ? String(res.stdout).slice(0, 4000) : '',
    stderr: res.stderr ? String(res.stderr).slice(0, 4000) : '',
    status: res.status,
    did: ok ? 'moho_render_frames:' + frames.length : 'moho_render_failed',
    error: ok ? null : res.error ? String(res.error.message || res.error) : 'no_frames'
  };
}

function defaultScriptsDir(rankingRoot) {
  return path.join(rankingRoot, 'vendor', 'moho', 'scripts');
}

function defaultProjectPath(rankingRoot) {
  return path.join(rankingRoot, 'vendor', 'moho', 'project', 'JWorkbook_chrome.moho');
}

/**
 * Ensure JWorkbook_chrome.moho exists via Moho Pro CLI scaffold.
 */
function ensureJWorkbookProject(rankingRoot, opts) {
  opts = opts || {};
  var project = defaultProjectPath(rankingRoot);
  if (fs.existsSync(project) && !opts.force) {
    return {
      ok: true,
      current: true,
      project: project,
      did: 'moho_project_current'
    };
  }
  var script = path.join(defaultScriptsDir(rankingRoot), 'CreateJWorkbookProject.lua');
  if (!fs.existsSync(script)) {
    return { ok: false, error: 'scaffold_script_missing', script: script };
  }
  var run = runLua({
    script: script,
    dry_run: !!opts.dry_run,
    timeout_ms: opts.timeout_ms || 90000
  });
  if (opts.dry_run) return run;
  if (!run.ok) return run;
  var exists = fs.existsSync(project);
  return {
    ok: exists,
    current: false,
    project: project,
    did: exists ? 'moho_project_scaffolded' : 'moho_project_missing_after_cli',
    cli: run,
    error: exists ? null : 'FileSaveAs did not produce project'
  };
}

/**
 * Animate L* layers in Moho Pro (keyframe translation/scale) via CLI.
 */
function animateJWorkbook(rankingRoot, opts) {
  opts = opts || {};
  var project = opts.project || defaultProjectPath(rankingRoot);
  var script = path.join(defaultScriptsDir(rankingRoot), 'AnimateJWorkbookLayers.lua');
  if (!fs.existsSync(script)) {
    return { ok: false, error: 'animate_script_missing', script: script };
  }
  if (!fs.existsSync(project)) {
    var sc = ensureJWorkbookProject(rankingRoot, { force: false });
    if (!sc.ok) return sc;
  }
  var run = runLua({
    script: script,
    project: project,
    dry_run: !!opts.dry_run,
    timeout_ms: opts.timeout_ms || 120000
  });
  if (opts.dry_run) return run;
  return {
    ok: !!run.ok,
    project: project,
    did: run.ok ? 'moho_animated' : 'moho_animate_failed',
    cli: run,
    error: run.ok ? null : run.error || run.stderr
  };
}

/**
 * Render preview PNG of project (Pro CLI FileRender).
 */
function renderPreview(rankingRoot, opts) {
  opts = opts || {};
  var project = opts.project || defaultProjectPath(rankingRoot);
  var script = path.join(defaultScriptsDir(rankingRoot), 'RenderPreview.lua');
  var out =
    opts.render_out ||
    path.join(path.dirname(project), 'JWorkbook_chrome_preview.png');
  if (!fs.existsSync(script)) {
    return { ok: false, error: 'render_script_missing', script: script };
  }
  if (!fs.existsSync(project)) {
    return { ok: false, error: 'project_missing', project: project };
  }
  var run = runLua({
    script: script,
    project: project,
    render_out: out,
    dry_run: !!opts.dry_run,
    timeout_ms: opts.timeout_ms || 180000
  });
  if (opts.dry_run) return run;
  return {
    ok: !!run.ok && fs.existsSync(out),
    project: project,
    render_out: out,
    did: run.ok ? 'moho_rendered' : 'moho_render_failed',
    cli: run,
    error: run.ok ? null : run.error || run.stderr
  };
}

module.exports = {
  MOHO_APP: MOHO_APP,
  MOHO_BIN: MOHO_BIN,
  isMohoExternal: isMohoExternal,
  sanitizeOpenArgs: sanitizeOpenArgs,
  mohoBinary: mohoBinary,
  mohoAppExists: mohoAppExists,
  runLua: runLua,
  runRender: runRender,
  defaultScriptsDir: defaultScriptsDir,
  defaultProjectPath: defaultProjectPath,
  ensureJWorkbookProject: ensureJWorkbookProject,
  animateJWorkbook: animateJWorkbook,
  renderPreview: renderPreview,
  exportMotionTimeline: exportMotionTimeline,
  buildLightingSot: buildLightingSot,
  buildSceneSot: buildSceneSot,
  publishToRankingUi: publishToRankingUi
};

/**
 * Bake WebGPU scene from Moho design SoT — NO live DOM.
 * artboard regions (design_bindings) + layer elev + sequence ref.
 * Runtime only samples lighting_sot + draws baked nodes.
 */
function buildSceneSot(rankingRoot, opts) {
  opts = opts || {};
  var pubDir = path.join(rankingRoot, 'vendor', 'moho', 'published');
  var bindingsPath =
    opts.bindings_path || path.join(rankingRoot, 'vendor', 'moho', 'design_bindings.json');
  var layersPath =
    opts.layers_path || path.join(rankingRoot, 'vendor', 'moho', 'layers.json');
  var outPath = opts.out_path || path.join(pubDir, 'scene_sot.json');
  var bindings = null;
  var layersDoc = null;
  try {
    bindings = JSON.parse(fs.readFileSync(bindingsPath, 'utf8'));
  } catch (e) {
    return { ok: false, error: 'bindings_missing', detail: String(e && e.message) };
  }
  try {
    if (fs.existsSync(layersPath)) {
      layersDoc = JSON.parse(fs.readFileSync(layersPath, 'utf8'));
    }
  } catch (_l) {
    layersDoc = null;
  }

  var art = (bindings && bindings.artboard) || { w: 1280, h: 800 };
  var aw = art.w || 1280;
  var ah = art.h || 800;

  // elev / depth / material by region role
  var REGION_MAT = {
    header: { elev: 5, depth: 16, rgb: [0.12, 0.12, 0.16], role: 'chrome' },
    tabs: { elev: 4.2, depth: 12, rgb: [0.1, 0.1, 0.14], role: 'chrome' },
    graph_bar: { elev: 3.8, depth: 11, rgb: [0.1, 0.11, 0.15], role: 'chrome' },
    pane: { elev: 3.2, depth: 14, rgb: [0.09, 0.09, 0.12], role: 'surface' },
    side: { elev: 3.6, depth: 14, rgb: [0.08, 0.09, 0.12], role: 'surface' },
    status: { elev: 4, depth: 10, rgb: [0.14, 0.14, 0.18], role: 'chrome' },
    live_badge: { elev: 4.5, depth: 9, rgb: [0.18, 0.16, 0.22], role: 'control' },
    save_btn: { elev: 4, depth: 9, rgb: [0.16, 0.18, 0.14], role: 'control' },
    tab_active: { elev: 4.4, depth: 10, rgb: [0.15, 0.14, 0.2], role: 'control' },
    joy_graph: { elev: 3, depth: 10, rgb: [0.11, 0.11, 0.15], role: 'surface' }
  };

  var nodes = [];
  var regions = (bindings && bindings.regions) || {};
  Object.keys(regions).forEach(function (key) {
    var r = regions[key];
    if (!r || r.x == null || r.y == null || r.w == null || r.h == null) return;
    var mat = REGION_MAT[key] || {
      elev: 2.5,
      depth: 10,
      rgb: [0.12, 0.12, 0.15],
      role: 'surface'
    };
    nodes.push({
      id: r.id || key,
      region: key,
      layer: null,
      role: mat.role,
      // artboard CSS px (design SoT — never live getBoundingClientRect)
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      elev: mat.elev,
      depth: mat.depth,
      rgb: mat.rgb,
      sel: r.sel || null,
      note: r.note || null
    });
  });

  // Ambient layers as full-artboard planes (z by layer z)
  var ambient = [];
  var layerList = (layersDoc && layersDoc.layers) || [];
  layerList.forEach(function (L) {
    if (!L || !L.ambient) return;
    ambient.push({
      id: L.id,
      z: L.z != null ? L.z : 0,
      export: L.export || null,
      role: L.role || 'ambient',
      rgb:
        L.role === 'background'
          ? [0.04, 0.04, 0.055]
          : L.role === 'accent'
            ? [0.2, 0.16, 0.28]
            : [0.1, 0.1, 0.13]
    });
  });

  // Sequence = Moho pixel design (optional textured plate)
  var seqDir = path.join(pubDir, 'sequence');
  var framesN = 0;
  try {
    if (fs.existsSync(seqDir)) {
      framesN = fs
        .readdirSync(seqDir)
        .filter(function (f) {
          return /^frame_\d+\.(jpe?g|png)$/i.test(f);
        }).length;
    }
  } catch (_s) {
    framesN = 0;
  }

  var sot = {
    at: new Date().toISOString(),
    law:
      'Moho Pro designs. scene_sot is baked artboard geometry. ' +
      'WebGPU draws ONLY this + lighting_sot. No live DOM compile.',
    source: 'moho_pro',
    pipeline: 'moho → design_bindings/regions + motion → scene_sot + lighting_sot → webgpu',
    artboard: { w: aw, h: ah, unit: 'px' },
    camera: { kind: 'ortho_artboard', fixed: true, letterbox: true },
    nodes: nodes,
    ambient: ambient,
    sequence: {
      dir: 'vendor/moho/published/sequence',
      pattern: 'frame_%05d.jpeg',
      frames_n: framesN,
      as_plate: true,
      note: 'Moho -render pixels; optional full-bleed plate under extrusions'
    },
    lighting: 'vendor/moho/published/lighting_sot.json',
    bindings_rev: bindings.rev,
    nodes_n: nodes.length
  };

  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(sot, null, 2) + '\n', 'utf8');
  } catch (e2) {
    return { ok: false, error: 'write_failed', detail: String(e2 && e2.message) };
  }
  return {
    ok: true,
    did: 'scene_sot_built',
    out_path: outPath,
    nodes_n: nodes.length,
    frames_n: framesN
  };
}

/**
 * Build lighting_sot.json for WebGPU from Moho motion_timeline.
 * Sampled light orbit — L vector, keyI, fillI per frame.
 */
function buildLightingSot(rankingRoot, opts) {
  opts = opts || {};
  var pubDir = path.join(rankingRoot, 'vendor', 'moho', 'published');
  var motionPath =
    opts.motion_path || path.join(pubDir, 'motion_timeline.json');
  var outPath = opts.out_path || path.join(pubDir, 'lighting_sot.json');
  if (!fs.existsSync(motionPath)) {
    return { ok: false, error: 'motion_missing', motion_path: motionPath };
  }
  var motion;
  try {
    motion = JSON.parse(fs.readFileSync(motionPath, 'utf8'));
  } catch (e) {
    return { ok: false, error: 'motion_parse', detail: String(e && e.message) };
  }
  var endF = motion.end_frame || 72;
  var fps = motion.fps || 24;
  var layers = {};
  (motion.layers || []).forEach(function (L) {
    if (L && L.name) layers[L.name] = L;
  });

  function lerpLayer(name, f) {
    var L = layers[name];
    if (!L || !L.keys || !L.keys.length) return { sx: 1, sy: 1, tx: 0, ty: 0 };
    var keys = L.keys;
    var a = keys[0];
    var b = keys[keys.length - 1];
    for (var i = 0; i < keys.length - 1; i++) {
      if (f >= keys[i].f && f <= keys[i + 1].f) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
      if (f >= keys[i].f) a = keys[i];
    }
    var span = (b.f - a.f) || 1;
    var u = Math.max(0, Math.min(1, (f - a.f) / span));
    u = u * u * (3 - 2 * u);
    return {
      sx: (a.sx != null ? a.sx : 1) * (1 - u) + (b.sx != null ? b.sx : 1) * u,
      sy: (a.sy != null ? a.sy : 1) * (1 - u) + (b.sy != null ? b.sy : 1) * u,
      tx: (a.tx || 0) * (1 - u) + (b.tx || 0) * u,
      ty: (a.ty || 0) * (1 - u) + (b.ty || 0) * u
    };
  }

  var samples = [];
  var n = endF + 1;
  for (var f = 0; f <= endF; f++) {
    var c = lerpLayer('L2_chrome', f);
    var ac = lerpLayer('L1_accent_wave', f);
    var v = lerpLayer('L0_void', f);
    var keyI = 0.55 + (c.sx - 0.92) * (0.7 / 0.16);
    if (keyI < 0.5) keyI = 0.5;
    if (keyI > 1.35) keyI = 1.35;
    var fillI = 0.28 + Math.abs(ac.ty) * 3.5 + Math.abs(v.ty) * 2;
    if (fillI < 0.25) fillI = 0.25;
    if (fillI > 0.7) fillI = 0.7;
    var lx = -0.5 + ac.tx * 4.5;
    var ly = 0.65 + ac.ty * 4.0;
    var lz = 0.55 + (c.sy - 1) * 2.0;
    var len = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
    lx /= len;
    ly /= len;
    lz /= len;
    samples.push({
      f: f,
      t: f / endF,
      L: [lx, ly, lz],
      keyI: keyI,
      fillI: fillI,
      yaw: ac.tx * 90,
      pitch: -ac.ty * 70
    });
  }

  var sot = {
    at: new Date().toISOString(),
    law:
      'Moho Pro motion → lighting_sot. WebGPU ranks panels with depth. HTML = structure/$.',
    source: 'moho_pro',
    motion_timeline: path.relative(rankingRoot, motionPath),
    end_frame: endF,
    fps: fps,
    camera: { kind: 'ortho_screen', fixed: true },
    samples: samples,
    pipeline: 'moho → lighting_sot → jworkbook_webgpu'
  };
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(sot, null, 2) + '\n', 'utf8');
  } catch (e2) {
    return { ok: false, error: 'write_failed', detail: String(e2 && e2.message) };
  }
  return { ok: true, did: 'lighting_sot_built', out_path: outPath, samples_n: samples.length };
}

/**
 * Export keyframe JSON from Moho Pro (anti-drift motion SoT).
 */
function exportMotionTimeline(rankingRoot, opts) {
  opts = opts || {};
  var project = opts.project || defaultProjectPath(rankingRoot);
  var script = path.join(defaultScriptsDir(rankingRoot), 'ExportMotionTimeline.lua');
  var motionOut =
    opts.motion_out ||
    path.join(rankingRoot, 'vendor', 'moho', 'published', 'motion_timeline.json');
  if (!fs.existsSync(script)) {
    return { ok: false, error: 'motion_script_missing', script: script };
  }
  if (!fs.existsSync(project)) {
    return { ok: false, error: 'project_missing', project: project };
  }
  try {
    fs.mkdirSync(path.dirname(motionOut), { recursive: true });
  } catch (_m) { /* */ }
  var run = runLua({
    script: script,
    project: project,
    motion_out: motionOut,
    dry_run: !!opts.dry_run,
    timeout_ms: opts.timeout_ms || 120000
  });
  if (opts.dry_run) return run;
  var ok = !!run.ok && fs.existsSync(motionOut);
  return {
    ok: ok,
    project: project,
    motion_out: motionOut,
    did: ok ? 'moho_motion_exported' : 'moho_motion_export_failed',
    cli: run,
    error: ok ? null : run.error || run.stderr
  };
}

/**
 * Full anti-drift publish:
 *  scaffold → animate → export motion JSON → -render frames → stamp moho_publish.json
 *  + refresh design_bindings provenance. Runtime consumes published/* only for motion.
 */
function publishToRankingUi(rankingRoot, opts) {
  opts = opts || {};
  var project = opts.project || defaultProjectPath(rankingRoot);
  var pubDir = path.join(rankingRoot, 'vendor', 'moho', 'published');
  var seqDir = path.join(pubDir, 'sequence');
  var motionOut = path.join(pubDir, 'motion_timeline.json');
  var stampPath = path.join(pubDir, 'moho_publish.json');
  var steps = [];

  if (opts.dry_run) {
    return {
      ok: true,
      dry_run: true,
      did: 'moho_publish_dry',
      steps: ['scaffold', 'animate', 'export_motion', 'render_frames', 'stamp']
    };
  }

  try {
    fs.mkdirSync(pubDir, { recursive: true });
    fs.mkdirSync(seqDir, { recursive: true });
  } catch (_d) { /* */ }

  var sc = ensureJWorkbookProject(rankingRoot, { force: !!opts.force_scaffold });
  steps.push(sc);
  if (!sc.ok && !sc.current) {
    return { ok: false, did: 'moho_publish_failed', at: 'scaffold', steps: steps };
  }

  // Full visual design upgrade inside Moho Pro (geometry + denser keys)
  var upgradeScript = path.join(defaultScriptsDir(rankingRoot), 'DesignUpgradeRankingUi.lua');
  var up = null;
  if (fs.existsSync(upgradeScript)) {
    up = runLua({
      script: upgradeScript,
      project: project,
      timeout_ms: opts.upgrade_timeout_ms || 180000
    });
    steps.push(up);
    if (!up.ok) {
      // fallback animate only
      var an0 = animateJWorkbook(rankingRoot, { project: project });
      steps.push(an0);
      if (!an0.ok) {
        return { ok: false, did: 'moho_publish_failed', at: 'design_upgrade', steps: steps };
      }
    }
  } else {
    var an = animateJWorkbook(rankingRoot, { project: project });
    steps.push(an);
    if (!an.ok) {
      return { ok: false, did: 'moho_publish_failed', at: 'animate', steps: steps };
    }
  }

  // Moho Pro lighting orbit (3D key/fill for review_sot CSS light model)
  var lightScript = path.join(defaultScriptsDir(rankingRoot), 'AnimateUiLighting.lua');
  if (fs.existsSync(lightScript)) {
    var lit = runLua({
      script: lightScript,
      project: project,
      timeout_ms: opts.upgrade_timeout_ms || 120000
    });
    steps.push(lit);
    if (lit && lit.ok) {
      up = up || lit;
    }
  }

  var mot = exportMotionTimeline(rankingRoot, {
    project: project,
    motion_out: motionOut
  });
  steps.push(mot);
  if (!mot.ok) {
    return { ok: false, did: 'moho_publish_failed', at: 'export_motion', steps: steps };
  }

  // WebGPU lighting SoT (Moho keys → L/keyI/fill samples)
  var litSot = buildLightingSot(rankingRoot, { motion_path: motionOut });
  steps.push(litSot);

  var ren = runRender({ project: project, timeout_ms: opts.render_timeout_ms || 300000 });
  steps.push(ren);
  // copy frames into published/sequence/
  var copied = 0;
  if (ren.ok && ren.frames_n) {
    try {
      var projDir = path.dirname(project);
      var base = path.basename(project, path.extname(project));
      fs.readdirSync(projDir)
        .filter(function (f) {
          return f.indexOf(base + '_') === 0 && /\.(jpe?g|png)$/i.test(f);
        })
        .sort()
        .forEach(function (f) {
          var src = path.join(projDir, f);
          var dst = path.join(seqDir, f.replace(base + '_', 'frame_'));
          fs.copyFileSync(src, dst);
          copied++;
        });
    } catch (_c) { /* */ }
  }

  // WebGPU scene SoT after sequence copy (artboard regions baked — no live DOM)
  var sceneSot = buildSceneSot(rankingRoot, {});
  steps.push(sceneSot);

  // Load bindings for stamp
  var bindingsPath = path.join(rankingRoot, 'vendor', 'moho', 'design_bindings.json');
  var bindings = null;
  try {
    bindings = JSON.parse(fs.readFileSync(bindingsPath, 'utf8'));
  } catch (_b) { /* */ }

  var stamp = {
    at: new Date().toISOString(),
    law:
      'Moho Pro designs. scene_sot + lighting_sot → pure WebGPU. ' +
      'No live DOM compile for visuals. Function UI optional (?mode=function).',
    designer: 'Moho.app Pro CLI',
    project: path.relative(rankingRoot, project),
    motion_timeline: path.relative(rankingRoot, motionOut),
    lighting_sot: 'vendor/moho/published/lighting_sot.json',
    scene_sot: 'vendor/moho/published/scene_sot.json',
    sequence_dir: path.relative(rankingRoot, seqDir),
    frames_n: copied || ren.frames_n || 0,
    render_ok: !!ren.ok,
    animate_ok: true,
    design_upgrade_ok: !!(up && up.ok),
    motion_ok: !!mot.ok,
    lighting_sot_ok: !!(litSot && litSot.ok),
    scene_sot_ok: !!(sceneSot && sceneSot.ok),
    bindings_rev: bindings && bindings.rev,
    bindings_fail_closed: !!(bindings && bindings.fail_closed),
    events: (bindings && bindings.bindings || []).map(function (b) {
      return { when: b.when, layer: b.layer, region: b.region, place: b.place };
    }),
    anti_drift: {
      source: 'moho_pro',
      open_gui: 'disabled',
      placement: 'design_bindings.json',
      motion: 'published/motion_timeline.json',
      lighting: 'published/lighting_sot.json',
      scene: 'published/scene_sot.json',
      render: 'webgpu_scene_only',
      pixels: 'published/sequence/frame_*.jpeg'
    }
  };

  fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 2) + '\n', 'utf8');

  // Mark design_bindings with publish pointer (non-destructive fields)
  if (bindings) {
    bindings.moho_publish = {
      at: stamp.at,
      stamp: 'published/moho_publish.json',
      motion: 'published/motion_timeline.json',
      sequence: 'published/sequence/',
      project: stamp.project
    };
    bindings.designer = 'Moho.app Pro';
    try {
      fs.writeFileSync(bindingsPath, JSON.stringify(bindings, null, 2) + '\n', 'utf8');
    } catch (_w) { /* */ }
  }

  // Update layers.json design_law pointer if present
  try {
    var layersPath = path.join(rankingRoot, 'vendor', 'moho', 'layers.json');
    if (fs.existsSync(layersPath)) {
      var layers = JSON.parse(fs.readFileSync(layersPath, 'utf8'));
      layers.moho_publish = bindings && bindings.moho_publish;
      layers.design_law = layers.design_law || {};
      layers.design_law.published_motion = 'published/motion_timeline.json';
      layers.design_law.published_sequence = 'published/sequence/';
      layers.design_law.project = stamp.project;
      layers.design_law.designer = 'Moho.app Pro';
      layers.design_law.fail_closed = true;
      fs.writeFileSync(layersPath, JSON.stringify(layers, null, 2) + '\n', 'utf8');
    }
  } catch (_l) { /* */ }

  var designOk = !!(up && up.ok) || steps.some(function (s) {
    return s && (s.did === 'moho_animated' || (s.stderr && /DESIGN_UPGRADE_OK|ANIMATE_OK/.test(s.stderr)));
  });
  return {
    ok: !!(mot.ok && designOk && (ren.ok || copied > 0)),
    did: 'moho_published',
    project: project,
    stamp: stampPath,
    motion_out: motionOut,
    frames_n: copied || ren.frames_n || 0,
    sequence_dir: seqDir,
    design_upgrade_ok: !!(up && up.ok),
    steps: steps.map(function (s) {
      return (s && (s.did || (s.ok && 'ok') || (s.error && 'err'))) || null;
    }),
    note:
      'review_sot motion SoT = published/* from Moho Pro full design upgrade. Bindings place function.'
  };
}
