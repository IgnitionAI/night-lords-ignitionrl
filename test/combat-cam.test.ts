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
  offscreenMarker,
  parseCamMode,
  pickFocusNl,
  projectWorld,
  smoothCombatPose,
  worldDist,
} from '../web/combat-cam.ts';

const ASPECT = 16 / 9;

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

test('caméra combat : cadre le Terminator et un NL à 30–35 m (camp hors cône)', () => {
  const term = { x: 5, y: 12, facing: 0 };
  const nl = { x: 36, y: 12, alive: true, armTicks: 0 };
  const pose = desiredCombatPose({
    term, nls: [nl],
    aspect: ASPECT, portrait: false,
    pillars: PILLARS, arena: ARENA,
  });
  const t = projectWorld(term.x, 1.4, term.y, pose, ASPECT);
  const n = projectWorld(nl.x, 1.4, nl.y, pose, ASPECT);
  assert.ok(inFrustum(t), `T hors frustum ndc=${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}`);
  assert.ok(inFrustum(n), `NL hors frustum ndc=${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)}`);
  const dT = worldDist(pose.camX, pose.camZ, pose.camY, term.x, term.y, 1.4);
  const dN = worldDist(pose.camX, pose.camZ, pose.camY, nl.x, nl.y, 1.4);
  assert.ok(isReadableOnScreen(t, dT, FOG_CLEAR_M), `T brouillard d=${dT.toFixed(1)}`);
  assert.ok(isReadableOnScreen(n, dN, FOG_CLEAR_M), `NL brouillard d=${dN.toFixed(1)}`);
});

test('caméra combat : un NL dans le dos sort du cadre couloir mais pas du cadre combat', () => {
  const term = { x: 20, y: 12, facing: 0 };
  const rear = { x: 8, y: 12, alive: true, armTicks: 0 };
  const pose = desiredCombatPose({
    term, nls: [rear],
    aspect: ASPECT, portrait: false,
    pillars: PILLARS, arena: ARENA,
  });
  const n = projectWorld(rear.x, 1.4, rear.y, pose, ASPECT);
  const dN = worldDist(pose.camX, pose.camZ, pose.camY, rear.x, rear.y, 1.4);
  assert.ok(inFrustum(n) && isReadableOnScreen(n, dN, FOG_CLEAR_M), `dos ndc=${n.x.toFixed(2)} d=${dN.toFixed(1)}`);
  assert.ok(Math.abs(pose.orbit) <= COMBAT_CAM.orbitMax + 1e-6);
});

test('évitement des murs : l\'œil ne reste pas dans un pilier ni hors de l\'arène', () => {
  const inside = avoidWalls(10, 6, 3.2, PILLARS, ARENA);
  assert.ok(inside.camY >= COMBAT_CAM.highMax - 0.01, `hauteur ${inside.camY}`);
  const out = avoidWalls(-4, 12, 3.2, PILLARS, ARENA);
  assert.ok(out.camX >= 0.6 && out.camX <= ARENA.w - 0.6);
  assert.ok(out.camZ >= 0.6 && out.camZ <= ARENA.h - 0.6);
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
