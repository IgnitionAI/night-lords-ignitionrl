// Inférence pure JS (navigateur et éval) d'un acteur exporté depuis tfjs : couches denses tanh puis logits.
import type { Rng } from './rng';
export interface DenseJSON { inDim: number; outDim: number; w: number[]; b: number[]; act: 'tanh' | 'linear' }
export interface ActorJSON { version: string; obsDim: number; nAct: number; layers: DenseJSON[]; meta?: Record<string, unknown> }
export function forward(m: ActorJSON, x: number[]): number[] {
  let h = x;
  for (const L of m.layers) {
    const o = new Array(L.outDim).fill(0);
    for (let j = 0; j < L.outDim; j++) { let s = L.b[j]; for (let i = 0; i < L.inDim; i++) s += h[i] * L.w[i * L.outDim + j]; o[j] = L.act === 'tanh' ? Math.tanh(s) : s; }
    h = o;
  }
  return h;
}
export function softmax(z: number[]): number[] { const m = Math.max(...z); const e = z.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); }
export function sample(p: number[], rng: Rng): number { let r = rng(), c = 0; for (let i = 0; i < p.length; i++) { c += p[i]; if (r < c) return i; } return p.length - 1; }
export const argmax = (p: number[]) => p.indexOf(Math.max(...p));
// Fantôme appris par imitation : même MLP, sortie = 27 logits de déplacement + 3 logits d'attaque.
export function bcAct(m: ActorJSON, x: number[], rng: Rng): { move: number; atk: number } {
  const z = forward(m, x); return { move: sample(softmax(z.slice(0, 27)), rng), atk: sample(softmax(z.slice(27, 30)), rng) };
}
