import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyTerminatorLook, metallicRoughnessIsDummy, TERM_LOOK } from '../web/terminator-look.ts';
import { T_CFG } from '../src/sim.ts';

test('carte MR dummy orange (mesure TERM-512 : B≈0,018, G≈0,56)', () => {
  const n = 4;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = 245;
    data[i * 4 + 1] = 142;
    data[i * 4 + 2] = 5;
    data[i * 4 + 3] = 255;
  }
  const dummy = new THREE.DataTexture(data, 2, 2);
  dummy.image = { data, width: 2, height: 2 };
  assert.equal(metallicRoughnessIsDummy(dummy), true);
  const metal = new Uint8Array([10, 40, 200, 255]);
  const real = new THREE.DataTexture(metal, 1, 1);
  real.image = { data: metal, width: 1, height: 1 };
  assert.equal(metallicRoughnessIsDummy(real), false);
});

test('applyTerminatorLook : PBR armure, pas le flatten générique, visor shader', () => {
  const data = new Uint8Array([245, 142, 5, 255]);
  const dummy = new THREE.DataTexture(data, 1, 1);
  dummy.image = { data, width: 1, height: 1 };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 1,
    metalnessMap: dummy,
    roughnessMap: dummy,
    side: THREE.DoubleSide,
  });
  const tell = { value: 0 };
  applyTerminatorLook(mat, tell);
  assert.equal(mat.userData.terminatorLook, true);
  assert.equal(mat.side, THREE.FrontSide);
  assert.equal(mat.metalness, TERM_LOOK.metalness);
  assert.equal(mat.roughness, TERM_LOOK.roughness);
  assert.ok(mat.metalness > 0.5);
  assert.ok(mat.roughness < 0.72);
  assert.equal(mat.metalnessMap, null);
  assert.equal(mat.roughnessMap, null);
  assert.ok(mat.color.r < 1);
  const sh = { uniforms: {} as Record<string, unknown>, fragmentShader: '#include <emissivemap_fragment>\n#include <fog_fragment>' };
  const compile = mat.onBeforeCompile as (shader: typeof sh) => void;
  compile(sh);
  assert.equal(sh.uniforms.uTell, tell);
  assert.match(sh.fragmentShader, /totalEmissiveRadiance/);
  assert.match(sh.fragmentShader, /visor/);
  assert.doesNotMatch(sh.fragmentShader, /vec3\(0\.26, 0\.35, 0\.55\)/);
});

test('garde-fous : pas de sprint TERM, vitesses gelées', () => {
  assert.equal(T_CFG.fwd, 2.5);
});
