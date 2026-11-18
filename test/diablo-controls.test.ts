import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, nlSees, DT, T_CFG, NL_CFG } from '../src/sim.ts';
import { DIABLO } from '../web/atmosphere.ts';
import {
  diabloControls, diabloKeys, screenHeading, turnToward, rayToGround, DIABLO_TURN_GAIN, DIABLO_WALK_HALF,
} from '../web/controls/diablo.ts';
import { noiseRingRadius, coneFan, coneGradient, placeConePoint, inCone } from '../web/read-aids.ts';

const CAM = DIABLO.yaw; // lacet de la caméra Diablo : « haut de l'écran » = cap -π/2 en sim
const term = (facing: number, turnVel = 0) => ({ x: 10, y: 10, facing, turnVel });
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const Z = { up: 1, right: 0 }, NONE = { up: 0, right: 0 };

test('diablo : la touche Z pointe vers le haut de l\'écran (cap -π/2), D vers la droite (cap 0)', () => {
  assert.ok(Math.abs(wrap(screenHeading(Z, CAM)! + Math.PI / 2)) < 1e-9);
  assert.ok(Math.abs(wrap(screenHeading({ up: 0, right: 1 }, CAM)!)) < 1e-9);
  assert.equal(screenHeading(NONE, CAM), null);
});

test('diablo : curseur devant + Z vers le cap → fwd = 1', () => {
  const t = term(-Math.PI / 2);
  const out = diabloControls(t, Z, { x: 10, y: 4 }, CAM, T_CFG, DT);
  assert.equal(out.fwd, 1);
  assert.ok(Math.abs(out.turn) < 1e-9, 'déjà aligné : aucune consigne de rotation');
});

test('diablo : curseur derrière, Z opposé au cap → fwd = -1 (marche arrière)', () => {
  const t = term(Math.PI / 2); // regarde vers le bas de l'écran
  const out = diabloControls(t, Z, { x: 10, y: 16 }, CAM, T_CFG, DT);
  assert.equal(out.fwd, -1);
  // et la sim recule bien à la vitesse `back`, dans l'axe (aucun pas de côté)
  const w = newWorld(3, { x: 10, y: 10, facing: Math.PI / 2 });
  for (let i = 0; i < 20; i++) step(w, { fwd: out.fwd, strafe: 0, turn: 0, bolt: false, fist: false }, [0, 0, 0, 0]);
  const v = Math.hypot(w.t.vx, w.t.vy);
  assert.ok(Math.abs(v - T_CFG.back) < 1e-6, `vitesse ${v}`);
  assert.ok(w.t.vy < 0, 'recule vers le haut de l\'écran');
});

test('diablo : direction à 90° du cap → fwd = 0 ; limite à 50°', () => {
  const t = term(0);
  assert.equal(diabloControls(t, Z, { x: 20, y: 10 }, CAM, T_CFG, DT).fwd, 0);
  assert.equal(diabloControls(t, { up: -1, right: 0 }, { x: 20, y: 10 }, CAM, T_CFG, DT).fwd, 0);
  const in45 = term(-Math.PI / 2 + 45 * Math.PI / 180), out55 = term(-Math.PI / 2 + 55 * Math.PI / 180);
  assert.equal(diabloControls(in45, Z, { x: 20, y: 0 }, CAM, T_CFG, DT).fwd, 1);
  assert.equal(diabloControls(out55, Z, { x: 20, y: 0 }, CAM, T_CFG, DT).fwd, 0);
  assert.equal(DIABLO_WALK_HALF, 50 * Math.PI / 180);
});

