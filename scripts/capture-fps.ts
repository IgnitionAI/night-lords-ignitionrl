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
const VIDEO_SEED = process.env.VIDEO_SEED ?? '900007';
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
  if (path.endsWith('.png')) {
    const { rgba, width, height } = decodePngRgba(readFileSync(path));
    return {
      full: meanLuma(rgba, width, height, { x: 0, y: 0, w: width, h: height }),
      playfield: meanLuma(rgba, width, height, { x: 360, y: 160, w: 520, h: 360 }),
    };
  }
  const yavg = (vf: string) => {
    const r = spawnSync('ffmpeg', [
      '-hide_banner', '-i', path, '-vf', vf, '-frames:v', '1', '-f', 'null', '-',
    ], { encoding: 'utf8' });
    const raw = `${r.stderr ?? ''}\n${r.stdout ?? ''}`;
    const m = raw.match(/YAVG[=:][\s]*([\d.]+)/);
    return m ? Number(m[1]) : 0;
  };
  return {
    full: yavg('signalstats,metadata=print'),
    playfield: yavg('crop=520:360:360:160,signalstats,metadata=print'),
  };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const STILLS: { id: string; file: string; qs: string }[] = [
  { id: 'idle', file: 'idle-weapon.jpg', qs: 'demo=idle&cam=fps&shot=8&tex=512&seed=1' },
  { id: 'bolter', file: 'bolter-fire.jpg', qs: 'demo=combat-shot&cam=fps&shot=5&tex=512&seed=1' },
  { id: 'fist', file: 'fist.jpg', qs: 'demo=combat-fist&cam=fps&shot=11&tex=512&seed=1' },
  { id: 'claw', file: 'claw-hit.jpg', qs: 'demo=combat-hit&cam=fps&shot=6&tex=512&seed=1' },
  { id: 'death', file: 'nl-death.jpg', qs: 'demo=vfx-death&cam=fps&shot=8&tex=512&seed=1&focus=0' },
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
      await page.screenshot({ path: join(OUT, a.file), type: 'jpeg', quality: 90 });
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
      await page.screenshot({ path: join(OUT, `luma-${tag}.jpg`), type: 'jpeg', quality: 90 });
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
  const luma = { avant: pngLuma(join(OUT, 'luma-avant.jpg')), apres: pngLuma(join(OUT, 'luma-apres.jpg')) };
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

function writeWav(path: string, interleaved: Float32Array, sampleRate: number, channels = 2) {
  const n = interleaved.length;
  const i16 = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, interleaved[i]!));
    i16.writeInt16LE((s * 32767) | 0, i * 2);
  }
  const dataSize = i16.length;
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0);
  hdr.writeUInt32LE(36 + dataSize, 4);
  hdr.write('WAVE', 8);
  hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(channels, 22);
  hdr.writeUInt32LE(sampleRate, 24);
  hdr.writeUInt32LE(sampleRate * channels * 2, 28);
  hdr.writeUInt16LE(channels * 2, 32);
  hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36);
  hdr.writeUInt32LE(dataSize, 40);
  writeFileSync(path, Buffer.concat([hdr, i16]));
}

