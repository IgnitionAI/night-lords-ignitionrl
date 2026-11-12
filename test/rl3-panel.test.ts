import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingDataError, formatRunLog } from '../web/rl3-panel.ts';

test('messages d\'absence explicites', () => {
  assert.match(missingDataError('recording'), /données absentes/);
  assert.match(missingDataError('checkpoint'), /checkpoint absent/);
});

test('le log affiché est le JSON de run, pas un texte inventé', () => {
  const run = { accVal: { joint: 0.1 }, majorityVal: { joint: 0.4 }, disclaimer: 'données synthétiques : aucune métrique de style humain' };
  const s = formatRunLog(run);
  assert.match(s, /"joint": 0\.1/);
  assert.match(s, /synthétiques/);
});
