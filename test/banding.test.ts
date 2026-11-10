import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandingStats, blockBandingStats, luma8 } from '../web/banding.ts';
import { decodePngRgba } from '../web/png-rgba.ts';

function fillRgba(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      const i = (y * w + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
  return buf;
}

test('un dégradé lisse a beaucoup de niveaux et des runs courts', () => {
  const w = 256, h = 8;
  const rgba = fillRgba(w, h, (x) => [x, x, x]);
  const s = bandingStats(rgba, w, h, { x: 0, y: 0, w, h });
  assert.equal(s.uniqueLuma, 256);
  assert.equal(s.maxRun, 1);
  assert.equal(s.occupancy, 1);
  assert.equal(s.stepsGe2, 0);
});

test('un dégradé en 16 paliers a peu de niveaux et des runs longs', () => {
  const w = 256, h = 8;
  const rgba = fillRgba(w, h, (x) => {
    const v = Math.floor(x / 16) * 16;
    return [v, v, v];
  });
  const s = bandingStats(rgba, w, h, { x: 0, y: 0, w, h });
  assert.equal(s.uniqueLuma, 16);
  assert.equal(s.maxRun, 16);
  assert.ok(s.stepsGe2 > 0);
  assert.ok(s.occupancy < 0.2);
});

test('luma8 pondère le vert', () => {
  assert.equal(luma8(0, 0, 0), 0);
  assert.ok(luma8(0, 255, 0) > luma8(255, 0, 0));
});

test('decodePngRgba refuse un buffer qui n\'est pas un PNG', () => {
  assert.throws(() => decodePngRgba(new Uint8Array([1, 2, 3, 4])));
});

test('blockBanding : le grain ne masque pas 16 paliers', () => {
  const w = 256, h = 32;
  const rgba = fillRgba(w, h, (x, y) => {
    const v = Math.floor(x / 16) * 16;
    const g = ((x * 13 + y * 7) % 5) - 2;
    const p = Math.max(0, Math.min(255, v + g));
    return [p, p, p];
  });
  const raw = bandingStats(rgba, w, h, { x: 0, y: 0, w, h });
  const blk = blockBandingStats(rgba, w, h, { x: 0, y: 0, w, h }, 8);
  assert.ok(raw.uniqueLuma > 16, `grain gonfle unique=${raw.uniqueLuma}`);
  assert.ok(blk.uniqueLuma <= 20, `blocs doivent rester ~16 paliers, got ${blk.uniqueLuma}`);
  assert.ok(blk.maxRun >= 2);
});
