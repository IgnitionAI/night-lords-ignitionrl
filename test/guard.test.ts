import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestRunnerArgs, otherTests } from '../src/guard.ts';

test('isTestRunnerArgs : bun test / vitest sont des runners', () => {
  assert.equal(isTestRunnerArgs('bun test'), true);
  assert.equal(isTestRunnerArgs('bun test test/'), true);
  assert.equal(isTestRunnerArgs('/home/ubuntu/.bun/bin/bun test test/rl3-schema.test.ts'), true);
  assert.equal(isTestRunnerArgs('bun --cwd /tmp test test/'), true);
  assert.equal(isTestRunnerArgs('vitest run'), true);
  assert.equal(isTestRunnerArgs('node node_modules/vitest/vitest'), true);
});

test('isTestRunnerArgs : une ligne qui cite bun test n\'est pas un runner', () => {
  assert.equal(isTestRunnerArgs('bash -c bun test test/ && node dist/bc.mjs --out /tmp/rl3-ghost.json --epochs 5 --seed 1 jalon1/mesures/recording-synth.json'), false);
  assert.equal(isTestRunnerArgs('sh -c bun test && node dist/bc.mjs'), false);
  assert.equal(isTestRunnerArgs('node dist/bc.mjs --out /tmp/rl3-ghost.json --epochs 5 --seed 1 jalon1/mesures/recording-synth.json'), false);
  assert.equal(isTestRunnerArgs('grep bun test'), false);
  assert.equal(isTestRunnerArgs('node dist/dagger-cli.mjs --iters 2'), false);
});

test('otherTests depuis bun test se termine (pid courant exclu ; le parent runner peut encore matcher)', () => {
  const flagged = otherTests();
  assert.equal(typeof flagged, 'boolean');
});
