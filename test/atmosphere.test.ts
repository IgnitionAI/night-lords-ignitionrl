import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FOG_EXP2_DENSITY, TONE_MAPPING_EXPOSURE, POST_GRAIN, POST_DITHER_SRGB,
  sceneRenderTargetOptions, linearToDisplay, iecSrgb, POST_FRAGMENT_SHADER,
} from '../web/atmosphere.ts';

test('fog et exposition de #54 restent les valeurs retenues', () => {
  assert.equal(FOG_EXP2_DENSITY, 0.060);
  assert.equal(TONE_MAPPING_EXPOSURE, 1.34);
});

test('la passe scène est HalfFloat linéaire (pas 8 bits linéaire)', () => {
  const opt = sceneRenderTargetOptions();
  assert.equal(opt.type, THREE.HalfFloatType);
  assert.equal(opt.colorSpace, THREE.LinearSRGBColorSpace);
  assert.equal(opt.samples, 4);
});

test('le post encode comme avant (pow 0,4545) et dithers après gamma', () => {
  assert.ok(POST_FRAGMENT_SHADER.includes('0.4545'));
  assert.ok(!POST_FRAGMENT_SHADER.includes('12.92'));
  assert.ok(POST_FRAGMENT_SHADER.includes('triDither'));
  assert.ok(POST_DITHER_SRGB > 0);
  assert.equal(POST_GRAIN, 0.014);
});

test('linearToDisplay : même transfert que le post historique Three (pow 0,4545)', () => {
  assert.equal(linearToDisplay(0), 0);
  assert.equal(linearToDisplay(1), 1);
  assert.ok(Math.abs(linearToDisplay(0.25) - Math.pow(0.25, 0.4545)) < 1e-12);
});

test('IEC assombrit le fog vs pow 0,4545 (ne pas s\'en servir pour le post)', () => {
  // Fog du couloir : ~0,002–0,02 linéaire après ACES. Le toe IEC (12,92x) et le 2,4
  // rendent plus sombre que le pow(c,0.4545) que le shader post utilisait déjà.
  const fogLin = 0.01;
  assert.ok(iecSrgb(fogLin) < linearToDisplay(fogLin) * 0.9);
  const toe = 0.002;
  assert.ok(iecSrgb(toe) < linearToDisplay(toe) * 0.5);
});
