import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, PILLARS } from '../src/sim.ts';
import {
  COMBAT_CAM,
  FOG_CLEAR_M,
  avoidWalls,
  desiredCombatPose,
  inFrustum,
  isReadableOnScreen,
  liftFollowIfOccluded,
  losClear,
  offscreenMarker,
  parseCamMode,
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

test('caméra combat : Terminator toujours cadré (marge) et ≥ 8 % de hauteur, camp à 31 m hors priorité', () => {
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

test('caméra combat : NL à ~18 m dans le cadre avec le Terminator', () => {
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

test('caméra combat : poing (T + NL à 2 m) les deux dans le cadre', () => {
  const term = { x: 20, y: 12, facing: 0.4 };
  const nl = { x: 21.6, y: 13.1, alive: true, armTicks: 2 };
  const pose = poseOf(term, [nl]);
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  const n = projectWorld(nl.x, 1.4, nl.y, pose, ASPECT);
  assert.ok(inFrustum(t, COMBAT_CAM.termMargin), `T hors marge ${t.x.toFixed(2)}`);
  assert.ok(inFrustum(n, 0.96), `NL hors frustum ndc=${n.x.toFixed(2)},${n.y.toFixed(2)}`);
  assert.ok(screenHeightFrac(term.x, term.y, pose, ASPECT) >= COMBAT_CAM.termMinScreen);
  assert.ok(losClear(pose.camX, pose.camY, pose.camZ, term.x, 1.4, term.y, PILLARS), 'LOS T poing');
  const dT = worldDist(pose.camX, pose.camY, pose.camZ, term.x, 1.4, term.y);
  assert.ok(dT <= 6.5, `caméra poing trop loin d=${dT.toFixed(1)}`);
});

test('caméra combat : un NL dans le dos sort du cadre couloir mais pas du cadre combat', () => {
  const term = { x: 20, y: 12, facing: 0 };
  const rear = { x: 8, y: 12, alive: true, armTicks: 0 };
  const pose = poseOf(term, [rear]);
  const n = projectWorld(rear.x, 1.4, rear.y, pose, ASPECT);
  const dN = worldDist(pose.camX, pose.camY, pose.camZ, rear.x, 1.4, rear.y);
  assert.ok(inFrustum(n) && isReadableOnScreen(n, dN, FOG_CLEAR_M), `dos ndc=${n.x.toFixed(2)} d=${dN.toFixed(1)}`);
  assert.ok(Math.abs(pose.orbit) <= COMBAT_CAM.orbitMax + 1e-6);
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  assert.ok(inFrustum(t, COMBAT_CAM.termMargin), `T perdu en cadrant le dos`);
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

test('parseCamMode : combat par défaut, couloir sur ?cam=couloir', () => {
  assert.equal(parseCamMode(null), 'combat');
  assert.equal(parseCamMode('couloir'), 'couloir');
  assert.equal(parseCamMode('epaule'), 'epaule');
  assert.equal(parseCamMode('troisquarts'), 'troisquarts');
});

test('marqueur hors écran : un NDC hors cadre donne une direction de bord', () => {
  const m = offscreenMarker({ x: 1.8, y: 0.2, z: 0.4 });
  assert.ok(m.visible);
  assert.ok(m.nx > 0.3);
  const on = offscreenMarker({ x: 0.1, y: -0.2, z: 0.4 });
  assert.equal(on.visible, false);
});
