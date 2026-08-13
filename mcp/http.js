/**
 * Living-core MCP over streamable HTTP (POST /mcp).
 * When living-core is root: node mcp/http.js  → :3850
 * P61: lazy-load tools (fast listen / init — match stdio).
 */
'use strict';

var http = require('http');

var PORT = Number(process.env.LIVING_MCP_PORT || 3850);
var PROTOCOL = '2024-11-05';
var SERVER_VERSION = '0.1.0';

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
  if (!msg || msg.jsonrpc !== '2.0') return null;

  if (msg.method === 'initialize') {
    var pv = (msg.params && msg.params.protocolVersion) || PROTOCOL;
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: pv,
        capabilities: {
          tools: {},
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false }
        },
        serverInfo: { name: 'living-core', version: SERVER_VERSION }
      }
    };
  }

  if (
    msg.method === 'notifications/initialized' ||
    msg.method === 'initialized' ||
    msg.method === 'notifications/cancelled'
  ) {
    return null;
  }

  if (msg.method === 'ping') {
    return { jsonrpc: '2.0', id: msg.id, result: {} };
  }

  if (msg.method === 'tools/list') {
    var tlist = getTools();
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: tlist.listToolsForMcp ? tlist.listToolsForMcp() : tlist.TOOL_DEFS
      }
    };
  }

  if (msg.method === 'resources/list') {
    try {
      var resMod = require('./resources');
      return { jsonrpc: '2.0', id: msg.id, result: resMod.listResources() };
    } catch (_e) {
      return { jsonrpc: '2.0', id: msg.id, result: { resources: [] } };
    }
  }

  if (msg.method === 'resources/read') {
    try {
      var resRead = require('./resources');
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: resRead.readResource(msg.params && msg.params.uri)
      };
    } catch (er) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32002, message: er.message || String(er) }
      };
    }
  }

  if (msg.method === 'prompts/list') {
    try {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: require('./resources').listPrompts()
      };
    } catch (_p) {
      return { jsonrpc: '2.0', id: msg.id, result: { prompts: [] } };
    }
  }

  if (msg.method === 'prompts/get') {
    try {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: require('./resources').getPrompt(
          msg.params && msg.params.name,
          (msg.params && msg.params.arguments) || {}
        )
      };
    } catch (ep) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32602, message: ep.message || String(ep) }
      };
    }
  }

  // Convenience aliases (non-spec helpers for curl)
  if (msg.method && msg.method.indexOf('living_') === 0) {
    try {
      var r = getTools().dispatch(msg.method, msg.params || msg.arguments || {});
      return { jsonrpc: '2.0', id: msg.id, result: r };
    } catch (e) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32000, message: e.message || String(e) }
      };
    }
  }

  if (msg.method === 'tools/call') {
    var name = msg.params && msg.params.name;
    var args = (msg.params && msg.params.arguments) || {};
    var tcall = getTools();
    if (!tcall.hasTool(name)) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: toolText('unknown tool: ' + name, true)
      };
    }
    try {
      var result = tcall.dispatch(name, args);
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

  if (msg.id != null) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: 'Method not found: ' + msg.method }
    };
  }
  return null;
}

function createServer() {
  return http.createServer(function (req, res) {
    var url = (req.url || '/').split('?')[0];
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version'
      });
      res.end();
      return;
    }
    if (req.method === 'GET' && (url === '/' || url === '/health' || url === '/mcp')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      var tnames = getTools().TOOL_DEFS.map(function (t) {
        return t.name;
      });
      res.end(JSON.stringify({
        ok: true,
        service: 'living-core-mcp',
        protocol: PROTOCOL,
        tools: tnames,
        list_mode: process.env.LIVING_MCP_LIST || 'core'
      }));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('POST only');
      return;
    }
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      var raw = Buffer.concat(chunks).toString('utf8');
      var body = {};
      try { body = JSON.parse(raw || '{}'); } catch (_e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
        return;
      }
      // Accept bare { method, params } or full jsonrpc
      if (!body.jsonrpc) {
        body.jsonrpc = '2.0';
        if (body.id === undefined) body.id = 1;
      }
      var out = handleMessage(body);
      if (out == null) {
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': PROTOCOL,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(out));
    });
  });
}

if (require.main === module) {
  var server = createServer();
  server.listen(PORT, function () {
    console.log('living-core MCP HTTP → http://127.0.0.1:' + PORT + '/mcp');
    console.log('list_mode:', process.env.LIVING_MCP_LIST || 'core');
    console.log(
      'tools listed:',
      getTools()
        .listToolsForMcp()
        .map(function (t) {
          return t.name;
        })
        .join(', ')
    );
  });
}

module.exports = {
  createServer: createServer,
  handleMessage: handleMessage
};
