import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, PILLARS } from '../src/sim.ts';
import {
  COMBAT_CAM,
  FOG_CLEAR_M,
  MELEE_LIFT,
  MELEE_LOS_PAD,
  avoidWalls,
  distToPillars,
  desiredCombatPose,
  inFrustum,
  isReadableOnScreen,
  keepTermFramed,
  liftFollowIfOccluded,
  losClear,
  offscreenMarker,
  huntThreatCount,
  huntTremor,
  pickFocusNl,
  projectWorld,
  screenHeightFrac,
  smoothCombatPose,
  worldDist,
} from '../web/combat-cam.ts';

const ASPECT = 16 / 9;

function poseOf(term: { x: number; y: number; facing: number }, nls: { x: number; y: number; alive: boolean; armTicks?: number }[]) {
  return desiredCombatPose({
    term, nls, aspect: ASPECT, portrait: false, pillars: PILLARS, arena: ARENA,
  });
}

test('pickFocusNl : le plus proche vivant, sinon le plus menaçant (griffes armées)', () => {
  const term = { x: 10, y: 12, facing: 0 };
  const none = pickFocusNl(term, [
    { x: 20, y: 12, alive: false },
    { x: 15, y: 12, alive: false },
  ]);
  assert.equal(none, null);

  const closest = pickFocusNl(term, [
    { x: 30, y: 12, alive: true, armTicks: 0 },
    { x: 14, y: 12, alive: true, armTicks: 0 },
    { x: 22, y: 18, alive: true, armTicks: 0 },
  ]);
  assert.equal(closest, 1);

  const armed = pickFocusNl(term, [
    { x: 18, y: 12, alive: true, armTicks: 0 },
    { x: 16, y: 14, alive: true, armTicks: 2 },
    { x: 12, y: 12, alive: true, armTicks: 0 },
  ]);
  assert.equal(armed, 1);
});

test('caméra épaule : Terminator toujours cadré (marge) et ≥ 18 % de hauteur, camp à 31 m hors priorité', () => {
  const term = { x: 5, y: 12, facing: 0 };
  const nl = { x: 36, y: 12, alive: true, armTicks: 0 };
  const pose = poseOf(term, [nl]);
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  assert.ok(inFrustum(t, COMBAT_CAM.termMargin), `T hors marge ndc=${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}`);
  const h = screenHeightFrac(term.x, term.y, pose, ASPECT);
  assert.ok(h >= COMBAT_CAM.termMinScreen, `T trop petit ${(h * 100).toFixed(1)} %`);
  const dT = worldDist(pose.camX, pose.camY, pose.camZ, term.x, 1.4, term.y);
  assert.ok(isReadableOnScreen(t, dT, FOG_CLEAR_M), `T brouillard d=${dT.toFixed(1)}`);
  assert.ok(losClear(pose.camX, pose.camY, pose.camZ, term.x, 1.4, term.y, PILLARS), 'LOS T bouché');
});

test('caméra épaule : NL à ~18 m devant reste dans le cône avec le Terminator', () => {
  const term = { x: 8, y: 12, facing: 0 };
  const nl = { x: 26, y: 12, alive: true, armTicks: 0 };
  const pose = poseOf(term, [nl]);
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  const n = projectWorld(nl.x, 1.4, nl.y, pose, ASPECT);
  assert.ok(inFrustum(t, COMBAT_CAM.termMargin), `T hors marge ${t.x.toFixed(2)}`);
  assert.ok(inFrustum(n, 0.96), `NL hors frustum ndc=${n.x.toFixed(2)},${n.y.toFixed(2)}`);
  const dN = worldDist(pose.camX, pose.camY, pose.camZ, nl.x, 1.4, nl.y);
  assert.ok(isReadableOnScreen(n, dN, FOG_CLEAR_M), `NL brouillard d=${dN.toFixed(1)}`);
  assert.ok(screenHeightFrac(term.x, term.y, pose, ASPECT) >= COMBAT_CAM.termMinScreen);
});

test('caméra épaule : poing alcôve (t154 kiter) T + cible visibles, LOS hors fût', () => {
  const term = { x: 12.30, y: 8.33, facing: 2.4 };
  const nl = { x: 10.06, y: 9.46, alive: true, armTicks: 2 };
  const pose = poseOf(term, [nl]);
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  const n = projectWorld(nl.x, 1.4, nl.y, pose, ASPECT);
  assert.ok(inFrustum(t, 0.88), `T hors cadre ndc=${t.x.toFixed(2)},${t.y.toFixed(2)}`);
  assert.ok(inFrustum(n, 0.92), `NL hors cadre ndc=${n.x.toFixed(2)},${n.y.toFixed(2)}`);
  assert.ok(
    losClear(pose.camX, pose.camY, pose.camZ, term.x, 1.4, term.y, PILLARS, MELEE_LOS_PAD),
    `LOS T bouché cam=(${pose.camX.toFixed(2)},${pose.camY.toFixed(2)},${pose.camZ.toFixed(2)})`,
  );
  assert.ok(
    losClear(pose.camX, pose.camY, pose.camZ, nl.x, 1.4, nl.y, PILLARS, MELEE_LOS_PAD),
    `LOS cible bouché cam=(${pose.camX.toFixed(2)},${pose.camY.toFixed(2)},${pose.camZ.toFixed(2)})`,
  );
  assert.ok(pose.camY <= MELEE_LIFT + 0.02, `caméra dans les poutres y=${pose.camY.toFixed(2)}`);
});

