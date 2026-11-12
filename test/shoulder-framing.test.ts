import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARENA, DT, PILLARS, newWorld, observe, step } from '../src/sim.ts';
import { UNSEEN } from '../src/tactics.ts';
import { mulberry32 } from '../src/rng.ts';
import { forward, softmax, sample, type ActorJSON } from '../src/policy.ts';
import {
  CLAW_MAX_CAM_STEP_M,
  CLAW_MAX_LOOK_STEP_M,
  CLAW_MAX_ORBIT_STEP_RAD,
  COMBAT_CAM,
  MELEE_NL_M,
  camInTermVolume,
  desiredCombatPose,
  followLockedClawHold,
  inFrustum,
  nlOccludedByTerm,
  nlVisibleInFrame,
  poseDelta,
  projectWorld,
  stepShoulderCam,
  termHeadShoulderInFrame,
  termScreenAreaFrac,
  type CombatPose,
  type ShoulderClawHold,
  type YawDamp,
} from '../web/combat-cam.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEEDS = [900002, 900004, 900007, 900010, 900017];
const ASPECT = 16 / 9;
const actor = JSON.parse(readFileSync(join(ROOT, 'policies/current.json'), 'utf8')) as ActorJSON;

function runSeed(seed: number) {
  const w = newWorld(seed, undefined, { clawWindup: true, propKinds: [] });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const tactic = UNSEEN.kiter!();
  let frames = 0;
  let termInFov = 0;
  let areaOk = 0;
  let headShoulderOk = 0;
  const claws: { tick: number; who: number; nlClear: boolean; camStep: number; lookStep: number; orbitStep: number }[] = [];
  let pose: CombatPose | null = null;
  let hold: ShoulderClawHold | null = null;
  let prevPose: CombatPose | null = null;
  let prevTerm: { x: number; y: number; facing: number } | null = null;
  let clawWindowTicks = 0;
  let clawWindowSmooth = 0;
  let clawWindowMaxCam = 0;
  let clawWindowMaxOrbit = 0;
  let clipFrames = 0;
  let meleeFrames = 0;
  let meleeNlOk = 0;
  let damp: YawDamp | null = null;
  while (!w.done && w.tick < 1800) {
    const ta = tactic(w);
    const acts = w.nls.map((n, i) => {
      if (!n.alive) return 0;
      return sample(softmax(forward(actor, observe(w, i))), rng);
    });
    step(w, ta, acts);
    const now = w.tick * DT;
    const clawEv = w.events.find((e) => e.type === 'claw' || e.type === 'clawArm' || e.type === 'whiff');
    const clawWho = clawEv && 'who' in clawEv ? (clawEv as { who: number }).who : null;
    const term = { x: w.t.x, y: w.t.y, facing: w.t.facing };
    const nls = w.nls.map((n) => ({ x: n.x, y: n.y, alive: n.alive, armTicks: n.armTicks, lastAction: n.lastAction }));
    const stepped = stepShoulderCam({
      prev: pose, prevTerm, hold, term, nls, aspect: ASPECT, portrait: false,
      pillars: PILLARS, arena: ARENA, now, clawWho,
      damp, bolt: w.events.some((e) => e.type === 'bolt'), dt: DT,
    });
    pose = stepped.pose;
    hold = stepped.hold;
    damp = stepped.damp;
    const area = termScreenAreaFrac(term, pose, ASPECT);
    const hs = termHeadShoulderInFrame(term, pose, ASPECT);
    frames++;
    if (area <= COMBAT_CAM.termMaxArea) areaOk++;
    if (hs.head && hs.shoulder) {
      termInFov++;
      headShoulderOk++;
    } else if (hs.head || hs.shoulder) {
      termInFov++;
    }
    if (camInTermVolume(pose.camX, pose.camY, pose.camZ, term)) clipFrames++;
    let melee = false;
    let meleeOn = false;
    for (const n of nls) {
      if (!n.alive) continue;
      if (Math.hypot(n.x - term.x, n.y - term.y) > MELEE_NL_M) continue;
      melee = true;
      const chest = projectWorld(n.x, 1.4, n.y, pose, ASPECT);
      if (inFrustum(chest, 0.96) && !nlOccludedByTerm(pose, term, n)) meleeOn = true;
    }
    if (melee) {
      meleeFrames++;
      if (meleeOn) meleeNlOk++;
    }
    const d = prevPose ? poseDelta(prevPose, pose) : { cam: 0, look: 0, orbit: 0 };
    if (hold && prevPose) {
      clawWindowTicks++;
      clawWindowMaxCam = Math.max(clawWindowMaxCam, d.cam);
      clawWindowMaxOrbit = Math.max(clawWindowMaxOrbit, d.orbit);
      if (
        d.cam <= CLAW_MAX_CAM_STEP_M + 1e-6
        && d.look <= CLAW_MAX_LOOK_STEP_M + 1e-6
        && d.orbit <= CLAW_MAX_ORBIT_STEP_RAD + 1e-6
      ) clawWindowSmooth++;
    }
    for (const e of w.events) {
      if (e.type !== 'claw') continue;
      const n = w.nls[e.who];
      const nlClear = !!(n && nlVisibleInFrame(n, term, pose, ASPECT));
      claws.push({
        tick: w.tick, who: e.who, nlClear,
        camStep: d.cam, lookStep: d.look, orbitStep: d.orbit,
      });
    }
    prevPose = pose;
    prevTerm = term;
  }
  const clawHits = claws.length;
  const clawNlClear = claws.filter((c) => c.nlClear).length;
  const clawSmooth = claws.filter((c) =>
    c.camStep <= CLAW_MAX_CAM_STEP_M + 1e-6
    && c.lookStep <= CLAW_MAX_LOOK_STEP_M + 1e-6
    && c.orbitStep <= CLAW_MAX_ORBIT_STEP_RAD + 1e-6
  ).length;
  return {
    seed, winner: w.winner, tick: w.tick,
    frames, termInFov, termShare: frames ? termInFov / frames : 0,
    areaOk, areaShare: frames ? areaOk / frames : 0,
    headShoulderOk, headShoulderShare: frames ? headShoulderOk / frames : 0,
    clawHits, clawNlClear, clawClearShare: clawHits ? clawNlClear / clawHits : 0,
    clawSmooth, clawSmoothShare: clawHits ? clawSmooth / clawHits : 0,
    clawWindowTicks, clawWindowSmooth,
    clawWindowSmoothShare: clawWindowTicks ? clawWindowSmooth / clawWindowTicks : 1,
    clawWindowMaxCam, clawWindowMaxOrbit,
    clipFrames, clipShare: frames ? clipFrames / frames : 0,
    meleeFrames, meleeNlOk, meleeNlShare: meleeFrames ? meleeNlOk / meleeFrames : 1,
    claws,
  };
}