test('diablo : la consigne turn tend vers le cap du curseur, dans les bornes turnMax / turnAccel', () => {
  // sens : curseur à gauche du cap (angle positif) → turn > 0, à droite → turn < 0, toujours dans [-1, 1]
  const t = term(0);
  const left = diabloControls(t, NONE, { x: 10, y: 20 }, CAM, T_CFG, DT).turn;
  const right = diabloControls(t, NONE, { x: 10, y: 0 }, CAM, T_CFG, DT).turn;
  assert.ok(left > 0 && left <= 1);
  assert.ok(right < 0 && right >= -1);
  // boucle fermée avec la vraie sim : turnVel reste ≤ turnMax, le cap converge vers le curseur
  const w = newWorld(5, { x: 10, y: 10, facing: 0 });
  const aim = { x: 10 - 8, y: 10 + 1 }; // quasiment derrière : ~173°
  let maxVel = 0, prevVel = 0, maxDv = 0;
  for (let i = 0; i < 60; i++) {
    const out = diabloControls(w.t, NONE, aim, CAM, T_CFG, DT);
    assert.ok(Math.abs(out.turn) <= 1);
    assert.equal(out.fwd, 0, 'sans touche, la souris seule ne fait pas marcher');
    step(w, { fwd: 0, strafe: 0, turn: out.turn, bolt: false, fist: false }, [0, 0, 0, 0]);
    maxVel = Math.max(maxVel, Math.abs(w.t.turnVel));
    maxDv = Math.max(maxDv, Math.abs(w.t.turnVel - prevVel)); prevVel = w.t.turnVel;
  }
  assert.ok(maxVel <= T_CFG.turnMax + 1e-9, `turnVel ${maxVel}`);
  assert.ok(maxDv <= T_CFG.turnAccel * DT + 1e-9, `rampe ${maxDv}`);
  const target = Math.atan2(aim.y - w.t.y, aim.x - w.t.x);
  assert.ok(Math.abs(wrap(target - w.t.facing)) < 0.05, `écart final ${wrap(target - w.t.facing)}`);
  assert.ok(Math.abs(w.t.turnVel) < 0.25, 'arrive sans tourner en rond');
});

test('diablo : turnToward reprend le contrôleur existant (gain 2,4, plafonné)', () => {
  const t = term(0, 0);
  assert.equal(turnToward(t, 0.1, T_CFG, DT), Math.max(-1, Math.min(1, 0.1 * DIABLO_TURN_GAIN / (T_CFG.turnAccel * DT))));
  assert.equal(turnToward(term(0, T_CFG.turnMax), Math.PI, T_CFG, DT), 0, 'déjà à turnMax vers la cible : on tient');
});

test('diablo : sans curseur, comportement existant (ZQSD oriente et fait avancer)', () => {
  // formule d'origine de web/main.ts (avant la visée souris), recopiée telle quelle
  const legacy = (facing: number, turnVel: number, up: number, right: number) => {
    if (up === 0 && right === 0) return { fwd: 0, turn: 0 };
    const gx = Math.cos(CAM), gy = Math.sin(CAM), dx = up * gx - right * gy, dy = up * gy + right * gx;
    const diff = wrap(Math.atan2(dy, dx) - facing);
    const wantVel = Math.max(-T_CFG.turnMax, Math.min(T_CFG.turnMax, diff * 2.4));
    const turn = Math.max(-1, Math.min(1, (wantVel - turnVel) / (T_CFG.turnAccel * DT)));
    return { fwd: Math.cos(diff) > Math.cos(50 * Math.PI / 180) ? 1 : 0, turn };
  };
  for (const facing of [-3, -1.6, -0.4, 0, 0.7, 1.57, 2.9]) for (const tv of [-1.6, -0.3, 0, 0.8]) {
    for (const up of [-1, 0, 1]) for (const right of [-1, 0, 1]) {
      const got = diabloControls(term(facing, tv), { up, right }, null, CAM, T_CFG, DT), want = legacy(facing, tv, up, right);
      assert.equal(got.fwd, want.fwd, `fwd f=${facing} up=${up} right=${right}`);
      assert.ok(Math.abs(got.turn - want.turn) < 1e-9, `turn f=${facing} up=${up} right=${right}`);
    }
  }
  // et jamais de recul sans souris : S face au haut de l'écran fait pivoter, pas reculer
  assert.equal(diabloControls(term(-Math.PI / 2), { up: -1, right: 0 }, null, CAM, T_CFG, DT).fwd, 0);
});

test('diablo : curseur sur le Terminator → on tient le cap (pas de cap indéfini)', () => {
  const out = diabloControls(term(1, 0), NONE, { x: 10.1, y: 10 }, CAM, T_CFG, DT);
  assert.equal(out.turn, 0);
});

test('diablo : rayon caméra → sol y = 0, en coordonnées sim (x, z monde)', () => {
  assert.deepEqual(rayToGround(2, 10, 3, 0, -1, 0), { x: 2, y: 3 });
  const p = rayToGround(0, 4, 0, 1, -1, 2)!;
  assert.ok(Math.abs(p.x - 4) < 1e-9 && Math.abs(p.y - 8) < 1e-9);
  assert.equal(rayToGround(0, 4, 0, 1, 0.2, 0), null, 'un rayon qui monte ne touche pas le sol');
});

