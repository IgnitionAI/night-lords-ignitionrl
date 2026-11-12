// Le snapshot figé reste bit-identique pendant que la politique courante s'entraîne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tf from '@tensorflow/tfjs-node';
import { OBS_DIM, N_ACT } from '../src/sim.ts';
import { PPO } from '../src/ppo.ts';
import { freezeSnapshot, hashActor, snapshotBytes } from '../src/selfplaylib.ts';
import { SELFPLAY_PPO } from '../src/selfplaylib.ts';

test('snapshot figé inchangé après une mise à jour PPO de la politique courante', async () => {
  const ppo = new PPO(OBS_DIM, N_ACT, { ...SELFPLAY_PPO }, 171);
  const frozen = freezeSnapshot(ppo.exportActor('pre', { generation: 0 }), {
    generation: 0, seed: 171, config: SELFPLAY_PPO, provenance: 'unit:pre',
  });
  const bytesBefore = snapshotBytes(frozen);
  const hashBefore = frozen.meta.hash;
  assert.equal(hashBefore, hashActor(frozen.actor));

  const n = 32;
  const obs = new Float32Array(n * OBS_DIM);
  const acts = new Int32Array(n);
  const lp = new Float32Array(n);
  const adv = new Float32Array(n);
  const ret = new Float32Array(n);
  for (let i = 0; i < n; i++) { lp[i] = Math.log(1 / N_ACT); adv[i] = (i % 3) - 1; ret[i] = adv[i]; }
  ppo.update(obs, acts, lp, adv, ret);

  const after = ppo.exportActor('post', { generation: 1 });
  assert.notEqual(hashActor(after), hashBefore, 'la politique courante doit bouger');
  assert.equal(snapshotBytes(frozen), bytesBefore);
  assert.equal(frozen.meta.hash, hashBefore);
  tf.disposeVariables();
  ppo.actor.dispose();
  ppo.critic.dispose();
});
