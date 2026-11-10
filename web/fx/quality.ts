// Qualité VFX : `?fx=low` coupe les effets coûteux (particules, rubans, bloom, kill-cam).
// Rien ici ne touche la simulation.

export type FxQuality = 'high' | 'low';

export function parseFxQuality(raw: string | null): FxQuality {
  if (raw === 'low' || raw === '0' || raw === 'off') return 'low';
  return 'high';
}

export const FX_BUDGET = {
  high: { particles: 220, tracers: 8, casings: 14, decals: 18, ribbons: 4, dust: 36, embers: 14 },
  low: { particles: 0, tracers: 3, casings: 0, decals: 0, ribbons: 0, dust: 0, embers: 0 },
} as const;
