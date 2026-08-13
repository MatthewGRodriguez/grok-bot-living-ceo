#!/usr/bin/env node
/**
 * Living-core MCP over stdio (JSON-RPC 2.0).
 *
 * Framing: Grok shell uses newline-delimited JSON (NDJSON).
 * Cursor / classic MCP use Content-Length headers. We mirror the
 * client's first-message framing on every response.
 *
 * Paths are resolved from this file so Grok can spawn with any cwd.
 * Runtime/Exp6 is lazy-loaded after initialize so handshake is fast.
 *
 *   node mcp/stdio.js
 */
'use strict';

var path = require('path');
var fs = require('fs');

// Ensure we never inherit a wrong cwd for relative config — root is always here:
var ROOT = path.join(__dirname, '..');
try {
  process.chdir(ROOT);
} catch (_e) { /* */ }

// Critical: when stdout is a pipe (Grok/Cursor MCP), Node block-buffers
// process.stdout.write and initialize never reaches the host. Use writeSync.
function writeStdout(s) {
  fs.writeSync(1, typeof s === 'string' ? s : String(s));
}

var PROTOCOL = '2024-11-05';
var SERVER_VERSION = '0.1.0';

// 'ndjson' | 'content-length' — set from first inbound message
var framingMode = null;

// Lazy tools module (loads Exp6) — only after initialize
var tools = null;
function getTools() {
  if (!tools) tools = require('./tools');
  return tools;
}

function toolText(result, isError) {
  return {
    content: [{
      type: 'text',
      text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    }],
    isError: !!isError
  };
}

function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;

  // Accept messages without jsonrpc (some clients omit it on notifications)
  if (msg.jsonrpc && msg.jsonrpc !== '2.0') return null;

  if (msg.method === 'initialize') {
    var pv = (msg.params && msg.params.protocolVersion) || PROTOCOL;
    // Echo client protocol when possible; fall back to known stable
    if (typeof pv === 'string' && pv.length > 0) {
      // keep client version
    } else {
      pv = PROTOCOL;
    }
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: pv,
        capabilities: {
          tools: { listChanged: false },
          // P54: peer MCP pattern — resources + prompts (not tools-only)
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false }
        },
        serverInfo: {
          name: 'living-core',
          version: SERVER_VERSION
        }
      }
    };
  }

  if (
    msg.method === 'notifications/initialized' ||
    msg.method === 'initialized' ||
    msg.method === 'notifications/cancelled' ||
    msg.method === 'notifications/roots/list_changed'
  ) {
    return null; // no response for notifications
  }

  if (msg.method === 'ping') {
    return { jsonrpc: '2.0', id: msg.id, result: {} };
  }

  if (msg.method === 'tools/list') {
    // P46: dense list by default (short desc · strip prop descriptions)
    var tmod = getTools();
    var listed = tmod.listToolsForMcp ? tmod.listToolsForMcp() : tmod.TOOL_DEFS;
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: { tools: listed }
    };
  }

  if (msg.method === 'resources/list') {
    try {
      var resMod = require('./resources');
      return { jsonrpc: '2.0', id: msg.id, result: resMod.listResources() };
    } catch (e) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: { resources: [] }
      };
    }
  }

  if (msg.method === 'resources/read') {
    try {
      var resRead = require('./resources');
      var uri = msg.params && (msg.params.uri || msg.params.url);
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: resRead.readResource(uri)
      };
    } catch (er) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        error: {
          code: -32002,
          message: String(er && er.message ? er.message : er)
        }
      };
    }
  }

  if (msg.method === 'prompts/list') {
    try {
      var pr = require('./resources');
      return { jsonrpc: '2.0', id: msg.id, result: pr.listPrompts() };
    } catch (_p) {
      return { jsonrpc: '2.0', id: msg.id, result: { prompts: [] } };
    }
  }

  if (msg.method === 'prompts/get') {
    try {
      var prGet = require('./resources');
      var pname = msg.params && msg.params.name;
      var pargs = (msg.params && msg.params.arguments) || {};
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: prGet.getPrompt(pname, pargs)
      };
    } catch (ep) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        error: {
          code: -32602,
          message: String(ep && ep.message ? ep.message : ep)
        }
      };
    }
  }

  if (msg.method === 'tools/call') {
    var name = msg.params && msg.params.name;
    var args = (msg.params && msg.params.arguments) || {};
    var t = getTools();
    if (!t.hasTool(name)) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: toolText('unknown tool: ' + name, true)
      };
    }
    try {
      var result = t.dispatch(name, args);
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: toolText(result, false)
      };
    } catch (e) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: toolText(e.message || String(e), true)
      };
    }
  }

  if (msg.id !== undefined && msg.id !== null) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: 'Method not found: ' + msg.method }
    };
  }
  return null;
}