test('caméra épaule : poing (T + NL à 2 m) les deux dans le cadre', () => {
  const term = { x: 20, y: 12, facing: 0.4 };
  const nl = { x: 21.6, y: 13.1, alive: true, armTicks: 2 };
  const pose = poseOf(term, [nl]);
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  const n = projectWorld(nl.x, 1.4, nl.y, pose, ASPECT);
  assert.ok(inFrustum(t, 0.88), `T hors marge ${t.x.toFixed(2)}`);
  assert.ok(inFrustum(n, 0.96), `NL hors frustum ndc=${n.x.toFixed(2)},${n.y.toFixed(2)}`);
});

test('caméra épaule : un NL dans le dos ne vole pas le cadre ; T reste ancré', () => {
  const term = { x: 20, y: 12, facing: 0 };
  const rear = { x: 8, y: 12, alive: true, armTicks: 0 };
  const pose = poseOf(term, [rear]);
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  assert.ok(inFrustum(t, COMBAT_CAM.termMargin), `T perdu en cadrant le dos`);
  const fx = Math.cos(term.facing), fz = Math.sin(term.facing);
  const rx = -fz, rz = fx;
  const behind = -((pose.camX - term.x) * fx + (pose.camZ - term.y) * fz);
  const right = (pose.camX - term.x) * rx + (pose.camZ - term.y) * rz;
  assert.ok(behind > 0.15, `pas derrière T behind=${behind.toFixed(2)}`);
  assert.ok(right > 0.08, `pas à l'épaule droite right=${right.toFixed(2)}`);
  assert.ok(Math.abs(pose.orbit) <= COMBAT_CAM.orbitMax + 1e-6);
  const mark = offscreenMarker(projectWorld(rear.x, 1.4, rear.y, pose, ASPECT));
  assert.ok(mark.visible || !inFrustum(projectWorld(rear.x, 1.4, rear.y, pose, ASPECT), 0.999));
});

test('évitement des murs : l\'œil ne reste pas dans un pilier ni hors de l\'arène', () => {
  const inside = avoidWalls(10, 6, 3.2, PILLARS, ARENA);
  assert.ok(inside.camY >= COMBAT_CAM.highMax - 0.01, `hauteur ${inside.camY}`);
  const out = avoidWalls(-4, 12, 3.2, PILLARS, ARENA);
  assert.ok(out.camX >= 0.6 && out.camX <= ARENA.w - 0.6);
  assert.ok(out.camZ >= 0.6 && out.camZ <= ARENA.h - 0.6);
});

test('liftFollowIfOccluded : même losClear que le combat, monte si le rayon coupe un pilier', () => {
  const term = { x: 20, y: 12 };
  const behindX = 14.2, behindZ = 12, behindY = 2.32;
  const blocked = !losClear(behindX, behindY, behindZ, term.x, 1.4, term.y, PILLARS);
  const lifted = liftFollowIfOccluded(
    behindX, behindY, behindZ,
    term.x, term.y,
    1, 0, 0, 1,
    5.8, 1.18,
    PILLARS, ARENA, 4.9,
  );
  assert.ok(losClear(lifted.camX, lifted.camY, lifted.camZ, term.x, 1.4, term.y, PILLARS), 'LOS encore bouché après lift');
  if (blocked) assert.ok(lifted.camY >= 4.89 || Math.hypot(lifted.camX - term.x, lifted.camZ - term.y) < 5.8);
});

test('liftFollowIfOccluded : cible melee derrière un fût → lift au-dessus du chapiteau', () => {
  const term = { x: 12.30, y: 8.33 };
  const nl = { x: 10.06, y: 9.46 };
  const camX = 13.88, camY = 2.82, camZ = 7.10;
  const lifted = liftFollowIfOccluded(
    camX, camY, camZ,
    term.x, term.y,
    1, 0, 0, 1,
    2.6, 0.4,
    PILLARS, ARENA, COMBAT_CAM.highMax,
    nl.x, nl.y,
  );
  assert.ok(
    losClear(lifted.camX, lifted.camY, lifted.camZ, term.x, 1.4, term.y, PILLARS, MELEE_LOS_PAD),
    'LOS T après lift cible',
  );
  assert.ok(
    losClear(lifted.camX, lifted.camY, lifted.camZ, nl.x, 1.4, nl.y, PILLARS, MELEE_LOS_PAD),
    `LOS cible après lift cam=(${lifted.camX.toFixed(2)},${lifted.camY.toFixed(2)},${lifted.camZ.toFixed(2)})`,
  );
  assert.ok(lifted.camY <= MELEE_LIFT + 0.05, `lift dans les poutres ${lifted.camY}`);
});

