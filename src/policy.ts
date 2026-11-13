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
// Deux formats : 30 logits (27 déplacements joints + 3 attaques, ancien) ou 12 logits (têtes factorisées 3+3+3+3).
// temp < 1 rend le fantôme plus fidèle à l'action la plus probable (le joueur imité est rarement aléatoire).
export function bcAct(m: ActorJSON, x: number[], rng: Rng, temp = 1): { move: number; atk: number } {
  const z0 = forward(m, x);
  if (temp === 0) {
    if (m.nAct === 12) {
      const h = [0, 3, 6, 9].map(o => argmax(z0.slice(o, o + 3)));
      return { move: h[0]! * 9 + h[1]! * 3 + h[2]!, atk: h[3]! };
    }
    return { move: argmax(z0.slice(0, 27)), atk: argmax(z0.slice(27, 30)) };
  }
  const z = z0.map(v => v / temp);
  if (m.nAct === 12) { const h = [0, 3, 6, 9].map(o => sample(softmax(z.slice(o, o + 3)), rng)); return { move: h[0]! * 9 + h[1]! * 3 + h[2]!, atk: h[3]! }; }
  return { move: sample(softmax(z.slice(0, 27)), rng), atk: sample(softmax(z.slice(27, 30)), rng) };
}
