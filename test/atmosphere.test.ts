import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FOG_EXP2_DENSITY, TONE_MAPPING_EXPOSURE, POST_GRAIN, POST_DITHER_SRGB,
  sceneRenderTargetOptions, linearToSrgb, POST_FRAGMENT_SHADER,
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

test('le post encode sRGB réel et dithers après gamma', () => {
  assert.ok(POST_FRAGMENT_SHADER.includes('linearToSRGB'));
  assert.ok(POST_FRAGMENT_SHADER.includes('triDither'));
  assert.ok(POST_DITHER_SRGB > 0);
  assert.equal(POST_GRAIN, 0.014);
});

test('linearToSrgb : 0 et 1, et le seuil IEC', () => {
  assert.equal(linearToSrgb(0), 0);
  assert.equal(linearToSrgb(1), 1);
  const lo = 0.0031308;
  assert.ok(Math.abs(linearToSrgb(lo) - lo * 12.92) < 1e-6);
  assert.ok(linearToSrgb(0.5) > 0.5);
});