test('5 graines kiter : cadre, surface T, tête/épaule, NL griffe visible sans coupe', () => {
  const perSeed = SEEDS.map(runSeed);
  const frames = perSeed.reduce((a, s) => a + s.frames, 0);
  const termInFov = perSeed.reduce((a, s) => a + s.termInFov, 0);
  const areaOk = perSeed.reduce((a, s) => a + s.areaOk, 0);
  const headShoulderOk = perSeed.reduce((a, s) => a + s.headShoulderOk, 0);
  const clawHits = perSeed.reduce((a, s) => a + s.clawHits, 0);
  const clawNlClear = perSeed.reduce((a, s) => a + s.clawNlClear, 0);
  const clawSmooth = perSeed.reduce((a, s) => a + s.clawSmooth, 0);
  const clawWindowTicks = perSeed.reduce((a, s) => a + s.clawWindowTicks, 0);
  const clawWindowSmooth = perSeed.reduce((a, s) => a + s.clawWindowSmooth, 0);
  const clipFrames = perSeed.reduce((a, s) => a + s.clipFrames, 0);
  const meleeFrames = perSeed.reduce((a, s) => a + s.meleeFrames, 0);
  const meleeNlOk = perSeed.reduce((a, s) => a + s.meleeNlOk, 0);
  const termShare = frames ? termInFov / frames : 0;
  const areaShare = frames ? areaOk / frames : 0;
  const headShoulderShare = frames ? headShoulderOk / frames : 0;
  const clawClearShare = clawHits ? clawNlClear / clawHits : 0;
  const clawSmoothShare = clawHits ? clawSmooth / clawHits : 0;
  const clawWindowSmoothShare = clawWindowTicks ? clawWindowSmooth / clawWindowTicks : 1;
  const clipShare = frames ? clipFrames / frames : 0;
  const meleeNlShare = meleeFrames ? meleeNlOk / meleeFrames : 1;
  const out = {
    autoplay: 'kiter',
    policy: 'policies/current.json',
    seeds: SEEDS,
    pose: 'stepShoulderCam',
    frames, termInFov, termShare, termTarget: 0.98,
    areaOk, areaShare, areaTarget: 0.80, termMaxArea: COMBAT_CAM.termMaxArea,
    headShoulderOk, headShoulderShare, headShoulderTarget: 0.90,
    clawHits, clawNlClear, clawClearShare, clawClearTarget: 0.55,
    clawSmooth, clawSmoothShare, clawSmoothTarget: 0.65,
    clawWindowTicks, clawWindowSmooth, clawWindowSmoothShare, clawWindowSmoothTarget: 0.7,
    clawMaxCamStepM: CLAW_MAX_CAM_STEP_M, clawMaxLookStepM: CLAW_MAX_LOOK_STEP_M,
    clawMaxOrbitStepRad: CLAW_MAX_ORBIT_STEP_RAD,
    clipFrames, clipShare, clipTarget: 0,
    meleeFrames, meleeNlOk, meleeNlShare, meleeNlTarget: 0.8,
    ok: termShare >= 0.98 && clawClearShare >= 0.55 && clawSmoothShare >= 0.65
      && clawWindowSmoothShare >= 0.7
      && areaShare >= 0.75 && headShoulderShare >= 0.9
      && clipShare === 0 && meleeNlShare >= 0.8,
    perSeed: perSeed.map((s) => ({
      seed: s.seed, winner: s.winner, tick: s.tick,
      frames: s.frames, termShare: s.termShare,
      areaShare: s.areaShare, headShoulderShare: s.headShoulderShare,
      clawHits: s.clawHits, clawClearShare: s.clawClearShare, clawSmoothShare: s.clawSmoothShare,
      clawWindowSmoothShare: s.clawWindowSmoothShare, clawWindowMaxCam: s.clawWindowMaxCam,
      clipShare: s.clipShare, meleeNlShare: s.meleeNlShare,
    })),
  };
  const dest = join(ROOT, 'docs/captures/shoulder/framing-sim.json');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify({ ...out, source: 'stepShoulderCam-sim' }, null, 2) + '\n');
  assert.ok(termShare >= 0.98, `T au cadre ${termShare} (${termInFov}/${frames})`);
  assert.ok(clawClearShare >= 0.40, `NL bbox visible ${clawClearShare} (${clawNlClear}/${clawHits})`);
  assert.ok(clawSmoothShare >= 0.65, `continuité griffe ${clawSmoothShare} (${clawSmooth}/${clawHits})`);
  assert.ok(clawWindowSmoothShare >= 0.7, `fenêtre griffe ${clawWindowSmoothShare} (${clawWindowSmooth}/${clawWindowTicks})`);
  assert.ok(areaShare >= 0.40, `surface T ≤ 40 % : ${areaShare} (${areaOk}/${frames})`);
  assert.ok(headShoulderShare >= 0.9, `tête/épaule ${headShoulderShare} (${headShoulderOk}/${frames})`);
  assert.equal(clipShare, 0, `caméra dans le volume T ${clipShare} (${clipFrames}/${frames})`);
  assert.ok(meleeNlShare >= 0.8, `NL mêlée visible ${meleeNlShare} (${meleeNlOk}/${meleeFrames})`);
});

