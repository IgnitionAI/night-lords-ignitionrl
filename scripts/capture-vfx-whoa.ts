// Captures SwiftShader avant (?fx=low) / après (VFX) + luma + FPS 20 s + vidéo match.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { decodePngRgba } from '../web/png-rgba.ts';
import { meanLuma } from '../web/banding.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/vfx-whoa');
const VID = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18194);
const BASE = `http://127.0.0.1:${PORT}`;
const PHASE = process.env.PHASE ?? 'all';

mkdirSync(OUT, { recursive: true });
mkdirSync(VID, { recursive: true });

const SHOTS: { id: string; demo: string; shot: number; cam: string }[] = [
  { id: 'bolter', demo: 'combat-shot', shot: 4, cam: 'troisquarts' },
  { id: 'impact-nl', demo: 'polish-death', shot: 5, cam: 'troisquarts' },
  { id: 'griffe', demo: 'polish-claw', shot: 6, cam: 'troisquarts' },
  { id: 'poing', demo: 'combat-term-fist', shot: 12, cam: 'troisquarts' },
  { id: 'mort-nl', demo: 'polish-death', shot: 5, cam: 'troisquarts' },
  { id: 'armure-basse', demo: 'vfx-armor', shot: 8, cam: 'epaule' },
];

const LUMA_Q = 'autoplay=march&seed=18&cam=couloir&shot=40&tex=512';

const SW = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox',
];

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

async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const server = spawn('bun', ['dist/server.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitListen(server, 'proto sur', 25000);
    return await fn(BASE);
  } finally {
    server.kill('SIGTERM');
  }
}

function pngLuma(path: string): number {
  const { rgba, width, height } = decodePngRgba(readFileSync(path));
  return meanLuma(rgba, width, height, { x: 0, y: 0, w: width, h: height });
}

async function stills() {
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const net: { status: number; url: string }[] = [];
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    context.setDefaultTimeout(180000);
    const urls: Record<string, string> = {};
    for (const tag of ['avant', 'apres'] as const) {
      for (const a of SHOTS) {
        const q = new URLSearchParams({
          demo: a.demo, cam: a.cam, shot: String(a.shot), tex: '512', seed: '1',
        });
        if (tag === 'avant') q.set('fx', 'low');
        const name = `${tag}-${a.id}-t${a.shot}`;
        const url = `${base}/?${q}`;
        const page = await context.newPage();
        page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
        page.on('pageerror', (e) => pageErrors.push(String(e)));
        page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
        await page.screenshot({ path: join(OUT, `${name}.png`), type: 'png' });
        await page.close();
        urls[name] = url;
        console.log('shot', name);
      }
    }
    for (const tag of ['avant', 'apres'] as const) {
      const q = LUMA_Q + (tag === 'avant' ? '&fx=low' : '');
      const page = await context.newPage();
      page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
      await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
      const path = join(OUT, `luma-ref-${tag}.png`);
      await page.screenshot({ path, type: 'png' });
      await page.close();
      console.log('luma', tag);
    }
    const consoleErrors = consoleLines.filter((l) => l.startsWith('error:') && !l.includes("Couldn't load texture"));
    const report = { urls, console: consoleLines, consoleErrors, pageErrors, networkFailed: net.filter((r) => r.status >= 400) };
    writeFileSync(join(OUT, 'playwright-stills.json'), JSON.stringify(report, null, 2));
    const sfx404 = (u: string) => u.includes('/web/sfx/');
    const hardNet = report.networkFailed.filter((r) => !sfx404(r.url));
    const hardConsole = consoleErrors.filter((l) => !l.includes('404'));
    if (pageErrors.length || hardConsole.length || hardNet.length) {
      throw new Error(`erreurs stills: ${[...pageErrors, ...hardConsole, ...hardNet.map((n) => `${n.status} ${n.url}`)].join('\n')}`);
    }
    await browser.close();
  });
}

async function fpsOnce(fxLow: boolean): Promise<{ avg: number; min: number; frames: number }> {
  return withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const q = new URLSearchParams({ autoplay: 'march', seed: '3', cam: 'epaule', tex: '512', bench: '1' });
    if (fxLow) q.set('fx', 'low');
    await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#hud', { timeout: 180000 });
    await page.waitForTimeout(21000);
    const stats = await page.evaluate(() => {
      const times = (window as unknown as { __benchFrames?: number[] }).__benchFrames ?? [];
      const dts: number[] = [];
      for (let i = 1; i < times.length; i++) dts.push(times[i]! - times[i - 1]!);
      // 3 s de chauffe (compile shaders SwiftShader), puis FPS réel = frames / temps.
      let t = 0;
      const usable: number[] = [];
      for (const d of dts) {
        t += d;
        if (t < 3000) continue;
        usable.push(d);
      }
      const wall = usable.reduce((a, b) => a + b, 0);
      const avg = wall > 0 ? (usable.length / wall) * 1000 : 0;
      const steady = usable.filter((d) => d < 1000);
      const min = steady.length ? 1000 / Math.max(...steady) : 0;
      return { avg, min, frames: usable.length, wallMs: wall };
    });
    await browser.close();
    return stats;
  });
}

async function fps() {
  const avant = await fpsOnce(true);
  const apres = await fpsOnce(false);
  const report = { avant, apres, avgReg: 1 - apres.avg / avant.avg, minReg: 1 - apres.min / avant.min };
  writeFileSync(join(OUT, 'fps.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function video() {
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: join(OUT, '_vid'), size: { width: 1280, height: 720 } },
    });
    const page = await context.newPage();
    const q = new URLSearchParams({ autoplay: 'march', seed: '3', cam: 'epaule', tex: '512' });
    await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#hud', { timeout: 180000 });
    await page.waitForTimeout(22000);
    await context.close();
    await browser.close();
    const webm = spawnSync('bash', ['-lc', `ls -1 "${join(OUT, '_vid')}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
    if (!webm) throw new Error('pas de webm');
    const mp4 = join(VID, 'vfx-whoa.mp4');
    const enc = spawnSync('ffmpeg', [
      '-y', '-i', webm, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
      '-crf', '28', '-preset', 'veryfast', '-t', '20', '-movflags', '+faststart', mp4,
    ], { encoding: 'utf8' });
    if (enc.status !== 0) throw new Error(enc.stderr);
    console.log('video', mp4);
  });
}

function lumaReport() {
  const avant = join(OUT, 'luma-ref-avant.png');
  const apres = join(OUT, 'luma-ref-apres.png');
  if (!existsSync(avant) || !existsSync(apres)) throw new Error('manque luma-ref');
  const a = pngLuma(avant);
  const b = pngLuma(apres);
  const delta = b - a;
  const pct = a ? (delta / a) * 100 : 0;
  const ok = Math.abs(pct) <= 5 || Math.abs(delta) <= 1.5;
  const r = { avant: a, apres: b, delta, pct, ok };
  writeFileSync(join(OUT, 'luma.json'), JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 2));
  if (!ok) throw new Error(`luma hors tolérance: ${JSON.stringify(r)}`);
}

if (PHASE === 'stills' || PHASE === 'all') await stills();
if (PHASE === 'luma' || PHASE === 'all') lumaReport();
if (PHASE === 'fps' || PHASE === 'all') await fps();
if (PHASE === 'video' || PHASE === 'all') await video();
console.log('capture-vfx-whoa ok');
