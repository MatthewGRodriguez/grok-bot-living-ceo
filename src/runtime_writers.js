/**
 * P72 C1: session / skills / related / graduate writers densest (extracted).
 * Thin binds over session_write · skills_crystallize · related_index · graduate_tail.
 */
'use strict';

var sessionWrite = require('./session_write');
var skillsCrystallize = require('./skills_crystallize');
var relatedIndex = require('./related_index');
var graduateTail = require('./graduate_tail');

/**
 * @param {object} st { rootDir, getLoop }
 * @returns writer bag
 */
function bindWriters(st) {
  function rootDir() {
    return st.rootDir;
  }
  function loop() {
    return typeof st.getLoop === 'function' ? st.getLoop() : st.loop;
  }

  return {
    writePerfLoopTail: function (timing, parentId, top) {
      return sessionWrite.writePerfLoopTail(
        rootDir(),
        loop(),
        timing,
        parentId,
        top
      );
    },
    writeSessionTail: function (hist) {
      return sessionWrite.writeSessionTail(rootDir(), hist);
    },
    crystallizeSkills: function (parentId) {
      return skillsCrystallize.crystallizeSkills(
        rootDir(),
        parentId || 'host',
        loop()
      );
    },
    writeRelatedIndex: function () {
      return relatedIndex.writeRelatedIndex(rootDir());
    },
    writeGraduateTail: function (evals) {
      return graduateTail.writeGraduateTail(rootDir(), evals);
    }
  };
}

module.exports = {
  bindWriters: bindWriters
};