test('aides de lecture : anneau de bruit = t.noise de la sim', () => {
  const w = newWorld(11);
  assert.equal(noiseRingRadius(w.t), w.t.noise);
  step(w, { fwd: 1, strafe: 0, turn: 0, bolt: false, fist: false }, [0, 0, 0, 0]);
  step(w, { fwd: 1, strafe: 0, turn: 0, bolt: false, fist: false }, [0, 0, 0, 0]);
  assert.equal(noiseRingRadius(w.t), T_CFG.noiseMove);
  assert.equal(noiseRingRadius({ noise: -1 }), 0);
});

test('aides de lecture : cône de vision = portée visionRange, demi-angle visionHalf, orienté par facing', () => {
  const pts = coneFan(NL_CFG.visionRange, NL_CFG.visionHalf, 28);
  assert.equal(pts.length, 30);
  assert.deepEqual(pts[0], { x: 0, y: 0 });
  for (const p of pts.slice(1)) assert.ok(Math.abs(Math.hypot(p.x, p.y) - NL_CFG.visionRange) < 1e-9);
  assert.ok(Math.abs(Math.atan2(pts[1]!.y, pts[1]!.x) + NL_CFG.visionHalf) < 1e-9);
  assert.ok(Math.abs(Math.atan2(pts.at(-1)!.y, pts.at(-1)!.x) - NL_CFG.visionHalf) < 1e-9);
  // posé en (5, 5) cap π/2 : l'axe pointe vers +y sim, et la convention three (rotation.y = -facing) concorde
  const tip = placeConePoint({ x: NL_CFG.visionRange, y: 0 }, 5, 5, Math.PI / 2);
  assert.ok(Math.abs(tip.x - 5) < 1e-9 && Math.abs(tip.y - (5 + NL_CFG.visionRange)) < 1e-9);
  const th = -Math.PI / 2, wx = NL_CFG.visionRange * Math.cos(th), wz = -NL_CFG.visionRange * Math.sin(th);
  assert.ok(Math.abs(wx) < 1e-9 && Math.abs(wz - NL_CFG.visionRange) < 1e-9);
  assert.ok(inCone(5, 5, Math.PI / 2, NL_CFG.visionRange, NL_CFG.visionHalf, 5, 15));
  assert.ok(!inCone(5, 5, Math.PI / 2, NL_CFG.visionRange, NL_CFG.visionHalf, 5, -3));
  assert.ok(!inCone(5, 5, Math.PI / 2, NL_CFG.visionRange, NL_CFG.visionHalf, 5, 5 + NL_CFG.visionRange + 0.1));
});

test('aides de lecture : la teinte « vu » suit nlSees, et un NL qui voit le T l\'a dans son cône dessiné', () => {
  const w = newWorld(7, { x: 10, y: 10, facing: 0 });
  const n = w.nls[0]!;
  n.x = 16; n.y = 10; n.facing = Math.PI; // face au Terminator, à 6 m
  assert.equal(nlSees(w, n), true, 'ligne de vue dégagée à 6 m, face à face');
  assert.ok(inCone(n.x, n.y, n.facing, NL_CFG.visionRange, NL_CFG.visionHalf + Math.atan2(T_CFG.radius, 6), w.t.x, w.t.y));
  n.facing = 0; // dos tourné
  assert.equal(nlSees(w, n), false);
});

const held = (...codes: string[]) => (c: string) => codes.includes(c);

