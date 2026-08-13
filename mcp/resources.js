/**
 * P54 densest MCP resources + prompts (peer pattern: tools ≠ only primitive).
 * Resources = application-controlled read context (hop0, densest pages).
 * Prompts = user-controlled operate recipes.
 * Law: read-only resources · writes stay tools · never invent $
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

var DENSEST_PAGE_RESOURCES = [
  'operate_close',
  'operate_mcp',
  'operate_grok_build',
  'operate_ics',
  'operate_review',
  'operate_skills',
  'roadmap_densest',
  'research_mcp_peers',
  'research_grok_build',
  'research_improve_living_core',
  'skills_index',
  'hop0_digest',
  'quality_law',
  'wiki_law'
];

function pagesDir() {
  return path.join(ROOT, 'store', 'pages');
}

function listResources() {
  var resources = [
    {
      uri: 'living://hop0/host',
      name: 'hop0 host',
      description: 'Densest attention-live hop0 for host (sense). Re-enter open_next/skills/why.',
      mimeType: 'text/plain'
    },
    {
      uri: 'living://status',
      name: 'living status',
      description: 'Modalities, loop phase, bytes densest JSON.',
      mimeType: 'application/json'
    },
    {
      uri: 'living://skills',
      name: 'skills index',
      description: 'Crystallized process skills catalog (living_skill packages).',
      mimeType: 'text/markdown'
    },
    {
      uri: 'living://binary',
      name: 'binary boundary',
      description: 'wasm/workers/cold densest · source stays JS.',
      mimeType: 'application/json'
    }
  ];
  DENSEST_PAGE_RESOURCES.forEach(function (id) {
    var p = path.join(pagesDir(), id + '.md');
    if (!fs.existsSync(p)) return;
    resources.push({
      uri: 'living://page/' + id,
      name: id,
      description: 'Densest wiki page store/pages/' + id + '.md',
      mimeType: 'text/markdown'
    });
  });
  return { resources: resources };
}

function readResource(uri) {
  uri = String(uri || '');
  if (uri === 'living://hop0/host' || uri === 'living://hop0') {
    var rt = require('./tools').runtime();
    var s = rt.sense('host');
    var text = (s.hop0 && s.hop0.text) || '';
    return {
      contents: [
        {
          uri: uri,
          mimeType: 'text/plain',
          text: text
        }
      ]
    };
  }
  if (uri === 'living://status') {
    var st = require('./tools').runtime().status();
    return {
      contents: [
        {
          uri: uri,
          mimeType: 'application/json',
          text: JSON.stringify(st, null, 2)
        }
      ]
    };
  }
  if (uri === 'living://skills') {
    var sp = path.join(pagesDir(), 'skills_index.md');
    var body = fs.existsSync(sp) ? fs.readFileSync(sp, 'utf8') : '# skills_index\n\n_none_\n';
    return {
      contents: [{ uri: uri, mimeType: 'text/markdown', text: body }]
    };
  }
  if (uri === 'living://binary') {
    var bb = require('../src/binary_boundary').status(ROOT, {});
    return {
      contents: [
        {
          uri: uri,
          mimeType: 'application/json',
          text: JSON.stringify(bb, null, 2)
        }
      ]
    };
  }
  var m = uri.match(/^living:\/\/page\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    var id = m[1];
    var fp = path.join(pagesDir(), id + '.md');
    if (!fs.existsSync(fp)) {
      throw new Error('resource_not_found: ' + uri);
    }
    return {
      contents: [
        {
          uri: uri,
          mimeType: 'text/markdown',
          text: fs.readFileSync(fp, 'utf8')
        }
      ]
    };
  }
  throw new Error('unknown_resource: ' + uri);
}

function listPrompts() {
  return {
    prompts: [
      {
        name: 'living_operate',
        description:
          'Densest operate living-core: sense open_next → rankCycle or REVIEW · no roadmap farm · never invent $',
        arguments: []
      },
      {
        name: 'living_review',
        description:
          'REVIEW gate densest: living_ranking review → approve only if intentional · sheet money SoT',
        arguments: []
      },
      {
        name: 'living_calendar_schedule',
        description:
          'Calendar schedule densest: quick_add / ICS / free_busy · schedule only · amount always 0',
        arguments: [
          {
            name: 'line',
            description: 'optional quick-add line e.g. Focus weekdays 10',
            required: false
          }
        ]
      }
    ]
  };
}

function getPrompt(name, args) {
  args = args || {};
  name = String(name || '');
  if (name === 'living_operate') {
    return {
      description: 'Operate living-core densest',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Operate living-core densest (process kernel via MCP).',
              '1. living_sense host — read open_next, binary, skills, why',
              '2. If calendar_debt → rank calendar_layers',
              '3. If REVIEW dirty → living_ranking review then approve only if intentional',
              '4. Else operate_close → living_rank_cycle (or named densest help)',
              '5. Never invent money; sheet SoT',
              '6. Prefer living_rank_cycle over many tiny loop tools',
              '7. Large catalogs: living_token_view pack format=toon',
              'Optional: read resource living://hop0/host and living://page/operate_close'
            ].join('\n')
          }
        }
      ]
    };
  }
  if (name === 'living_review') {
    return {
      description: 'REVIEW gate densest',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Run review_sot REVIEW densest.',
              '1. living_ranking action=review',
              '2. Inspect findings (joy/action/expense/money/motion)',
              '3. money_sheet is informational sheet SoT — never invent $',
              '4. approve only when drift is intentional densest help',
              '5. living_sense — open_next should clear REVIEW'
            ].join('\n')
          }
        }
      ]
    };
  }
  if (name === 'living_calendar_schedule') {
    var line = args.line || args.text || '';
    return {
      description: 'Calendar schedule densest',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Calendar schedule densest (no money invent).',
              line
                ? 'Quick-add line: ' + line + '\n→ living_ranking action=quick_add text=… apply=true if user wants write'
                : 'Use living_ranking quick_add / export_ics / import_ics as needed',
              'Law: amountMonthly always 0 for schedule · sheet EXPENSES stay SoT',
              'ICS import: dry_run first then apply=true'
            ].join('\n')
          }
        }
      ]
    };
  }
  throw new Error('unknown_prompt: ' + name);
}

module.exports = {
  listResources: listResources,
  readResource: readResource,
  listPrompts: listPrompts,
  getPrompt: getPrompt,
  DENSEST_PAGE_RESOURCES: DENSEST_PAGE_RESOURCES
};
