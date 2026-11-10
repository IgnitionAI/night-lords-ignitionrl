// Captures Playwright (Chromium + SwiftShader) : banding du couloir, ?shot=.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import type { Roi } from '../web/banding.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/banding');
const PORT = Number(process.env.PORT ?? 18190);
const PREFIX = process.env.PREFIX ?? 'avant';
const BASE = `http://127.0.0.1:${PORT}`;

mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { name: 'ensemble-couloir-t40-s3', qs: 'shot=40&seed=3&autoplay=march&cam=couloir&tex=512' },
  { name: 'nl-couloir-t115-s3', qs: 'shot=115&seed=3&autoplay=march&cam=couloir&tex=512' },
  { name: 'ensemble-couloir-t14-s18', qs: 'shot=14&demo=reveal&seed=18&cam=couloir&tex=512' },
  { name: 'terminator-epaule-t115-s3', qs: 'shot=115&seed=3&autoplay=march&tex=512' },
  { name: 'reveal-epaule-t14-s18', qs: 'shot=14&demo=reveal&seed=18&tex=512' },
];

const ROIS: Record<string, Roi> = {
  fogFloor: { x: 640, y: 720, w: 640, h: 140 },
  fogWall: { x: 180, y: 160, w: 380, h: 240 },
  farMid: { x: 760, y: 380, w: 400, h: 180 },
  character: { x: 220, y: 520, w: 420, h: 380 },
};
const HUD_ROI: Roi = { x: 16, y: 14, w: 300, h: 90 };

function waitListen(child: ReturnType<typeof spawn>, needle: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout serveur')), ms);
    const on = (buf: Buffer) => {
      const s = buf.toString();
      process.stdout.write(s);
      if (s.includes(needle)) { clearTimeout(t); resolve(); }
    };
    child.stdout?.on('data', on);
    child.stderr?.on('data', on);
    child.on('exit', (c) => { clearTimeout(t); reject(new Error(`serveur exit ${c}`)); });
  });
}

const BANDING_IN_PAGE = `(rgba, width, height, rois) => {
  const luma8 = (r, g, b) => Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const scan = (getL, x0, y0, x1, y1) => {
    const levels = new Uint32Array(256);
    let pixels = 0, maxRun = 1, sumRun = 0, nRuns = 0, stepsGe2 = 0, sumL = 0;
    for (let y = y0; y < y1; y++) {
      let prev = -1, run = 0;
      for (let x = x0; x < x1; x++) {
        const L = getL(x, y);
        levels[L]++; pixels++; sumL += L;
        if (L === prev) run++;
        else {
          if (run > 0) { maxRun = Math.max(maxRun, run); sumRun += run; nRuns++; }
          if (prev >= 0 && Math.abs(L - prev) >= 2) stepsGe2++;
          run = 1; prev = L;
        }
      }
      if (run > 0) { maxRun = Math.max(maxRun, run); sumRun += run; nRuns++; }
    }
    let uniqueLuma = 0, lumaMin = 255, lumaMax = 0;
    for (let i = 0; i < 256; i++) if (levels[i]) { uniqueLuma++; lumaMin = Math.min(lumaMin, i); lumaMax = Math.max(lumaMax, i); }
    const span = Math.max(0, lumaMax - lumaMin);
    return { pixels, uniqueLuma, lumaMin: pixels ? lumaMin : 0, lumaMax: pixels ? lumaMax : 0, span,
      occupancy: span + 1 > 0 ? uniqueLuma / (span + 1) : 0, maxRun, meanRun: nRuns ? sumRun / nRuns : 0, stepsGe2,
      meanLuma: pixels ? sumL / pixels : 0 };
  };
  const one = (roi) => {
    const x0 = Math.max(0, roi.x | 0), y0 = Math.max(0, roi.y | 0);
    const x1 = Math.min(width, x0 + Math.max(0, roi.w | 0));
    const y1 = Math.min(height, y0 + Math.max(0, roi.h | 0));
    const px = scan((x, y) => {
      const i = (y * width + x) * 4;
      return luma8(rgba[i], rgba[i + 1], rgba[i + 2]);
    }, x0, y0, x1, y1);
    const block = 8;
    const bw = Math.max(1, Math.floor((x1 - x0) / block));
    const bh = Math.max(1, Math.floor((y1 - y0) / block));
    const means = [];
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let s = 0, n = 0;
      const xs = x0 + bx * block, ys = y0 + by * block;
      for (let y = ys; y < ys + block; y++) for (let x = xs; x < xs + block; x++) {
        const i = (y * width + x) * 4;
        s += luma8(rgba[i], rgba[i + 1], rgba[i + 2]); n++;
      }
      means.push(Math.round(s / n));
    }
    const blk = scan((x, y) => means[y * bw + x], 0, 0, bw, bh);
    return { ...px, block: blk };
  };
  const out = {};
  for (const k of Object.keys(rois)) out[k] = one(rois[k]);
  return out;
}`;