test('diablo : les flèches sont le déplacement de référence, ZQSD/WASD donnent la même direction', () => {
  assert.deepEqual(diabloKeys(held('ArrowUp')), { up: 1, right: 0 });
  assert.deepEqual(diabloKeys(held('ArrowDown')), { up: -1, right: 0 });
  assert.deepEqual(diabloKeys(held('ArrowLeft')), { up: 0, right: -1 });
  assert.deepEqual(diabloKeys(held('ArrowRight')), { up: 0, right: 1 });
  assert.deepEqual(diabloKeys(held('ArrowUp', 'ArrowRight')), { up: 1, right: 1 });
  assert.deepEqual(diabloKeys(held('ArrowUp', 'ArrowDown')), { up: 0, right: 0 });
  assert.deepEqual(diabloKeys(held('KeyZ')), diabloKeys(held('ArrowUp')), 'Z (AZERTY)');
  assert.deepEqual(diabloKeys(held('KeyW')), diabloKeys(held('ArrowUp')), 'W (QWERTY)');
  assert.deepEqual(diabloKeys(held('KeyQ')), diabloKeys(held('ArrowLeft')));
  assert.deepEqual(diabloKeys(held('KeyA')), diabloKeys(held('ArrowLeft')));
  assert.deepEqual(diabloKeys(held('KeyS')), diabloKeys(held('ArrowDown')));
  assert.deepEqual(diabloKeys(held('KeyD')), diabloKeys(held('ArrowRight')));
  assert.deepEqual(diabloKeys(held('Space', 'KeyF', 'KeyH')), { up: 0, right: 0 }, 'tir, gantelet, H ne déplacent pas');
});

test('diablo : demi-tour vers un ennemi derrière, même avec la marche tenue', () => {
  const w = newWorld(5, { x: 10, y: 10, facing: -Math.PI / 2 });
  for (let i = 0; i < 15; i++) {
    const aim = { x: w.t.x, y: w.t.y + 8 };
    const out = diabloControls(w.t, Z, aim, CAM, T_CFG, DT);
    assert.equal(out.turn, diabloControls(w.t, NONE, aim, CAM, T_CFG, DT).turn,
      'les touches ne reprennent jamais la rotation à la souris');
    step(w, { ...out, strafe: 0, bolt: false, fist: false }, [0, 0, 0, 0]);
  }
  assert.ok(Math.abs(wrap(w.t.facing - Math.PI / 2)) < 0.15, 'fait face derrière en 1,5 seconde');
});

test('mobilité : atteint 5 m/s en une demi-seconde', () => {
  const w = newWorld(5, { x: 10, y: 10, facing: 0 });
  for (let i = 0; i < 5; i++) step(w, { fwd: 1, strafe: 0, turn: 0, bolt: false, fist: false }, [0, 0, 0, 0]);
  assert.ok(Math.hypot(w.t.vx, w.t.vy) >= 5);
});

test('diablo : sans souris, les flèches suivent le schéma ZQSD (orienter + avancer), pas l\'ancien pivot ←/→', () => {
  const t = term(-Math.PI / 2);
  const r = diabloControls(t, diabloKeys(held('ArrowRight')), null, CAM, T_CFG, DT);
  const d = diabloControls(t, diabloKeys(held('KeyD')), null, CAM, T_CFG, DT);
  assert.deepEqual(r, d);
  assert.ok(r.turn > 0, 'pivote vers la droite de l\'écran (cap 0)');
  assert.ok(r.turn <= 1);
  assert.equal(r.fwd, 0, '90° : on pivote avant d\'avancer');
});

test('aides de lecture : dégradé radial du cône (sommet opaque, bord effacé), même emprise que le cône', () => {
  const R = NL_CFG.visionRange, H = NL_CFG.visionHalf;
  const g = coneGradient(R, H, 28, 6, 0);
  assert.equal(g.pts.length, 1 + 6 * 29);
  assert.equal(g.alpha.length, g.pts.length);
  assert.equal(g.alpha[0], 1);
  const last = g.alpha.slice(-29);
  for (const a of last) assert.ok(Math.abs(a) < 1e-12, 'repos : nul à la portée max');
  for (let i = 1; i < g.alpha.length; i++) assert.ok(g.alpha[i]! <= 1 && g.alpha[i]! >= 0);
  for (const p of g.pts.slice(-29)) assert.ok(Math.abs(Math.hypot(p.x, p.y) - R) < 1e-9);
  for (const p of g.pts.slice(1)) assert.ok(inCone(0, 0, 0, R + 1e-9, H + 1e-9, p.x, p.y));
  assert.equal(g.index.length, 3 * 28 + 6 * 28 * 5);
  assert.ok(g.index.every(i => i >= 0 && i < g.pts.length));
  const seen = coneGradient(R, H, 28, 6, 0.3);
  assert.ok(Math.abs(seen.alpha.at(-1)! - 0.3) < 1e-12, '« voit » : le bord garde 30 %, le rouge reste lisible');
});