function loudnormAac(wav: string, aac: string) {
  const meas = spawnSync('ffmpeg', [
    '-hide_banner', '-i', wav, '-af', 'loudnorm=I=-15:TP=-2:LRA=11:print_format=json', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const raw = `${meas.stderr ?? ''}\n${meas.stdout ?? ''}`;
  const jsonMatch = raw.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  const measured = jsonMatch ? JSON.parse(jsonMatch[0]) as Record<string, string> : {};
  const ln = [
    'loudnorm=I=-15:TP=-2:LRA=11',
    measured.input_i != null ? `measured_I=${measured.input_i}` : '',
    measured.input_tp != null ? `measured_TP=${measured.input_tp}` : '',
    measured.input_lra != null ? `measured_LRA=${measured.input_lra}` : '',
    measured.input_thresh != null ? `measured_thresh=${measured.input_thresh}` : '',
    measured.target_offset != null ? `offset=${measured.target_offset}` : '',
    'linear=true',
  ].filter(Boolean).join(':');
  // -2 dBTP = 10^(-2/20) ≈ 0.7943282 ; 48 kHz pour l'AAC final (pas 96 kHz).
  const af = `${ln},alimiter=limit=0.70794578:level=false:attack=1:release=50`;
  const enc = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-af', af,
    '-ar', '48000', '-c:a', 'aac', '-b:a', '128k', aac,
  ], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(enc.stderr || 'loudnorm aac');
  const ebu = spawnSync('ffmpeg', [
    '-hide_banner', '-i', aac, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const ebuRaw = `${ebu.stderr ?? ''}\n${ebu.stdout ?? ''}`;
  writeFileSync(join(OUT, 'loudnorm.txt'), raw.slice(-3500) + '\n--- ebur128 aac ---\n' + ebuRaw.slice(-2000));
  return { raw, measured, ebuRaw, af };
}

function encodeH264(webm: string, aac: string | null, out: string, ss: number, audioSkip: number) {
  let crf = 28;
  while (crf <= 36) {
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-ss', ss.toFixed(3), '-i', webm,
    ];
    if (aac && existsSync(aac)) {
      if (audioSkip > 0) args.push('-ss', audioSkip.toFixed(3));
      args.push('-i', aac, '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'copy', '-shortest');
    } else {
      args.push('-an');
    }
    args.push(
      '-vf', 'scale=1280:720,fps=24,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
      '-movflags', '+faststart', out,
    );
    const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || 'encode');
    const bytes = existsSync(out) ? readFileSync(out).length : 1e12;
    if (bytes <= 15 * 1024 * 1024) return { crf, bytes };
    crf += 2;
  }
  throw new Error('video trop lourde');
}

async function pullTape(page: import('playwright').Page): Promise<{ sampleRate: number; peak: number; frames: number; interleaved: Float32Array }> {
  const meta = await page.evaluate(() => {
    const eng = (window as unknown as { __AUDIO?: { endTape: () => { sampleRate: number; interleaved: Float32Array; peak: number; frames: number } } }).__AUDIO;
    if (!eng) return { sampleRate: 0, peak: 0, frames: 0, n: 0 };
    const t = eng.endTape();
    (window as unknown as { __tapeI16?: Int16Array; __tapeMeta?: { sampleRate: number; peak: number; frames: number; n: number } }).__tapeI16 = (() => {
      const i16 = new Int16Array(t.interleaved.length);
      for (let i = 0; i < t.interleaved.length; i++) {
        const s = Math.max(-1, Math.min(1, t.interleaved[i]!));
        i16[i] = (s * 32767) | 0;
      }
      return i16;
    })();
    return { sampleRate: t.sampleRate, peak: t.peak, frames: t.frames, n: t.interleaved.length };
  });
  const interleaved = new Float32Array(meta.n);
  const chunk = 48000;
  for (let off = 0; off < meta.n; off += chunk) {
    const slice = await page.evaluate(({ off, chunk }) => {
      const i16 = (window as unknown as { __tapeI16?: Int16Array }).__tapeI16;
      if (!i16) return [];
      const end = Math.min(i16.length, off + chunk);
      const out: number[] = [];
      for (let i = off; i < end; i++) out.push(i16[i]!);
      return out;
    }, { off, chunk });
    for (let i = 0; i < slice.length; i++) interleaved[off + i] = slice[i]! / 32767;
  }
  return { sampleRate: meta.sampleRate, peak: meta.peak, frames: meta.frames, interleaved };
}

function grabFrame(mp4: string, t: number, dest: string) {
  const r = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', Math.max(0, t).toFixed(3), '-i', mp4, '-frames:v', '1', '-q:v', '2', dest,
  ], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(dest)) throw new Error(`frame ${dest}: ${r.stderr}`);
}