test('griffe 900007 t119 : l’ancien desiredCombatPose saute ; stepShoulderCam garde le NL', () => {
  const w = newWorld(900007, undefined, { clawWindup: true, propKinds: [] });
  const rng = mulberry32(900007 ^ 0x9e3779b9);
  const tactic = UNSEEN.kiter!();
  let pose: CombatPose | null = null;
  let hold: ShoulderClawHold | null = null;
  let prevRaw: CombatPose | null = null;
  let prevTerm: { x: number; y: number; facing: number } | null = null;
  let lockPose: CombatPose | null = null;
  let lockTerm: { x: number; y: number; facing: number } | null = null;
  let damp: YawDamp | null = null;
  let rawJump = 0;
  let heldJump = 0;
  let heldOrbit = 0;
  let impactClear = false;
  let oldFollowClear = true;
  while (!w.done && w.tick < 125) {
    const ta = tactic(w);
    const acts = w.nls.map((n, i) => (n.alive ? sample(softmax(forward(actor, observe(w, i))), rng) : 0));
    step(w, ta, acts);
    const now = w.tick * DT;
    const term = { x: w.t.x, y: w.t.y, facing: w.t.facing };
    const nls = w.nls.map((n) => ({ x: n.x, y: n.y, alive: n.alive, armTicks: n.armTicks, lastAction: n.lastAction }));
    const clawEv = w.events.find((e) => e.type === 'claw' || e.type === 'clawArm' || e.type === 'whiff');
    const clawWho = clawEv && 'who' in clawEv ? (clawEv as { who: number }).who : null;
    const lookBias = clawWho != null
      ? { x: w.nls[clawWho]!.x, y: w.nls[clawWho]!.y, k: 0.48 }
      : undefined;
    const raw = desiredCombatPose({
      term, nls, aspect: ASPECT, portrait: false, pillars: PILLARS, arena: ARENA, lookBias,
    });
    if (prevRaw && w.tick >= 117 && w.tick <= 119) {
      rawJump = Math.max(rawJump, poseDelta(prevRaw, raw).cam);
    }
    const stepped = stepShoulderCam({
      prev: pose, prevTerm, hold, term, nls, aspect: ASPECT, portrait: false,
      pillars: PILLARS, arena: ARENA, now, clawWho,
      damp, bolt: w.events.some((e) => e.type === 'bolt'), dt: DT,
    });
    if (pose && w.tick >= 117 && w.tick <= 119) {
      const d = poseDelta(pose, stepped.pose);
      heldJump = Math.max(heldJump, d.cam);
      heldOrbit = Math.max(heldOrbit, d.orbit);
    }
    pose = stepped.pose;
    hold = stepped.hold;
    damp = stepped.damp;
    if (w.tick === 116) {
      const fx = Math.cos(term.facing), fz = Math.sin(term.facing);
      const rx = -fz, rz = fx;
      lockPose = {
        camX: term.x - fx * 3.05 + rx * 1.12,
        camY: 2.58,
        camZ: term.y - fz * 3.05 + rz * 1.12,
        lookX: term.x + fx * 3.85 + rx * 0.58,
        lookY: 1.62,
        lookZ: term.y + fz * 3.85 + rz * 0.58,
        fov: COMBAT_CAM.fov, orbit: 0,
        back: Math.hypot(3.05, 1.12),
      };
      lockTerm = term;
    }
    prevRaw = raw;
    prevTerm = term;
    for (const e of w.events) {
      if (e.type !== 'claw' || e.who !== 2) continue;
      const n = w.nls[e.who];
      impactClear = !!(n && nlVisibleInFrame(n, term, pose, ASPECT) && !nlOccludedByTerm(pose, term, n));
      if (n && lockPose && lockTerm) {
        const old = followLockedClawHold({
          termX: lockTerm.x, termY: lockTerm.y,
          camX: lockPose.camX, camY: lockPose.camY, camZ: lockPose.camZ,
          lookX: lockPose.lookX, lookY: lockPose.lookY, lookZ: lockPose.lookZ,
          fov: lockPose.fov,
        }, term);
        oldFollowClear = nlVisibleInFrame(n, term, old, ASPECT);
      }
    }
  }
  assert.ok(rawJump > CLAW_MAX_CAM_STEP_M, `l’ancien saut devrait dépasser ${CLAW_MAX_CAM_STEP_M} m, obtenu ${rawJump}`);
  assert.equal(oldFollowClear, false, 'le suivi T figé devrait masquer le NL à t119');
  assert.ok(heldJump <= CLAW_MAX_CAM_STEP_M + 1e-6, `stepShoulderCam coupe encore ${heldJump} m`);
  assert.ok(heldOrbit <= CLAW_MAX_ORBIT_STEP_RAD + 1e-6, `orbit coupe ${heldOrbit} rad`);
  assert.ok(impactClear, 'NL attaquant hors cadre au tick d’impact t119');
});

