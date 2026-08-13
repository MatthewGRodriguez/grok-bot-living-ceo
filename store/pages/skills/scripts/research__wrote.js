/**
 * skill script: research__wrote (P62 optional)
 * Law: intentional only · outer author runs · never invent $
 * Does not auto-run from MCP.
 */
'use strict';
module.exports = {
  id: 'research__wrote',
  note: 'Densest: rewrite research_latest only when findings change (not mtime farm)',
  hint: 'living_skill action=get id=research__wrote · then author page'
};
