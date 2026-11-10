// Preuve FPS SwiftShader : stills, luma, live sans erreurs, pointer-lock simulé, match vidéo, FPS avant/après.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { decodePngRgba } from '../web/png-rgba.ts';
import { meanLuma } from '../web/banding.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/fps');
const VID = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18196);
const BASE = `http://127.0.0.1:${PORT}`;
const PHASE = process.env.PHASE ?? 'all';
const VIDEO_SEED = process.env.VIDEO_SEED ?? '900002';
const VIDEO_AUTO = process.env.VIDEO_AUTO ?? 'kiter';

mkdirSync(OUT, { recursive: true });
mkdirSync(VID, { recursive: true });
mkdirSync(join(OUT, '_vid'), { recursive: true });

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

function pngLuma(path: string): { full: number; playfield: number } {
  const { rgba, width, height } = decodePngRgba(readFileSync(path));
  return {
    full: meanLuma(rgba, width, height, { x: 0, y: 0, w: width, h: height }),
    playfield: meanLuma(rgba, width, height, { x: 360, y: 160, w: 520, h: 360 }),
  };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const STILLS: { id: string; file: string; qs: string }[] = [
  { id: 'idle', file: 'idle-weapon.png', qs: 'demo=idle&cam=fps&shot=8&tex=512&seed=1' },
  { id: 'bolter', file: 'bolter-fire.png', qs: 'demo=combat-shot&cam=fps&shot=5&tex=512&seed=1' },
  { id: 'fist', file: 'fist.png', qs: 'demo=combat-fist&cam=fps&shot=11&tex=512&seed=1' },
  { id: 'claw', file: 'claw-hit.png', qs: 'demo=combat-hit&cam=fps&shot=6&tex=512&seed=1' },
  { id: 'death', file: 'nl-death.png', qs: 'demo=vfx-death&cam=fps&shot=8&tex=512&seed=1&focus=0' },
];

async function waitLit(page: import('playwright').Page) {
  for (let i = 0; i < 80; i++) {
    const buf = await page.screenshot({ type: 'png' });
    const { rgba, width, height } = decodePngRgba(buf);
    const luma = meanLuma(rgba, width, height, { x: 0, y: 0, w: width, h: height });
    if (luma > 4) return luma;
    await page.waitForTimeout(250);
  }
  throw new Error('canvas resté noir');
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
    for (const a of STILLS) {
      const url = `${base}/?${a.qs}`;
      const page = await context.newPage();
      page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
      await page.screenshot({ path: join(OUT, a.file), type: 'png' });
      await page.close();
      urls[a.id] = url;
      console.log('shot', a.id);
    }
    for (const tag of ['avant', 'apres'] as const) {
      const q = new URLSearchParams({ autoplay: 'march', seed: '18', shot: '40', tex: '512' });
      if (tag === 'avant') q.set('cam', 'couloir');
      else q.set('cam', 'fps');
      const page = await context.newPage();
      await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
      await page.screenshot({ path: join(OUT, `luma-${tag}.png`), type: 'png' });
      await page.close();
    }
    const consoleErrors = consoleLines.filter((l) => l.startsWith('error:') && !l.includes("Couldn't load texture"));
    const report = { urls, console: consoleLines, consoleErrors, pageErrors, networkFailed: net.filter((r) => r.status >= 400) };
    writeFileSync(join(OUT, 'playwright-stills.json'), JSON.stringify(report, null, 2));
    const hardNet = report.networkFailed.filter((r) => !r.url.includes('/web/sfx/'));
    if (pageErrors.length || consoleErrors.filter((l) => !l.includes('404')).length || hardNet.length) {
      throw new Error(`stills: ${JSON.stringify({ pageErrors, consoleErrors, hardNet })}`);
    }
    await browser.close();
  });
  const luma = { avant: pngLuma(join(OUT, 'luma-avant.png')), apres: pngLuma(join(OUT, 'luma-apres.png')) };
  writeFileSync(join(OUT, 'luma.json'), JSON.stringify(luma, null, 2));
  console.log('luma', luma);
}