function findHeaderEnd(buf) {
  // Support both \r\n\r\n and \n\n — only when message starts with Content-Length
  var peek = buf.slice(0, Math.min(buf.length, 64)).toString('utf8');
  if (!/^\s*Content-Length\s*:/i.test(peek)) return null;
  var a = buf.indexOf('\r\n\r\n');
  var b = buf.indexOf('\n\n');
  if (a >= 0 && (b < 0 || a <= b)) return { end: a, sep: 4 };
  if (b >= 0) return { end: b, sep: 2 };
  return null;
}

function writeMessage(msg) {
  if (msg == null) return;
  var s = JSON.stringify(msg);
  // Grok shell speaks NDJSON; Content-Length clients get headers.
  // Default NDJSON so a late/unknown client (Grok) can still handshake.
  if (framingMode === 'content-length') {
    writeStdout(
      'Content-Length: ' + Buffer.byteLength(s, 'utf8') + '\r\n\r\n' + s
    );
  } else {
    writeStdout(s + '\n');
  }
}

function main() {
  // Never write logs to stdout — MCP owns stdout
  var log = function () {
    try {
      process.stderr.write(
        '[living-mcp] ' + Array.prototype.slice.call(arguments).join(' ') + '\n'
      );
    } catch (_e) { /* */ }
  };

  var buf = Buffer.alloc(0);

  function processBuffer() {
    while (true) {
      if (buf.length === 0) return;

      var peek = buf.slice(0, Math.min(buf.length, 64)).toString('utf8');

      // Content-Length framing (Cursor / classic MCP)
      if (/^\s*Content-Length\s*:/i.test(peek)) {
        var hdr = findHeaderEnd(buf);
        if (!hdr) return; // wait for full headers
        var header = buf.slice(0, hdr.end).toString('utf8');
        var m = header.match(/Content-Length:\s*(\d+)/i);
        if (!m) {
          buf = buf.slice(hdr.end + hdr.sep);
          continue;
        }
        var len = parseInt(m[1], 10);
        var start = hdr.end + hdr.sep;
        if (buf.length < start + len) return;
        var body = buf.slice(start, start + len).toString('utf8');
        buf = buf.slice(start + len);
        framingMode = 'content-length';
        try {
          writeMessage(handleMessage(JSON.parse(body)));
        } catch (e) {
          log('parse error', e.message);
        }
        continue;
      }

      // NDJSON framing (Grok shell: one JSON object per line)
      var nl = buf.indexOf('\n');
      if (nl < 0) return;
      var line = buf.slice(0, nl).toString('utf8').trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      // Skip stray Content-Length lines that arrived mid-stream without body yet
      if (/^Content-Length\s*:/i.test(line)) {
        framingMode = 'content-length';
        buf = Buffer.concat([Buffer.from(line + '\n'), buf]);
        continue;
      }
      if (line.charAt(0) !== '{') continue;
      framingMode = 'ndjson';
      try {
        writeMessage(handleMessage(JSON.parse(line)));
      } catch (e) {
        log('ndjson parse error', e.message);
      }
    }
  }

  process.stdin.on('data', function (chunk) {
    buf = Buffer.concat([buf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    processBuffer();
  });
  process.stdin.on('end', function () {
    process.exit(0);
  });
  process.stdin.on('error', function () {
    process.exit(1);
  });

  if (typeof process.stdin.resume === 'function') process.stdin.resume();

  // Signal readiness on stderr only (optional; some clients ignore)
  log('ready root=' + ROOT);
}

if (require.main === module) {
  main();
}

module.exports = { handleMessage: handleMessage, main: main };
