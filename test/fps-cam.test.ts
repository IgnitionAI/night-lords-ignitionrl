import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PILLARS, ARENA, T_CFG, NL_CFG } from '../src/sim.ts';
import {
  parseCamMode, fpsPose, unclipEye, applyLookDelta, freshLook, turnTowardYaw,
  FPS_EYE, FPS_PITCH_MIN, FPS_PITCH_MAX, FPS_BOB, FPS_EXPOSURE, FPS_FOG_DENSITY,
  pushStepImpulse, bobAt,   wrapPi, pickFpsThreat, eventAimHint, steerFpsLook,
  pickAutoplayFocus, nlInLook, MELEE_AIM_M,
} from '../web/camera/fps.ts';
import { createViewmodel } from '../web/camera/viewmodel.ts';
import { TONE_MAPPING_EXPOSURE, FOG_EXP2_DENSITY } from '../web/atmosphere.ts';
import { fpsHudMarkup, dmgSide } from '../web/camera/fps-hud.ts';
import { matchStatus, hudMarkup } from '../src/match.ts';
import { newWorld } from '../src/sim.ts';
import { TERM_HEIGHT } from '../web/stride.ts';

test('cam=fps est le défaut ; couloir / epaule / troisquarts restent', () => {
  assert.equal(parseCamMode(null), 'fps');
  assert.equal(parseCamMode(''), 'fps');
  assert.equal(parseCamMode('fps'), 'fps');
  assert.equal(parseCamMode('couloir'), 'couloir');
  assert.equal(parseCamMode('epaule'), 'epaule');
  assert.equal(parseCamMode('troisquarts'), 'troisquarts');
  assert.equal(parseCamMode('combat'), 'combat');
});

test('œil FPS = hauteur de visor Dreadnought (~2,18 m)', () => {
  assert.ok(Math.abs(FPS_EYE - TERM_HEIGHT * 0.838) < 1e-9);
  assert.ok(FPS_EYE > 2.05 && FPS_EYE < 2.30);
});

test('pitch clampé ; yaw wrap', () => {
  const look = freshLook(0);
  applyLookDelta(look, 0, -1e6, 1);
  assert.equal(look.pitch, FPS_PITCH_MAX);
  applyLookDelta(look, 0, 1e6, 1);
  assert.equal(look.pitch, FPS_PITCH_MIN);
  applyLookDelta(look, 8000, 0, 1);
  assert.ok(look.yaw <= Math.PI && look.yaw >= -Math.PI);
});

test('turn souris ne casse pas ZQSD : consigne bornée [-1,1]', () => {
  const t = turnTowardYaw(0, 0.4, T_CFG.turnMax, 0.1);
  assert.ok(t > 0 && t <= 1);
  assert.equal(turnTowardYaw(0, 0, T_CFG.turnMax, 0.1), 0);
});

test('bob de pas : impulsion lourde, pas flottante (ω élevé, z amorti)', () => {
  assert.ok(FPS_BOB.w >= 18);
  assert.ok(FPS_BOB.z >= 0.6);
  const imps: { t0: number; v: number; foot: 0 | 1 }[] = [];
  pushStepImpulse(imps, 0, 1, 0);
  const a = bobAt(imps, 0.04);
  const b = bobAt(imps, 0.20);
  assert.ok(Math.abs(a.y) > 0.001);
  assert.ok(Math.abs(b.y) < Math.abs(a.y) * 3);
  assert.ok(Math.abs(a.y) < 0.08, `bob trop ample ${a.y}`);
});

test('œil poussé hors pilier et hors arène', () => {
  const p = PILLARS[0]!;
  const inside = unclipEye((p.x0 + p.x1) / 2, FPS_EYE, (p.y0 + p.y1) / 2, PILLARS, ARENA);
  const stillIn = PILLARS.some((b) =>
    inside.x > b.x0 - 0.28 && inside.x < b.x1 + 0.28 && inside.z > b.y0 - 0.28 && inside.z < b.y1 + 0.28);
  assert.equal(stillIn, false);
  const wall = unclipEye(-2, FPS_EYE, 12, PILLARS, ARENA);
  assert.ok(wall.x >= 0.28);
});

test('pose FPS : hauteur d\'œil, look devant', () => {
  const pose = fpsPose({
    x: 8, y: 12, yaw: 0, pitch: 0, now: 0.5, steps: [],
    shake: { sx: 0, sz: 0 }, pillars: PILLARS, arena: ARENA, impact: true,
  });
  assert.ok(Math.abs(pose.camY - FPS_EYE) < 0.04);
  assert.ok(pose.lookX > pose.camX);
});

