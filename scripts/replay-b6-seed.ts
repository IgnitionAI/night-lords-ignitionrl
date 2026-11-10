import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { newWorld, step, observe, dist, angNorm, terminatorPerceives, DT, ROLES } from '../src/sim.ts';
import { UNSEEN } from '../src/tactics.ts';
import { forward, softmax, sample, type ActorJSON } from '../src/policy.ts';
import { mulberry32 } from '../src/rng.ts';

const packPath = process.argv[2] ?? 'policies/candidates/b6/actor.json';
const outPath = process.argv[3] ?? 'mesures/nn/b6/seed900000-replay.json';
const pack = JSON.parse(readFileSync(packPath, 'utf8')) as ActorJSON;
const seed = 900000;
const rng = mulberry32(seed ^ 0x9e3779b9);
const tactic = UNSEEN.kiter();
const w = newWorld(seed, undefined, { clawWindup: true });
const ticks: object[] = [];

const deaths: { tick: number; who: number; role: string; cause: string; d: number; cone: boolean; behind: boolean; tHp: number; sec: number }[] = [];
let bolts = 0, fists = 0, claws = 0, kills = 0, teleports = 0;
let ticksCone = 0, ticksBehindAll = 0;

function coneOf(i: number) {
  return terminatorPerceives(w).includes(i);
}
function relAng(i: number) {
  const n = w.nls[i];
  return Math.abs(angNorm(Math.atan2(n.y - w.t.y, n.x - w.t.x) - w.t.facing));
}
function behind(i: number) {
  return relAng(i) > Math.PI / 2;
}

const spawn = {
  t: { x: +w.t.x.toFixed(2), y: +w.t.y.toFixed(2), facing: +w.t.facing.toFixed(3) },
  nls: w.nls.map((n, i) => ({ role: ROLES[i], x: +n.x.toFixed(2), y: +n.y.toFixed(2), d: +dist(n.x, n.y, w.t.x, w.t.y).toFixed(2) })),
};

while (!w.done) {
  const acts = w.nls.map((n, i) => {
    if (!n.alive) return 0;
    const p = softmax(forward(pack, observe(w, i)));
    return sample(p, rng);
  });
  const ta = tactic(w);
  const aliveBefore = w.nls.map(n => n.alive);
  step(w, ta, acts);
  const ev = w.events.map(e => e.type);
  for (const e of w.events) {
    if (e.type === 'bolt') {
      bolts++;
      if (e.kill >= 0) {
        kills++;
        deaths.push({ tick: w.tick, who: e.kill, role: ROLES[e.kill], cause: 'bolt', d: +dist(w.nls[e.kill].x, w.nls[e.kill].y, w.t.x, w.t.y).toFixed(2), cone: coneOf(e.kill), behind: behind(e.kill), tHp: w.t.hp, sec: +(w.tick * DT).toFixed(1) });
      }
    }
    if (e.type === 'fist') {
      fists++;
      if (e.kill >= 0) {
        kills++;
        deaths.push({ tick: w.tick, who: e.kill, role: ROLES[e.kill], cause: 'fist', d: +dist(w.nls[e.kill].x, w.nls[e.kill].y, w.t.x, w.t.y).toFixed(2), cone: coneOf(e.kill), behind: behind(e.kill), tHp: w.t.hp, sec: +(w.tick * DT).toFixed(1) });
      }
    }
    if (e.type === 'claw') claws++;
  }
  for (let i = 0; i < 4; i++) {
    if (aliveBefore[i] && !w.nls[i].alive && !deaths.some(d => d.who === i && d.tick === w.tick)) {
      deaths.push({ tick: w.tick, who: i, role: ROLES[i], cause: 'UNKNOWN', d: +dist(w.nls[i].x, w.nls[i].y, w.t.x, w.t.y).toFixed(2), cone: false, behind: behind(i), tHp: w.t.hp, sec: +(w.tick * DT).toFixed(1) });
    }
  }
  const cone = terminatorPerceives(w);
  if (cone.length) ticksCone++;
  const alive = w.nls.map((n, i) => n.alive ? i : -1).filter(i => i >= 0);
  if (alive.length && alive.every(i => behind(i))) ticksBehindAll++;
  if (w.tick <= 5 || w.tick % 10 === 0 || w.events.some(e => e.type === 'bolt' || e.type === 'fist' || e.type === 'claw' || e.type === 'hit')) {
    ticks.push({
      tick: w.tick,
      sec: +(w.tick * DT).toFixed(1),
      t: { x: +w.t.x.toFixed(2), y: +w.t.y.toFixed(2), facing: +w.t.facing.toFixed(2), hp: w.t.hp },
      alive: w.nls.map(n => n.alive ? 1 : 0),
      d: w.nls.map(n => n.alive ? +dist(n.x, n.y, w.t.x, w.t.y).toFixed(1) : -1),
      rel: w.nls.map((n, i) => n.alive ? +relAng(i).toFixed(2) : -1),
      cone,
      events: ev.filter(x => x !== 'step'),
      behind: alive.filter(i => behind(i)).map(i => ROLES[i]),
    });
  }
}
if (w.reason === 'téléporté') teleports = 1;
const summary = {
  packPath,
  seed,
  clawWindup: true,
  rng: 'mulberry32(seed ^ 0x9e3779b9)',
  tactic: 'kiter',
  spawn,
  winner: w.winner,
  reason: w.reason,
  ticks: w.tick,
  sec: +(w.tick * DT).toFixed(1),
  tHp: w.t.hp,
  bolts, fists, claws, kills, teleports,
  shareCone: +(ticksCone / w.tick).toFixed(3),
  shareAllBehind: +(ticksBehindAll / w.tick).toFixed(3),
  deaths,
  ghostDeaths: deaths.filter(d => d.cause === 'UNKNOWN').length,
};
mkdirSync(outPath.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(outPath, JSON.stringify({ summary, ticks }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log('wrote', outPath);