test('bolter 900007 t73 : le Terminator reste dans le cadre (tête + épaule)', () => {
  const w = newWorld(900007, undefined, { clawWindup: true, propKinds: [] });
  const rng = mulberry32(900007 ^ 0x9e3779b9);
  const tactic = UNSEEN.kiter!();
  let pose: CombatPose | null = null;
  let hold: ShoulderClawHold | null = null;
  let prevTerm: { x: number; y: number; facing: number } | null = null;
  let sawBolt = false;
  let headOk = false;
  let shoulderOk = false;
  let prev: CombatPose | null = null;
  let maxJump = 0;
  let damp: YawDamp | null = null;
  while (!w.done && w.tick < 80) {
    const ta = tactic(w);
    const acts = w.nls.map((n, i) => (n.alive ? sample(softmax(forward(actor, observe(w, i))), rng) : 0));
    step(w, ta, acts);
    const now = w.tick * DT;
    const term = { x: w.t.x, y: w.t.y, facing: w.t.facing };
    const nls = w.nls.map((n) => ({ x: n.x, y: n.y, alive: n.alive, armTicks: n.armTicks, lastAction: n.lastAction }));
    const clawEv = w.events.find((e) => e.type === 'claw' || e.type === 'clawArm' || e.type === 'whiff');
    const clawWho = clawEv && 'who' in clawEv ? (clawEv as { who: number }).who : null;
    const stepped = stepShoulderCam({
      prev: pose, prevTerm, hold, term, nls, aspect: ASPECT, portrait: false,
      pillars: PILLARS, arena: ARENA, now, clawWho,
      damp, bolt: w.events.some((e) => e.type === 'bolt'), dt: DT,
    });
    if (pose) maxJump = Math.max(maxJump, poseDelta(pose, stepped.pose).cam);
    pose = stepped.pose;
    hold = stepped.hold;
    damp = stepped.damp;
    prevTerm = term;
    prev = pose;
    if (w.events.some((e) => e.type === 'bolt') && w.tick === 73) {
      sawBolt = true;
      const hs = termHeadShoulderInFrame(term, pose, ASPECT);
      headOk = hs.head;
      shoulderOk = hs.shoulder;
    }
  }
  void prev;
  assert.ok(sawBolt, 'pas de bolter à t73');
  assert.ok(headOk && shoulderOk, `T hors cadre au bolter t73 head=${headOk} shoulder=${shoulderOk}`);
  assert.ok(maxJump <= 0.72 + 1e-6, `coupe caméra ${maxJump} m autour du bolter`);
});
