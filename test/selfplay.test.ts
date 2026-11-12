import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OBS_DIM, N_ACT } from '../src/sim.ts';
import { mulberry32 } from '../src/rng.ts';
import type { ActorJSON } from '../src/policy.ts';
import {
  SNAPSHOT_FORMAT,
  SELFPLAY_SAMPLE,
  freezeSnapshot,
  hashActor,
  sampleOpponent,
  type FrozenSnapshot,
} from '../src/selfplaylib.ts';

function stubActor(tag: string, bias = 1): ActorJSON {
  const w = new Array(OBS_DIM * N_ACT).fill(0);
  const b = new Array(N_ACT).fill(0);
  b[1] = bias;
  return { version: tag, obsDim: OBS_DIM, nAct: N_ACT, layers: [{ inDim: OBS_DIM, outDim: N_ACT, w, b, act: 'linear' }], meta: { tag } };
}

test('protocole de tirage documenté : histShare et pool uniforme seedé', () => {
  assert.equal(SELFPLAY_SAMPLE.histShare, 0.7);
  assert.equal(SELFPLAY_SAMPLE.emptyPool, 'tactics');
  assert.match(SELFPLAY_SAMPLE.tactics.join(','), /march/);
  assert.equal(SNAPSHOT_FORMAT, 1);
});

test('freezeSnapshot pose version, génération, graine, config, hash et provenance', () => {
  const actor = stubActor('gen-1');
  const snap = freezeSnapshot(actor, {
    generation: 1,
    seed: 171,
    config: { updates: 50, envs: 4, steps: 32, hidden: [32, 32] },
    provenance: 'selfplay:seed=171:gen=1',
  });
  assert.equal(snap.meta.version, SNAPSHOT_FORMAT);
  assert.equal(snap.meta.generation, 1);
  assert.equal(snap.meta.seed, 171);
  assert.equal(snap.meta.provenance, 'selfplay:seed=171:gen=1');
  assert.equal(snap.meta.hash, hashActor(actor));
  assert.equal(snap.meta.hash.length, 64);
  assert.notEqual(snap.actor, actor, 'copie isolée, pas la référence courante');
  snap.actor.layers[0].b[1] = 99;
  assert.equal(actor.layers[0].b[1], 1);
});

test('deux acteurs distincts ⇒ hashes distincts ; même acteur ⇒ même hash', () => {
  const a = stubActor('a', 1);
  const b = stubActor('b', 2);
  assert.equal(hashActor(a), hashActor(JSON.parse(JSON.stringify(a))));
  assert.notEqual(hashActor(a), hashActor(b));
});

test('tirage seedé : même graine ⇒ même séquence ; snapshots antérieurs inclus', () => {
  const pool: FrozenSnapshot[] = [
    freezeSnapshot(stubActor('g1'), { generation: 1, seed: 1, config: {}, provenance: 'g1' }),
    freezeSnapshot(stubActor('g2'), { generation: 2, seed: 1, config: {}, provenance: 'g2' }),
  ];
  const seq = (seed: number) => Array.from({ length: 40 }, (_, i) => {
    const rng = mulberry32((seed + i * 9973) >>> 0);
    return sampleOpponent(rng, pool);
  });
  const a = seq(42), b = seq(42), c = seq(43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const kinds = a.map(x => x.kind);
  assert.ok(kinds.includes('snapshot'), 'des snapshots antérieurs doivent sortir');
  assert.ok(kinds.includes('tactic'), 'des tactiques d\'environnement restent dans le mélange');
  const snapGens = a.filter(x => x.kind === 'snapshot').map(x => x.kind === 'snapshot' ? x.generation : -1);
  assert.ok(snapGens.includes(1) && snapGens.includes(2), 'tirage uniforme sur le pool figé');
  for (const d of a) {
    if (d.kind === 'tactic') assert.ok(SELFPLAY_SAMPLE.tactics.includes(d.name));
    if (d.kind === 'snapshot') assert.equal(d.poolIndex >= 0, true);
  }
});

test('pool vide ⇒ uniquement des tactiques scriptées, jamais présentées comme checkpoint', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 20; i++) {
    const d = sampleOpponent(rng, []);
    assert.equal(d.kind, 'tactic');
    assert.equal(d.learned, false);
  }
});

test('les nouveaux modules selfplay/elo/league n\'utilisent pas Math.random', () => {
  for (const f of ['src/elo.ts', 'src/selfplaylib.ts', 'src/selfplay.ts', 'src/leaguelib.ts', 'src/league.ts']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.equal(/Math\.random\s*\(/.test(src), false, f);
  }
});
