// Constructeurs de modèles seedés, partagés par les scripts d'entraînement (bc.ts, ppo.ts) et les tests de reproductibilité.
// L'initialiseur par défaut de tf.layers.dense est glorotNormal (DEFAULT_KERNEL_INITIALIZER, voir tfjs-layers layers/core.js) :
// on garde donc exactement le même initialiseur (même famille, même échelle fanAvg/normal) et on ne fait qu'y ajouter une graine.
import * as tf from '@tensorflow/tfjs-node';

/** Graine dérivée par couche : deux couches d'un même modèle ne doivent pas tirer la même séquence. */
export function layerSeed(seed: number, index: number): number { return (seed + index) >>> 0; }

/** Modèle de clonage de comportement (bc.ts) : tanh, tanh, linéaire — même architecture, initialiseur seedé par couche. */
export function bcModel(hidden: number, obsDim: number, heads: number, seed: number): tf.Sequential {
  const init = (i: number) => tf.initializers.glorotNormal({ seed: layerSeed(seed, i) });
  const m = tf.sequential();
  m.add(tf.layers.dense({ units: hidden, activation: 'tanh', inputShape: [obsDim], kernelInitializer: init(0) }));
  m.add(tf.layers.dense({ units: hidden, activation: 'tanh', kernelInitializer: init(1) }));
  m.add(tf.layers.dense({ units: heads, kernelInitializer: init(2) }));
  return m;
}
