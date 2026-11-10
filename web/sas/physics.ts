export type Quality = 'high' | 'low';
export type Vec3 = { x: number; y: number; z: number };

export const INITIAL_CRATES: [number, number, number][] = [
  [-1.74, 0.5, -1.2], [-0.58, 0.5, -1.25], [0.58, 0.5, -1.2], [1.74, 0.5, -1.25],
  [-0.6, 1.47, -1.23], [0.6, 1.47, -1.23],
  [0, 2.44, -1.23],
];

export function impulseFor(index: number, reducedMotion = false): { impulse: Vec3; torque: Vec3 } {
  const side = (index % 3 - 1) * 1.9;
  const lift = reducedMotion ? 1.7 : 2.5 + (index % 2) * 0.45;
  return {
    impulse: { x: side * 1.35, y: lift, z: -3.2 - (index % 3) * 0.35 },
    torque: { x: 0.3 + index * 0.04, y: side * 0.35, z: -side * 0.6 },
  };
}

export function qualityFor(width: number, requested?: string | null): Quality {
  if (requested === 'high' || requested === 'low') return requested;
  return width < 700 ? 'low' : 'high';
}

export function flashFor(reducedMotion: boolean) {
  return reducedMotion
    ? { intensity: 22, duration: 65, tracerDuration: 55 }
    : { intensity: 75, duration: 105, tracerDuration: 90 };
}

export function percentiles(samples: number[]) {
  if (!samples.length) return { median: 0, p95: 0, p99: 0, count: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return { median: at(0.5), p95: at(0.95), p99: at(0.99), count: sorted.length };
}