async function live() {
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const consoleLines: string[] = [];
    const pageErrors: string[] = [];
    const net: { status: number; url: string }[] = [];
    page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
    const url = `${base}/?autoplay=${VIDEO_AUTO}&cam=fps&seed=${VIDEO_SEED}&tex=512&props=0`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#hud', { timeout: 180000 });
    await page.mouse.click(640, 360);
    const lock = await page.evaluate(async () => {
      const c = document.getElementById('c') as HTMLCanvasElement | null;
      try { await c?.requestPointerLock?.(); } catch { /* headless */ }
      (window as unknown as { __fpsSimLook?: boolean }).__fpsSimLook = true;
      const fps = window as unknown as { __FPS?: { applyLook: (x: number, y: number) => void; locked?: boolean } };
      fps.__FPS?.applyLook(18, -6);
      return {
        pointerLockElement: document.pointerLockElement?.id ?? null,
        sim: true,
        yaw: fps.__FPS,
      };
    });
    await page.waitForFunction(() => ((window as unknown as { __NL?: { tick?: number } }).__NL?.tick ?? 0) > 12, undefined, { timeout: 60000 });
    await page.waitForTimeout(800);
    const nl = await page.evaluate(() => (window as unknown as { __NL?: unknown }).__NL);
    const fps = await page.evaluate(() => (window as unknown as { __FPS?: unknown }).__FPS);
    const consoleErrors = consoleLines.filter((l) => l.startsWith('error:') && !l.includes("Couldn't load texture"));
    const failed = net.filter((r) => r.status >= 400 && !r.url.includes('/web/sfx/'));
    const report = { url, lock, nl, fps, console: consoleLines, consoleErrors, pageErrors, networkFailed: failed };
    writeFileSync(join(OUT, 'playwright-live.json'), JSON.stringify(report, null, 2));
    await browser.close();
    if (pageErrors.length) throw new Error(`pageerror live: ${pageErrors.join('\n')}`);
    if (consoleErrors.length) throw new Error(`console live: ${consoleErrors.join('\n')}`);
    if (failed.length) throw new Error(`net live: ${failed.map((n) => `${n.status} ${n.url}`).join('\n')}`);
    console.log('live ok', JSON.stringify({ tick: (nl as { tick?: number })?.tick, lock }));
  });
}

async function fpsOnce(cam: string): Promise<{ avg: number; min: number; frames: number }> {
  return withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const q = new URLSearchParams({ autoplay: 'march', seed: '3', cam, tex: '512', bench: '1' });
    await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#hud', { timeout: 180000 });
    await page.waitForTimeout(12000);
    const stats = await page.evaluate(() => {
      const times = (window as unknown as { __benchFrames?: number[] }).__benchFrames ?? [];
      const dts: number[] = [];
      for (let i = 1; i < times.length; i++) dts.push(times[i]! - times[i - 1]!);
      let t = 0;
      const usable: number[] = [];
      for (const d of dts) {
        t += d;
        if (t < 2500) continue;
        usable.push(d);
      }
      const wall = usable.reduce((a, b) => a + b, 0);
      const avg = wall > 0 ? (usable.length / wall) * 1000 : 0;
      const steady = usable.filter((d) => d < 1000);
      const min = steady.length ? 1000 / Math.max(...steady) : 0;
      return { avg, min, frames: usable.length };
    });
    await browser.close();
    return stats;
  });
}

async function fpsBench() {
  const avant = await fpsOnce('epaule');
  const apres = await fpsOnce('fps');
  const report = { avant, apres, avgReg: avant.avg ? 1 - apres.avg / avant.avg : 0 };
  writeFileSync(join(OUT, 'fps.json'), JSON.stringify(report, null, 2));
  console.log('fps', JSON.stringify(report, null, 2));
}

function encodeH264(webm: string, out: string, ss: number) {
  let crf = 28;
  while (crf <= 36) {
    const r = spawnSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-ss', ss.toFixed(3), '-i', webm,
      '-vf', 'scale=1280:720,fps=24,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out,
    ], { encoding: 'utf8' });
    if (r.status !== 0) {
      const silent = spawnSync('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error', '-ss', ss.toFixed(3), '-i', webm,
        '-vf', 'scale=1280:720,fps=24,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
        '-an', '-movflags', '+faststart', out,
      ], { encoding: 'utf8' });
      if (silent.status !== 0) throw new Error(silent.stderr || r.stderr);
    }
    const bytes = existsSync(out) ? readFileSync(out).length : 1e12;
    if (bytes <= 15 * 1024 * 1024) return { crf, bytes };
    crf += 2;
  }
  throw new Error('video trop lourde');
}