const server = spawn('bun', ['dist/server.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
await waitListen(server, 'proto sur', 20000);

const consoleLines: string[] = [];
const pageErrors: string[] = [];
const net: { status: number; url: string }[] = [];

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
  ],
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
context.setDefaultTimeout(180000);

const shots: unknown[] = [];

for (const shot of SHOTS) {
  const page = await context.newPage();
  const recConsole: string[] = [];
  page.on('console', (m) => {
    const line = `${m.type()}: ${m.text()}`;
    recConsole.push(line);
    consoleLines.push(line);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
  const url = `${BASE}/?${shot.qs}`;
  console.log(`goto ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.title === 'READY', undefined, { timeout: 240000 });
  console.log(`ready ${shot.name}`);
  const webgl = await page.evaluate(() => {
    const c = document.getElementById('c') as HTMLCanvasElement | null;
    const gl = c?.getContext('webgl2') || c?.getContext('webgl');
    if (!gl) return { ok: false };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      ok: true,
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  });
  const pngPath = join(OUT, `${PREFIX}-${shot.name}.png`);
  await page.screenshot({ path: pngPath, type: 'png' });
  const canvasPng = join(OUT, `${PREFIX}-${shot.name}-canvas.png`);
  await page.locator('#c').screenshot({ path: canvasPng, type: 'png' });
  const bandingPack = await page.evaluate(({ rois, fnSrc }: { rois: Record<string, Roi>; fnSrc: string }) => {
    const c = document.getElementById('c') as HTMLCanvasElement;
    const tmp = document.createElement('canvas');
    tmp.width = c.width; tmp.height = c.height;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(c, 0, 0);
    const img = ctx.getImageData(0, 0, tmp.width, tmp.height);
    const stats = (0, eval)(fnSrc)(img.data, tmp.width, tmp.height, rois);
    return { w: tmp.width, h: tmp.height, banding: stats };
  }, { rois: ROIS, fnSrc: BANDING_IN_PAGE });
  const banding = bandingPack.banding as Record<string, { uniqueLuma: number; maxRun: number; occupancy: number; meanLuma: number }>;
  const hud = await page.evaluate((roi: Roi) => {
    const hudEl = document.getElementById('hud');
    const text = hudEl?.textContent ?? '';
    const style = hudEl ? getComputedStyle(hudEl) : null;
    return { textLen: text.length, color: style?.color ?? '', background: style?.backgroundColor ?? '', roi };
  }, HUD_ROI);
  shots.push({
    name: shot.name, url, webgl, png: pngPath, canvas: canvasPng,
    canvasSize: { w: bandingPack.w, h: bandingPack.h }, banding, hud,
    console: recConsole,
  });
  await page.close();
}

const live = await context.newPage();
live.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
live.on('pageerror', (e) => pageErrors.push(String(e)));
live.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
await live.goto(`${BASE}/?autoplay=march&seed=3&cam=couloir&tex=512`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await live.waitForSelector('#hud .clock', { timeout: 120000 });
console.log('live hud');
const frameTimes = await live.evaluate(async () => {
  const samples: number[] = [];
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  let prev = performance.now();
  for (let i = 0; i < 45; i++) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const now = performance.now();
    samples.push(now - prev);
    prev = now;
  }
  return samples;
});
frameTimes.sort((a, b) => a - b);
const mean = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
const p95 = frameTimes[Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * 0.95))]!;
const frametime = { n: frameTimes.length, mean_ms: mean, p95_ms: p95, min_ms: frameTimes[0], max_ms: frameTimes[frameTimes.length - 1], samples: frameTimes };

const consoleErrors = consoleLines.filter((l) => l.startsWith('error:') && !l.includes("Couldn't load texture"));
const networkFailed = net.filter((r) => r.status >= 400);
const sfx404 = (u: string) => u.includes('/web/sfx/');
const hardNet = networkFailed.filter((r) => !sfx404(r.url));
const hardConsole = consoleErrors.filter((l) => !l.includes('404') && !l.includes('manifest.json'));

const report = {
  prefix: PREFIX,
  webglNote: 'Chromium SwiftShader',
  shots,
  frametime,
  console: consoleLines,
  consoleErrors,
  pageErrors,
  networkFailed,
  hardNet,
  hardConsole,
};

writeFileSync(join(OUT, `mesure-${PREFIX}.json`), JSON.stringify(report, null, 2));
const summary = {
  prefix: PREFIX,
  pageErrors: pageErrors.length,
  hardConsole: hardConsole.length,
  hardNet: hardNet.length,
  frametime: { mean_ms: mean, p95_ms: p95 },
  banding: Object.fromEntries(
    (shots as { name: string; banding: Record<string, { uniqueLuma: number; maxRun: number; occupancy: number; meanLuma: number }> }[])
      .map((s) => [s.name, {
        fogFloor: { uniqueLuma: s.banding.fogFloor.uniqueLuma, maxRun: s.banding.fogFloor.maxRun, meanLuma: s.banding.fogFloor.meanLuma, block: s.banding.fogFloor.block },
        fogWall: { uniqueLuma: s.banding.fogWall.uniqueLuma, maxRun: s.banding.fogWall.maxRun, meanLuma: s.banding.fogWall.meanLuma, block: s.banding.fogWall.block },
        farMid: { uniqueLuma: s.banding.farMid.uniqueLuma, maxRun: s.banding.farMid.maxRun, meanLuma: s.banding.farMid.meanLuma, block: s.banding.farMid.block },
        character: { meanLuma: s.banding.character.meanLuma },
      }]),
  ),
};
console.log(JSON.stringify(summary, null, 2));

await browser.close();
server.kill('SIGTERM');
if (pageErrors.length || hardConsole.length || hardNet.length) {
  throw new Error(`erreurs: ${[...pageErrors, ...hardConsole].join('\n')}`);
}
console.log(`capture-banding ${PREFIX} ok`);
process.exit(0);