test('HUD casque : armure, munitions, gantelet, alarme — pas le pavé 3e personne', () => {
  const w = newWorld(5, { x: 3, y: 12, facing: 0 });
  const s = matchStatus(w);
  const html = fpsHudMarkup(s, {
    roundNo: 1, score: { pack: 0, term: 0 }, alarmOn: true, servoAlarm: true,
  });
  assert.match(html, /ARMURE/);
  assert.match(html, /BOLTER/);
  assert.match(html, /GANTELET/);
  assert.match(html, /ALARME SERVO/);
  assert.doesNotMatch(html, /Objectif : tenez/);
  const classic = hudMarkup(s, { roundNo: 1, score: { pack: 0, term: 0 } });
  assert.match(classic, /Objectif/);
});

test('indicateurs de dégâts : rear → back, flanc selon l\'angle', () => {
  assert.equal(dmgSide('rear', Math.PI, 0), 'back');
  assert.equal(dmgSide('front', 0, 0), 'front');
  assert.equal(dmgSide('side', Math.PI / 2, 0), 'left');
  assert.equal(dmgSide('side', -Math.PI / 2, 0), 'right');
});

test('invariants sim inchangés (cette PR ne touche pas src/sim.ts)', () => {
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
  assert.equal(wrapPi(0), 0);
});

test('FPS éclaire plus que le couloir 3e personne (expo / fog)', () => {
  assert.ok(FPS_EXPOSURE > TONE_MAPPING_EXPOSURE);
  assert.ok(FPS_FOG_DENSITY < FOG_EXP2_DENSITY);
});

test('visée autoplay : griffe armée derrière gagne sur un NL inoffensif devant', () => {
  const term = { x: 10, y: 12, facing: 0 };
  const nls = [
    { x: 14, y: 12, alive: true, armTicks: 0 },
    { x: 7, y: 12, alive: true, armTicks: 2 },
  ];
  const f = pickFpsThreat(term, nls);
  assert.ok(f);
  assert.equal(f!.i, 1);
  assert.ok(Math.abs(wrapPi(f!.yaw - Math.PI)) < 0.2);
});

test('hint d\'événement : claw.who et bolt.tx/ty', () => {
  const nls = [
    { x: 1, y: 2, alive: true, armTicks: 0 },
    { x: 8, y: 9, alive: true, armTicks: 1 },
  ];
  const claw = eventAimHint([{ type: 'claw', who: 1 }], nls);
  assert.deepEqual(claw, { x: 8, y: 9 });
  const bolt = eventAimHint([{ type: 'bolt', tx: 3.2, ty: 4.1 }], nls);
  assert.deepEqual(bolt, { x: 3.2, y: 4.1 });
  const look = freshLook(0);
  steerFpsLook(look, { yaw: 1.2, pitch: -0.2 }, true);
  assert.equal(look.yaw, 1.2);
});

test('autoplay FPS : NL < 3 m ou griffe → snap vers l\'assaillant (caméra seulement)', () => {
  const term = { x: 10, y: 12, facing: 0 };
  const nls = [
    { x: 18, y: 12, alive: true, armTicks: 0 },
    { x: 8.2, y: 12, alive: true, armTicks: 0 },
  ];
  const melee = pickAutoplayFocus(term, nls, [], null, 10);
  assert.equal(melee.focus?.i, 1);
  assert.equal(melee.snap, true);
  assert.ok(melee.focus!.dist < MELEE_AIM_M);
  const close = pickFpsThreat(term, [{ x: 11.25, y: 12, alive: true, armTicks: 2 }]);
  assert.ok(close && close.pitch > -0.29, `pitch trop bas ${close?.pitch}`);

  const behind = [
    { x: 18, y: 12, alive: true, armTicks: 0 },
    { x: 8.1, y: 12, alive: true, armTicks: 2 },
  ];
  const armed = pickAutoplayFocus(term, behind, [{ type: 'clawArm', who: 1 }], null, 40);
  assert.equal(armed.lock?.i, 1);
  assert.equal(armed.snap, true);
  const look = freshLook(0);
  steerFpsLook(look, armed.focus!, true);
  assert.equal(nlInLook(look.yaw, term, behind[1]!), true);

  const claw = pickAutoplayFocus(term, behind, [{ type: 'claw', who: 1 }], armed.lock, 42);
  steerFpsLook(look, claw.focus!, claw.snap);
  assert.equal(nlInLook(look.yaw, term, behind[1]!), true);
});

test('viewmodel : storm bolter (canons + mag) et poing (doigts) identifiables', () => {
  const vm = createViewmodel();
  assert.ok(vm.bolter.children.length >= 12, `bolter trop pauvre ${vm.bolter.children.length}`);
  assert.ok(vm.fist.children.length >= 14, `poing trop pauvre ${vm.fist.children.length}`);
  assert.equal(vm.bolter.name, 'storm-bolter');
  assert.equal(vm.fist.name, 'power-fist');
  let lights = 0;
  vm.scene.traverse((o) => { if ((o as { isLight?: boolean }).isLight) lights++; });
  assert.ok(lights >= 6, `lumières viewmodel ${lights}`);
  vm.dispose();
});