async function matchVideo() {
  const tmp = join(OUT, '_vid');
  const stamps: Record<string, number> = {};
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: tmp, size: { width: 1280, height: 720 } },
    });
    context.setDefaultTimeout(300000);
    const page = await context.newPage();
    await page.route('**/api/round', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: false, reason: 'capture', summary: 'capture fps' }),
      });
    });
    const q = new URLSearchParams({
      autoplay: VIDEO_AUTO, seed: VIDEO_SEED, cam: 'fps', tex: '512', props: '0',
    });
    const tNav = Date.now();
    await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#hud', { timeout: 180000 });
    await page.mouse.click(640, 360);
    await waitLit(page);
    const litAt = (Date.now() - tNav) / 1000;
    await page.waitForFunction((kinds: string[]) => {
      const nl = (window as unknown as { __NL?: { events?: string[] } }).__NL;
      const ev = nl?.events ?? [];
      const w = window as unknown as { __combatSeen?: boolean };
      if (ev.some((e) => kinds.includes(e))) w.__combatSeen = true;
      return !!w.__combatSeen;
    }, ['bolt', 'fist', 'claw', 'hit', 'clawArm'], { timeout: 180000 });
    const contactAt = (Date.now() - tNav) / 1000;
    stamps.contact = contactAt;
    const deadline = Date.now() + 240000;
    let prevFist = 0;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => {
        const nl = (window as unknown as { __NL?: { tick?: number; done?: boolean; events?: string[]; fistCharge?: number; nlsAlive?: number } }).__NL;
        const msg = document.getElementById('msg');
        return {
          tick: nl?.tick ?? 0, done: !!nl?.done, events: nl?.events ?? [],
          fistCharge: nl?.fistCharge ?? 0, nlsAlive: nl?.nlsAlive ?? 4,
          msg: msg ? getComputedStyle(msg).display : 'missing',
          text: msg?.textContent ?? '',
        };
      });
      const t = (Date.now() - tNav) / 1000;
      if (st.events.includes('bolt') && stamps.bolter === undefined) stamps.bolter = t;
      if ((st.events.includes('claw') || st.events.includes('hit')) && stamps.claw === undefined) stamps.claw = t;
      if ((st.events.includes('fist') || (prevFist > 0 && st.fistCharge === 0)) && stamps.fist === undefined) stamps.fist = t;
      if ((st.nlsAlive ?? 4) < 4 && stamps.death === undefined) stamps.death = t;
      prevFist = st.fistCharge;
      if (st.done && st.msg === 'block' && /gagne|abattu|tenu/i.test(st.text)) {
        await page.waitForTimeout(2300);
        stamps.end = (Date.now() - tNav) / 1000;
        await page.screenshot({ path: join(OUT, 'end-card.png'), type: 'png' });
        break;
      }
      await page.waitForTimeout(50);
    }
    if (!existsSync(join(OUT, 'end-card.png'))) {
      await page.waitForTimeout(2200);
      await page.screenshot({ path: join(OUT, 'end-card.png'), type: 'png' });
      stamps.end = (Date.now() - tNav) / 1000;
    }
    await context.close();
    await browser.close();

    const webm = spawnSync('bash', ['-lc', `ls -1t "${tmp}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
    if (!webm) throw new Error('pas de webm');
    const detect = spawnSync('ffmpeg', [
      '-i', webm, '-vf', 'blackdetect=d=0.08:pix_th=0.10', '-an', '-f', 'null', '-',
    ], { encoding: 'utf8' });
    const blackLog = `${detect.stderr}\n${detect.stdout}`;
    let ss = Math.max(0, contactAt - 0.4);
    const blackEnd = [...blackLog.matchAll(/black_end:([\d.]+)/g)].map((m) => Number(m[1]!));
    if (blackEnd.length && blackEnd[0]! > 0) ss = Math.max(ss, blackEnd[0]! + 0.04);
    ss = Math.max(ss, litAt - 0.1, 0);
    const mp4 = join(VID, 'fps-match.mp4');
    const enc = encodeH264(webm, mp4, ss);
    const sig = spawnSync('ffmpeg', [
      '-i', mp4, '-vf', 'blackdetect=d=0.08:pix_th=0.10,signalstats', '-frames:v', '36', '-an', '-f', 'null', '-',
    ], { encoding: 'utf8' });
    const signal = `${sig.stderr}\n${sig.stdout}`;
    writeFileSync(join(OUT, 'blackdetect.txt'), blackLog.slice(-2500));
    writeFileSync(join(OUT, 'signalstats.txt'), signal.slice(-2500));
    writeFileSync(join(OUT, 'video.json'), JSON.stringify({
      url: `${base}/?${q}`, seed: VIDEO_SEED, autoplay: VIDEO_AUTO, litAt, contactAt, ss, enc, stamps,
    }, null, 2));
    console.log('video', mp4, enc, 'stamps', stamps);
  });
}

function hashes() {
  const files = ['idle-weapon.png', 'bolter-fire.png', 'fist.png', 'claw-hit.png', 'nl-death.png', 'end-card.png'];
  const out: Record<string, string> = {};
  for (const f of files) {
    const p = join(OUT, f);
    if (!existsSync(p)) throw new Error(`manque ${f}`);
    out[f] = sha256(p);
  }
  const uniq = new Set(Object.values(out));
  if (uniq.size !== files.length) throw new Error(`sha256 non distincts: ${JSON.stringify(out)}`);
  writeFileSync(join(OUT, 'SHA256SUMS.txt'), Object.entries(out).map(([k, v]) => `${v}  ${k}`).join('\n') + '\n');
  console.log('sha256', out);
}

const run = async () => {
  if (PHASE === 'stills' || PHASE === 'all') await stills();
  if (PHASE === 'live' || PHASE === 'all') await live();
  if (PHASE === 'fps' || PHASE === 'all') await fpsBench();
  if (PHASE === 'video' || PHASE === 'all') await matchVideo();
  if (PHASE === 'hash' || PHASE === 'all' || PHASE === 'stills' || PHASE === 'video') {
    try { hashes(); } catch (e) { if (PHASE === 'all') throw e; console.warn(e); }
  }
};

await run();
