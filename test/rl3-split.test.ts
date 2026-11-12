import { test } from 'node:test';
import assert from 'node:assert/strict';
import { temporalBlockSplit, mergeDaggerFrames } from '../src/bc-lib.ts';

test('split train/val : 1 bloc de 10 frames sur 5, déterministe', () => {
  const { train, val } = temporalBlockSplit(50);
  assert.deepEqual(val, [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  assert.equal(train.length + val.length, 50);
  assert.ok(train.every(i => !val.includes(i)));
  const again = temporalBlockSplit(50);
  assert.deepEqual(again.val, val);
});

test('DAgger : les frames agrégées restent hors validation (pas de fuite)', () => {
  const initial = 50;
  const extra = [100, 101, 102];
  const { train, val, all } = mergeDaggerFrames(initial, extra);
  assert.deepEqual(val, temporalBlockSplit(initial).val);
  assert.ok(extra.every(i => train.includes(i)));
  assert.ok(extra.every(i => !val.includes(i)));
  assert.deepEqual(all.slice(0, initial), [...Array(initial).keys()]);
  assert.equal(all.length, initial + extra.length);
});

test('DAgger : les données initiales ne sont pas écrasées', () => {
  const { all } = mergeDaggerFrames(10, [10, 11]);
  assert.deepEqual(all.slice(0, 10), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
