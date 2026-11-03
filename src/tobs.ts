// Observation du Terminator (ce qu'il perçoit lui-même) et discrétisation de ses actions, pour l'imitation (BC).
import { type World, type TAction, T_CFG, BEACON, angNorm, dist, terminatorPerceives, beaconHeading, rayFree, MAX_TICKS } from './sim';

export const TOBS_DIM = 26, N_MOVE = 27, N_ATK = 3;
export function tObserve(w: World): number[] {
  const t = w.t, c = Math.cos(t.facing), s = Math.sin(t.facing), o: number[] = [];
  const local = (x: number, y: number): [number, number] => { const dx = x - t.x, dy = y - t.y; return [dx * c + dy * s, -dx * s + dy * c]; };
  const p = terminatorPerceives(w).map(i => w.nls[i]).sort((a, b) => dist(a.x, a.y, t.x, t.y) - dist(b.x, b.y, t.x, t.y));
  for (let k = 0; k < 3; k++) { const n = p[k]; if (n) { const [lx, ly] = local(n.x, n.y); o.push(1, lx / 16, ly / 16); } else o.push(0, 0, 0); }
  const [bx, by] = local(BEACON.x, BEACON.y); o.push(bx / 40, by / 40);
  const h = angNorm(beaconHeading(t.x, t.y) - t.facing); o.push(Math.cos(h), Math.sin(h));
  o.push(t.boltCd === 0 ? 1 : 0, t.fistCd === 0 ? 1 : 0, t.hp / T_CFG.hp, t.channel / T_CFG.channel, p.length / 4, w.tick / MAX_TICKS);
  o.push(rayFree(t.x, t.y, c, s) / 6, rayFree(t.x, t.y, -c, -s) / 6, rayFree(t.x, t.y, -s, c) / 6, rayFree(t.x, t.y, s, -c) / 6);
  const recent = w.tick - t.lastHitTick <= 20; const ha = angNorm(t.lastHitAngle - t.facing);
  o.push(recent ? 1 : 0, recent ? Math.cos(ha) : 0, recent ? Math.sin(ha) : 0);
  return o;
}
const sgn = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export function encodeAction(a: TAction): { move: number; atk: number } {
  return { move: (sgn(a.fwd) + 1) * 9 + (sgn(a.strafe) + 1) * 3 + (sgn(a.turn) + 1), atk: a.bolt ? 1 : a.fist ? 2 : 0 };
}
export function decodeAction(move: number, atk: number): TAction {
  return { fwd: Math.floor(move / 9) - 1, strafe: Math.floor(move / 3) % 3 - 1, turn: move % 3 - 1, bolt: atk === 1, fist: atk === 2 };
}
