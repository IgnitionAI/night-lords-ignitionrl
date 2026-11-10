// Observation versionnée par pack : n’écrit rien dans la dynamique de sim.ts.
// b3–b6 (obsDim 32) rejouent `observe()` tel quel. b8 ajoute T→balise (distance, fermeture).
import { observe, OBS_DIM, dist, BEACON, T_CFG, type World } from './sim';
import type { ActorJSON } from './policy';

export const BASE_OBS_DIM = OBS_DIM;
export const B8_OBS_DIM = 34;
export const BEACON_DIST_SPAN = 40;

export type PackObsDim = typeof BASE_OBS_DIM | typeof B8_OBS_DIM;

export function packObsDim(n: number): PackObsDim {
  if (n === BASE_OBS_DIM || n === B8_OBS_DIM) return n;
  throw new Error(`obsDim non supporté : ${n} (attendu ${BASE_OBS_DIM} ou ${B8_OBS_DIM})`);
}

export function obsDimOf(pack: ActorJSON | 'naive' | 'random'): PackObsDim {
  if (pack === 'naive' || pack === 'random') return BASE_OBS_DIM;
  return packObsDim(pack.obsDim);
}

/** Distance T→balise et composante de vitesse vers la balise, calculées sur l’état déjà exposé (T public : hp/canal, cinématique). */
export function beaconFeatures(w: World): { distNorm: number; closing: number; dB: number } {
  const t = w.t;
  const dB = dist(t.x, t.y, BEACON.x, BEACON.y);
  const distNorm = Math.min(1, dB / BEACON_DIST_SPAN);
  const dx = BEACON.x - t.x, dy = BEACON.y - t.y;
  const L = Math.hypot(dx, dy);
  const closing = L < 1e-6 ? 0 : Math.max(-1, Math.min(1, (t.vx * dx / L + t.vy * dy / L) / T_CFG.fwd));
  return { distNorm, closing, dB };
}

export function observePack(w: World, i: number, dim: PackObsDim): number[] {
  const base = observe(w, i);
  switch (dim) {
    case BASE_OBS_DIM:
      return base;
    case B8_OBS_DIM: {
      const f = beaconFeatures(w);
      return [...base, f.distNorm, f.closing];
    }
    default: {
      const _e: never = dim;
      throw new Error(String(_e));
    }
  }
}

export function expandDenseKernel(data: number[], oldIn: number, outDim: number, newIn: number): number[] {
  if (newIn === oldIn) return data.slice();
  if (newIn < oldIn) throw new Error(`réduire le noyau ${oldIn} → ${newIn} n’est pas une chirurgie`);
  const out = new Array(newIn * outDim).fill(0);
  for (let i = 0; i < oldIn * outDim; i++) out[i] = data[i];
  return out;
}

/** Agrandit la 1re couche : poids à zéro sur les nouvelles entrées (sorties inchangées). */
export function expandActorObs(m: ActorJSON, newDim: PackObsDim): ActorJSON {
  if (m.obsDim === newDim) return { ...m, layers: m.layers.map(L => ({ ...L, w: L.w.slice(), b: L.b.slice() })) };
  const L0 = m.layers[0];
  if (L0.inDim !== m.obsDim) throw new Error(`acteur incohérent : obsDim ${m.obsDim} vs couche ${L0.inDim}`);
  const w = expandDenseKernel(L0.w, L0.inDim, L0.outDim, newDim);
  return {
    ...m,
    obsDim: newDim,
    layers: [{ ...L0, inDim: newDim, w }, ...m.layers.slice(1).map(L => ({ ...L, w: L.w.slice(), b: L.b.slice() }))],
  };
}