async function matchVideo() {
  const tmp = join(OUT, '_vid');
  const stamps: Record<string, number> = {};
  const ticks: Record<string, number> = {};
  await withServer(async (base) => {
    const browser = await chromium.launch({
      headless: true,
      ignoreDefaultArgs: ['--mute-audio'],
      args: [...SW, '--autoplay-policy=no-user-gesture-required'],
    });
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
      autoplay: VIDEO_AUTO, seed: VIDEO_SEED, cam: 'fps', tex: '512', props: '0', cap: '1',
    });
    const tNav = Date.now();
    await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#hud', { timeout: 180000 });
    await page.mouse.click(640, 360);
    await page.waitForFunction(() => {
      const nl = (window as unknown as { __NL?: { audio?: { state?: string; decoded?: string[] } } }).__NL;
      return nl?.audio?.state === 'running' && (nl.audio.decoded?.length ?? 0) >= 3;
    }, undefined, { timeout: 60000 }).catch(() => null);
    const tTape = Date.now();
    const tapeOn = await page.evaluate(async () => {
      const eng = (window as unknown as {
        __AUDIO?: {
          unlock: () => boolean;
          beginTape: () => boolean;
          captureStream: () => MediaStream | null;
          ctx?: AudioContext;
        };
      }).__AUDIO;
      if (!eng) return { tape: false, rec: false, state: 'none' };
      eng.unlock();
      if (eng.ctx && eng.ctx.state !== 'running') await eng.ctx.resume();
      const stream = eng.captureStream();
      let rec = false;
      if (stream && typeof MediaRecorder !== 'undefined') {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
        const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.start(200);
        (window as unknown as { __rec?: MediaRecorder; __recChunks?: Blob[] }).__rec = recorder;
        (window as unknown as { __recChunks?: Blob[] }).__recChunks = chunks;
        rec = true;
      }
      return { rec, state: eng.ctx?.state ?? 'none', stream: !!stream };
    });
    console.log('tapeOn', tapeOn);
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
      if (st.events.includes('bolt') && stamps.bolter === undefined) {
        stamps.bolter = t; ticks.bolter = st.tick;
      }
      if ((st.events.includes('claw') || st.events.includes('hit')) && stamps.claw === undefined) {
        stamps.claw = t; ticks.claw = st.tick;
        await page.screenshot({ path: join(OUT, 'claw-hit.jpg'), type: 'jpeg', quality: 90 });
        ticks.clawShot = st.tick;
      }
      if (st.events.includes('fistCharge') && stamps.fistCharge === undefined) {
        stamps.fistCharge = t; ticks.fistCharge = st.tick;
      }
      if ((st.events.includes('fist') || (prevFist > 0 && st.fistCharge === 0)) && stamps.fist === undefined) {
        stamps.fist = t; ticks.fist = st.tick;
      }
      if ((st.nlsAlive ?? 4) < 4 && stamps.death === undefined) {
        stamps.death = t; ticks.death = st.tick;
      }
      prevFist = st.fistCharge;
      if (st.done && st.msg === 'block' && /gagne|abattu|tenu/i.test(st.text)) {
        await page.waitForTimeout(2300);
        stamps.end = (Date.now() - tNav) / 1000;
        ticks.end = st.tick;
        await page.screenshot({ path: join(OUT, 'end-card.jpg'), type: 'jpeg', quality: 90 });
        break;
      }
      await page.waitForTimeout(30);
    }
    if (!existsSync(join(OUT, 'end-card.jpg'))) {
      await page.waitForTimeout(2200);
      await page.screenshot({ path: join(OUT, 'end-card.jpg'), type: 'jpeg', quality: 90 });
      stamps.end = (Date.now() - tNav) / 1000;
    }
    const caps = await page.evaluate(() => {
      return (window as unknown as { __fpsCaps?: Record<string, { tick: number; png: string }> }).__fpsCaps ?? {};
    });
    const writeCap = (key: string, file: string) => {
      const cap = caps[key];
      if (!cap?.png) return false;
      const b64 = cap.png.replace(/^data:image\/png;base64,/, '');
      writeFileSync(join(OUT, file), Buffer.from(b64.replace(/^data:image\/jpeg;base64,/, ''), 'base64'));
      ticks[`${key}Cap`] = cap.tick;
      return true;
    };
    writeCap('bolter', 'bolter-fire.jpg');
    if (!existsSync(join(OUT, 'claw-hit.jpg'))) writeCap('claw', 'claw-hit.jpg');
    writeCap('fist', 'fist.jpg');
    if (!writeCap('death', 'nl-death.jpg') || (caps.death && caps.bolter && caps.death.tick === caps.bolter.tick)) {
      ticks.deathOffset = 1;
    }
    const seen = await page.evaluate(() => (window as unknown as { __NL?: { seen?: string[] } }).__NL?.seen ?? []);
    console.log('caps', Object.keys(caps), 'seen', seen);
    const recB64 = await page.evaluate(async () => {
      const w = window as unknown as { __rec?: MediaRecorder; __recChunks?: Blob[] };
      if (!w.__rec) return '';
      const stopped = new Promise<void>((resolve) => { w.__rec!.onstop = () => resolve(); });
      try { w.__rec.stop(); } catch { return ''; }
      await stopped;
      const blob = new Blob(w.__recChunks ?? [], { type: 'audio/webm' });
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      let bin = '';
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(bin);
    });
    const aac = join(tmp, 'webaudio.m4a');
    const recWebm = join(tmp, 'mix-audio.webm');
    if (!(recB64 && recB64.length > 400)) {
      throw new Error(`MediaRecorder WebAudio vide rec=${recB64.length}`);
    }
    writeFileSync(recWebm, Buffer.from(recB64, 'base64'));
    const ln = loudnormAac(recWebm, aac);
    await context.close();
    await browser.close();

    const webm = spawnSync('bash', ['-lc', `ls -1t "${tmp}"/*.webm | grep -v mix-audio | head -1`], { encoding: 'utf8' }).stdout.trim();
    if (!webm) throw new Error('pas de webm');
    const detect = spawnSync('ffmpeg', [
      '-i', webm, '-vf', 'blackdetect=d=0.08:pix_th=0.10', '-an', '-f', 'null', '-',
    ], { encoding: 'utf8' });
    const blackLog = `${detect.stderr}\n${detect.stdout}`;
    let ss = Math.max(0, litAt - 0.12);
    const blackEnd = [...blackLog.matchAll(/black_end:([\d.]+)/g)].map((m) => Number(m[1]!));
    if (blackEnd.length && blackEnd[0]! > 0) ss = Math.max(ss, blackEnd[0]! + 0.04);
    const tapeOffset = (tTape - tNav) / 1000;
    const audioSkip = Math.max(0, ss - tapeOffset);
    const mp4 = join(VID, 'fps-match.mp4');
    const enc = encodeH264(webm, aac, mp4, ss, audioSkip);
    const sig = spawnSync('ffmpeg', [
      '-i', mp4, '-vf', 'blackdetect=d=0.08:pix_th=0.10,signalstats', '-frames:v', '36', '-an', '-f', 'null', '-',
    ], { encoding: 'utf8' });
    const signal = `${sig.stderr}\n${sig.stdout}`;
    const videoStamps: Record<string, number> = {};
    for (const [k, v] of Object.entries(stamps)) videoStamps[k] = Math.max(0, v - ss);
    const liveShots = {
      bolter: existsSync(join(OUT, 'bolter-fire.jpg')),
      claw: existsSync(join(OUT, 'claw-hit.jpg')),
      fist: existsSync(join(OUT, 'fist.jpg')),
      death: existsSync(join(OUT, 'nl-death.jpg')),
    };
    if (!liveShots.bolter && videoStamps.bolter != null) grabFrame(mp4, videoStamps.bolter, join(OUT, 'bolter-fire.jpg'));
    if (!liveShots.claw && videoStamps.claw != null) grabFrame(mp4, videoStamps.claw, join(OUT, 'claw-hit.jpg'));
    const fistT = videoStamps.fistCharge ?? videoStamps.fist;
    if (!liveShots.fist && fistT != null) grabFrame(mp4, fistT, join(OUT, 'fist.jpg'));
    if ((!liveShots.death || ticks.deathOffset) && videoStamps.death != null) {
      const deathT = videoStamps.death + 0.55;
      grabFrame(mp4, deathT, join(OUT, 'nl-death.jpg'));
    }
    const ebuMp4 = spawnSync('ffmpeg', [
      '-hide_banner', '-i', mp4, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-',
    ], { encoding: 'utf8' });
    const ebuMp4Raw = `${ebuMp4.stderr ?? ''}\n${ebuMp4.stdout ?? ''}`;
    writeFileSync(join(OUT, 'ebur128-mp4.txt'), ebuMp4Raw.slice(-2500));
    const aacProbe = spawnSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate', '-of', 'json', mp4,
    ], { encoding: 'utf8' });
    writeFileSync(join(OUT, 'blackdetect.txt'), blackLog.slice(-2500));
    writeFileSync(join(OUT, 'signalstats.txt'), signal.slice(-2500));
    writeFileSync(join(OUT, 'video.json'), JSON.stringify({
      url: `${base}/?${q}`, seed: VIDEO_SEED, autoplay: VIDEO_AUTO, litAt, contactAt, ss,
      tapeOffset, audioSkip, recBytes: Buffer.from(recB64, 'base64').length,
      enc, stamps, videoStamps, ticks, loudnorm: ln.measured, af: ln.af, seen,
      aacProbe: aacProbe.stdout, ebuMp4: ebuMp4Raw.slice(-1800),
    }, null, 2));
    console.log('video', mp4, enc, 'stamps', videoStamps, 'rec', recB64.length);
  });
}

function hashes() {
  const files = ['idle-weapon.jpg', 'bolter-fire.jpg', 'fist.jpg', 'claw-hit.jpg', 'nl-death.jpg', 'end-card.jpg'];
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
