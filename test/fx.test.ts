import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, type TAction } from '../src/sim.ts';
import { parseFxQuality, FX_BUDGET, HITSTOP_S, KILLCAM_S, eventsToFxPulses, clipRayToAabbs, punchFeel, freshFeel, simDelta, advanceFeel } from '../web/fx/index.ts';
import { FOG_EXP2_DENSITY, TONE_MAPPING_EXPOSURE, POST_FRAGMENT_SHADER, POST_GRAIN } from '../web/atmosphere.ts';
import { NL_CFG, T_CFG } from '../src/sim.ts';

const IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };

test('?fx=low et off coupent le budget coûteux', () => {
  assert.equal(parseFxQuality(null), 'high');
  assert.equal(parseFxQuality('high'), 'high');
  assert.equal(parseFxQuality('low'), 'low');
  assert.equal(parseFxQuality('0'), 'low');
  assert.equal(parseFxQuality('off'), 'low');
  assert.equal(FX_BUDGET.low.particles, 0);
  assert.equal(FX_BUDGET.low.dust, 0);
  assert.ok(FX_BUDGET.high.particles >= 180);
});

test('hit-stop des gros coups reste dans 40–80 ms', () => {
  const vals = [HITSTOP_S.boltKill, HITSTOP_S.fistKill, HITSTOP_S.fist, HITSTOP_S.claw, HITSTOP_S.clawArmor];
  for (const v of vals) {
    assert.ok(v >= 0.04 && v <= 0.08, `hitstop ${v}`);
  }
  assert.ok(KILLCAM_S > 0.15 && KILLCAM_S < 0.4);
});

test('hit-stop gèle la sim ; la kill-cam ralentit', () => {
  const s = freshFeel(0.2);
  punchFeel(s, 0.06, 0.2, 1, 0, true);
  assert.equal(simDelta(s, 0.016), 0);
  s.hitstop = 0;
  const slow = simDelta(s, 0.016);
  assert.ok(slow > 0 && slow < 0.016);
  s.killcam = 0;
  assert.equal(simDelta(s, 0.016), 0.016);
});

test('armure basse : CA et vignette ; au-dessus : rien', () => {
  const s = freshFeel(0.2);
  advanceFeel(s, 0.016, 0.2, 1.0, true);
  assert.ok(s.ca > 0);
  assert.ok(s.vignettePulse > 0);
  advanceFeel(s, 0.016, 0.8, 1.0, true);
  assert.equal(s.ca, 0);
  assert.equal(s.vignettePulse, 0);
});

test('un bolt qui rate est clippé sur un pilier (événement de présentation)', () => {
  const hit = clipRayToAabbs(6.4, 6, 22.4, 6, [{ x0: 9, y0: 4, x1: 11, y1: 8 }]);
  assert.equal(hit.hit, true);
  assert.ok(Math.abs(hit.x - 9) < 0.05, `x=${hit.x}`);
  assert.equal(hit.y, 6);
  assert.ok(hit.nx < 0);
});

test('bolt + kill émettent tracer, impact, mort — sans toucher la sim', () => {
  const w = newWorld(7);
  w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.ammo = 30; w.t.boltCd = 0;
  w.nls.forEach((n) => { n.alive = true; n.cd = 20; n.x = 22; n.y = 18; });
  w.nls[0].x = 12; w.nls[0].y = 12.05; w.nls[0].facing = Math.PI;
  step(w, { ...IDLE, bolt: true }, [0, 0, 0, 0]);
  const bolts = w.events.filter((e) => e.type === 'bolt');
  assert.ok(bolts.length >= 1);
  const pulses = eventsToFxPulses(w.events, w);
  const kinds = new Set(pulses.map((p) => p.kind));
  assert.ok(kinds.has('bolt'));
  if (bolts.some((b) => b.type === 'bolt' && b.kill >= 0)) {
    assert.ok(kinds.has('boltKill'));
    assert.ok(kinds.has('death'));
  } else {
    assert.ok(kinds.has('boltImpact'));
  }
});

test('fog, expo, grain, pow(0.4545) inchangés ; bloom dans le même post', () => {
  assert.equal(FOG_EXP2_DENSITY, 0.060);
  assert.equal(TONE_MAPPING_EXPOSURE, 1.34);
  assert.equal(POST_GRAIN, 0.014);
  assert.ok(POST_FRAGMENT_SHADER.includes('0.4545'));
  assert.ok(POST_FRAGMENT_SHADER.includes('uBloom'));
  assert.ok(POST_FRAGMENT_SHADER.includes('uCA'));
  assert.ok(!POST_FRAGMENT_SHADER.includes('12.92'));
});

test('vitesses de sim intactes (NL 6, TERM 2.5)', () => {
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
});
