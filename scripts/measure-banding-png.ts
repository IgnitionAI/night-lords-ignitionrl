import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockBandingStats, bandingStats, meanLuma } from '../web/banding.ts';
import { decodePngRgba } from '../web/png-rgba.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../docs/captures/banding');
const ROIS = {
  fogFloor: { x: 640, y: 720, w: 640, h: 140 },
  fogWall: { x: 180, y: 160, w: 380, h: 240 },
  farMid: { x: 760, y: 380, w: 400, h: 180 },
  character: { x: 220, y: 520, w: 420, h: 380 },
};

const prefix = process.argv[2] ?? 'avant';
const files = readdirSync(DIR).filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('-canvas.png')).sort();
const out: Record<string, unknown> = {};
for (const f of files) {
  const { width, height, rgba } = decodePngRgba(readFileSync(join(DIR, f)));
  const rec: Record<string, unknown> = { width, height };
  for (const [k, roi] of Object.entries(ROIS)) {
    rec[k] = {
      px: bandingStats(rgba, width, height, roi),
      block: blockBandingStats(rgba, width, height, roi, 8),
      meanLuma: meanLuma(rgba, width, height, roi),
    };
  }
  out[f] = rec;
}
const dest = join(DIR, `png-${prefix}.json`);
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ dest, shots: Object.fromEntries(Object.entries(out).map(([k, v]) => {
  const r = v as { fogWall: { block: { uniqueLuma: number; maxRun: number; occupancy: number }; meanLuma: number }; fogFloor: { block: { uniqueLuma: number; maxRun: number }; meanLuma: number }; character: { meanLuma: number } };
  return [k, { fogWallBlockUnique: r.fogWall.block.uniqueLuma, fogWallBlockMaxRun: r.fogWall.block.maxRun, fogWallOcc: r.fogWall.block.occupancy, fogFloorBlockUnique: r.fogFloor.block.uniqueLuma, fogFloorMean: r.fogFloor.meanLuma, characterMean: r.character.meanLuma }];
})) }, null, 2));
