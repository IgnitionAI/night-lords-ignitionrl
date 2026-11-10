// Luma moyenne des scènes de référence #62 (PNG canvas) vs recapture SwiftShader.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { meanLuma, blockBandingStats, type Roi } from '../web/banding.ts';
import { decodePngRgba } from '../web/png-rgba.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/camera-combat');
const REF_DIR = join(ROOT, 'docs/captures/banding');
const PORT = Number(process.env.PORT ?? 18198);

mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { name: 'ensemble-couloir-t40-s3', qs: 'shot=40&seed=3&autoplay=march&cam=couloir&tex=512', png: 'apres-ensemble-couloir-t40-s3-canvas.png' },
  { name: 'nl-couloir-t115-s3', qs: 'shot=115&seed=3&autoplay=march&cam=couloir&tex=512', png: 'apres-nl-couloir-t115-s3-canvas.png' },
  { name: 'ensemble-couloir-t14-s18', qs: 'shot=14&demo=reveal&seed=18&cam=couloir&tex=512', png: 'apres-ensemble-couloir-t14-s18-canvas.png' },
  { name: 'terminator-epaule-t115-s3', qs: 'shot=115&seed=3&autoplay=march&cam=epaule&tex=512', png: 'apres-terminator-epaule-t115-s3-canvas.png' },
  { name: 'reveal-epaule-t14-s18', qs: 'shot=14&demo=reveal&seed=18&cam=epaule&tex=512', png: 'apres-reveal-epaule-t14-s18-canvas.png' },
];

const FOG_ROI: Roi = { x: 180, y: 160, w: 380, h: 240 };

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

const swiftArgs = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
];

function fullLumaFromPng(path: string): { luma: number; w: number; h: number; fogUnique: number } {
  const { width, height, rgba } = decodePngRgba(readFileSync(path));
  const luma = meanLuma(rgba, width, height, { x: 0, y: 0, w: width, h: height });
  const fog = blockBandingStats(rgba, width, height, FOG_ROI, 8);
  return { luma, w: width, h: height, fogUnique: fog.uniqueLuma };
}

const server = spawn('bun', ['dist/server.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
await waitListen(server, 'proto sur', 20000);
const browser = await chromium.launch({ headless: true, args: swiftArgs });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const rows: { name: string; ref: number; now: number; dAbs: number; dPct: number; fogUnique: number; refFogUnique: number }[] = [];
try {
  for (const shot of SHOTS) {
    const ref = fullLumaFromPng(join(REF_DIR, shot.png));
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/?${shot.qs}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      if (await page.title() === 'READY') break;
      await page.waitForTimeout(200);
    }
    const pngNow = join(OUT, `luma-${shot.name}.png`);
    await page.locator('#c').screenshot({ path: pngNow, type: 'png' });
    const now = fullLumaFromPng(pngNow);
    const dAbs = now.luma - ref.luma;
    const dPct = ref.luma ? dAbs / ref.luma : 0;
    rows.push({ name: shot.name, ref: ref.luma, now: now.luma, dAbs, dPct, fogUnique: now.fogUnique, refFogUnique: ref.fogUnique });
    console.log(JSON.stringify(rows[rows.length - 1]));
    await page.close();
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

const fails = rows.filter((r) => Math.abs(r.dPct) > 0.05 && Math.abs(r.dAbs) > 1.5);
writeFileSync(join(OUT, 'luma.json'), JSON.stringify({ rows, fails }, null, 2));
if (fails.length) throw new Error(`luma hors tolérance:\n${fails.map((f) => `${f.name} now=${f.now.toFixed(2)} ref=${f.ref.toFixed(2)} d=${f.dAbs.toFixed(2)}`).join('\n')}`);
console.log('luma ok');
