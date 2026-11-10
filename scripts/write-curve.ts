// Courbe SVG depuis metrics.jsonl (WR train + entropy). Usage : bun scripts/write-curve.ts runs/b5/metrics.jsonl policies/candidates/b5/curve.svg b5
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
const dest = process.argv[3];
const label = process.argv[4] ?? 'run';
const lines = readFileSync(src, 'utf8').trim().split('\n').map(l => JSON.parse(l) as {
  update: number; packWinRateLast200Train?: number; entropy?: number; seconds?: number; seed?: number;
});
const n = lines.length;
const W = 720, H = 220, L = 40, R = 700, T = 28, B = 198;
const x = (i: number) => L + (i / Math.max(1, n - 1)) * (R - L);
const yWr = (p: number) => B - Math.max(0, Math.min(1, p)) * (B - T);
const ents = lines.map(r => r.entropy ?? 0);
const eMin = Math.min(...ents), eMax = Math.max(...ents);
const yEnt = (e: number) => {
  const t = eMax === eMin ? 0.5 : (e - eMin) / (eMax - eMin);
  return B - t * (B - T);
};
const wr = lines.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yWr(r.packWinRateLast200Train ?? 0).toFixed(1)}`).join(' ');
const en = lines.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yEnt(r.entropy ?? 0).toFixed(1)}`).join(' ');
const last = lines[n - 1];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="100%" height="100%" fill="#0b0d13"/>
<text x="40" y="16" fill="#d8d8ff" font-size="12">${label} train — packWinRateLast200 (cyan) · entropy (orange)</text>
<path d="${wr}" fill="none" stroke="#30d0ff" stroke-width="1.4"/>
<path d="${en}" fill="none" stroke="#ffa020" stroke-width="1.2"/>
<text x="40" y="212" fill="#889" font-size="10">update 1 → ${last.update} · ~${last.seconds ?? '?'} s CPU · ${n} lignes</text>
</svg>
`;
writeFileSync(dest, svg);
console.log('curve', dest, n);