test('raycast : la pose combat ne traverse pas un pilier entre l\'œil et le Terminator', () => {
  const term = { x: 20, y: 12, facing: 0 };
  const nl = { x: 28, y: 12, alive: true, armTicks: 0 };
  const pose = poseOf(term, [nl]);
  assert.ok(
    losClear(pose.camX, pose.camY, pose.camZ, term.x, 1.4, term.y, PILLARS),
    `LOS T cam=(${pose.camX.toFixed(1)},${pose.camY.toFixed(1)},${pose.camZ.toFixed(1)})`,
  );
});

test('lissage : un saut de pose est absorbé, pas un à-coup', () => {
  const a = { camX: 8, camY: 3.4, camZ: 12, lookX: 14, lookY: 1.3, lookZ: 12, fov: 52, orbit: 0, back: 9 };
  const b = { ...a, camX: 18, camZ: 18, lookX: 28, lookZ: 6 };
  const s = smoothCombatPose(a, b, 0.1);
  const jump = Math.hypot(s.camX - a.camX, s.camZ - a.camZ);
  const full = Math.hypot(b.camX - a.camX, b.camZ - a.camZ);
  assert.ok(jump < full * 0.5, `saut ${jump} vs ${full}`);
  assert.ok(jump > 0.05);
});

test('épaule droite : la caméra est derrière et à droite du Terminator', () => {
  const term = { x: 16, y: 12, facing: 0.3 };
  const pose = poseOf(term, [{ x: 22, y: 13, alive: true, armTicks: 0 }]);
  const fx = Math.cos(term.facing), fz = Math.sin(term.facing);
  const rx = -fz, rz = fx;
  const behind = -((pose.camX - term.x) * fx + (pose.camZ - term.y) * fz);
  const right = (pose.camX - term.x) * rx + (pose.camZ - term.y) * rz;
  assert.ok(behind > 2.2 && behind < 3.6, `recul ${behind.toFixed(2)}`);
  assert.ok(right > 0.35 && right < 1.75, `côté ${right.toFixed(2)}`);
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  assert.ok(inFrustum(t, COMBAT_CAM.termMargin));
});

test('whip vers un NL dans le dos : le Terminator reste cadré', () => {
  const term = { x: 20, y: 12, facing: 0 };
  const rear = { x: 8, y: 12, alive: true, armTicks: 2 };
  const pose = desiredCombatPose({
    term, nls: [rear], aspect: ASPECT, portrait: false, pillars: PILLARS, arena: ARENA,
    lookBias: { x: rear.x, y: rear.y, k: 0.85 },
  });
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  assert.ok(inFrustum(t, 0.82), `T perdu au whip ndc=${t.x.toFixed(2)},${t.y.toFixed(2)}`);
  const fx = Math.cos(term.facing), fz = Math.sin(term.facing);
  const behind = -((pose.camX - term.x) * fx + (pose.camZ - term.y) * fz);
  assert.ok(Math.hypot(pose.camX - term.x, pose.camZ - term.y) < 4.4, `whip trop loin`);
});

test('filet keepTermFramed : un recul follow-cam est ramené à l\'épaule', () => {
  const term = { x: 16, y: 12, facing: 0 };
  const wide = {
    camX: 10, camY: 3.1, camZ: 12,
    lookX: 28, lookY: 1.4, lookZ: 12,
    fov: 58, orbit: 0.8, back: 6,
  };
  const pose = keepTermFramed(wide, term, ASPECT);
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  assert.ok(inFrustum(t, 0.82), `T hors cadre après filet ndc=${t.x.toFixed(2)}`);
  const fx = Math.cos(term.facing), fz = Math.sin(term.facing);
  const behind = -((pose.camX - term.x) * fx + (pose.camZ - term.y) * fz);
  assert.ok(behind < 3.7, `filet trop loin ${behind.toFixed(2)}`);
});

test('menace hors vue : compte + tremblement croît avec le nombre de NL proches', () => {
  const term = { x: 10, y: 12, facing: 0 };
  const nls = [
    { x: 12, y: 12, alive: true },
    { x: 11, y: 14, alive: true },
    { x: 40, y: 12, alive: true },
    { x: 9, y: 11, alive: false },
  ];
  assert.equal(huntThreatCount(term, nls, 9), 2);
  const a = huntTremor(0, 1.2);
  const b = huntTremor(3, 1.2);
  assert.ok(Math.hypot(b.sx, b.sz) > Math.hypot(a.sx, a.sz));
});

test('marqueur hors écran : un NDC hors cadre donne une direction de bord', () => {
  const m = offscreenMarker({ x: 1.8, y: 0.2, z: 0.4 });
  assert.ok(m.visible);
  assert.ok(m.nx > 0.3);
  const on = offscreenMarker({ x: 0.1, y: -0.2, z: 0.4 });
  assert.equal(on.visible, false);
});
