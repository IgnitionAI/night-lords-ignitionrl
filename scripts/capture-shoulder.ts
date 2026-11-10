// Preuve caméra épaule : match ?cam=shoulder&autoplay, WebAudio #75, stills JPEG.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { decodePngRgba } from '../web/png-rgba.ts';
import { meanLuma } from '../web/banding.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/shoulder');
const VID = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18211);
const BASE = `http://127.0.0.1:${PORT}`;
const VIDEO_SEED = process.env.VIDEO_SEED ?? '900007';
const VIDEO_AUTO = process.env.VIDEO_AUTO ?? 'kiter';
const MAX_PLAY_S = Number(process.env.MAX_PLAY_S ?? 42);

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
  const af = `${ln},alimiter=limit=0.79432823:level=false:attack=1:release=80`;
  const enc = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-af', af,
    '-ar', '48000', '-c:a', 'aac', '-b:a', '96k', aac,
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
  let crf = 30;
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
    if (bytes <= 8 * 1024 * 1024) return { crf, bytes };
    crf += 2;
  }
  throw new Error('video trop lourde');
}

function grabFrame(mp4: string, t: number, dest: string) {
  const r = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', Math.max(0, t).toFixed(3), '-i', mp4, '-frames:v', '1', '-q:v', '4', dest,
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
        body: JSON.stringify({ ok: false, reason: 'capture', summary: 'capture shoulder' }),
      });
    });
    const q = new URLSearchParams({
      autoplay: VIDEO_AUTO, seed: VIDEO_SEED, cam: 'shoulder', tex: '512', props: '0',
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
      if (!eng) return { rec: false, state: 'none' };
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
    const litLuma = await waitLit(page);
    const litAt = (Date.now() - tNav) / 1000;
    await page.waitForFunction((kinds: string[]) => {
      const nl = (window as unknown as { __NL?: { events?: string[] } }).__NL;
      const ev = nl?.events ?? [];
      return ev.some((e) => kinds.includes(e));
    }, ['bolt', 'fist', 'claw', 'hit', 'clawArm'], { timeout: 180000 });
    const contactAt = (Date.now() - tNav) / 1000;
    stamps.contact = contactAt;
    const deadline = Date.now() + Math.min(240000, MAX_PLAY_S * 1000 + 8000);
    let prevFist = 0;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => {
        const nl = (window as unknown as { __NL?: { tick?: number; done?: boolean; events?: string[]; seen?: string[]; fistCharge?: number; nlsAlive?: number } }).__NL;
        const msg = document.getElementById('msg');
        const om = [0, 1, 2, 3].map((i) => document.getElementById('om' + i)?.style.display);
        return {
          tick: nl?.tick ?? 0, done: !!nl?.done, events: nl?.events ?? [],
          seen: nl?.seen ?? [],
          fistCharge: nl?.fistCharge ?? 0, nlsAlive: nl?.nlsAlive ?? 4,
          msg: msg ? getComputedStyle(msg).display : 'missing',
          text: msg?.textContent ?? '',
          om,
        };
      });
      const t = (Date.now() - tNav) / 1000;
      const seen = [...st.events, ...st.seen];
      if (seen.includes('bolt') && stamps.bolter === undefined) {
        stamps.bolter = t; ticks.bolter = st.tick;
        await page.screenshot({ path: join(OUT, 'bolter.jpg'), type: 'jpeg', quality: 82 });
      }
      if ((seen.includes('claw') || seen.includes('hit')) && stamps.claw === undefined) {
        stamps.claw = t; ticks.claw = st.tick;
        await page.screenshot({ path: join(OUT, 'claw-hit.jpg'), type: 'jpeg', quality: 82 });
      }
      if (seen.includes('fistCharge') && stamps.fistCharge === undefined) {
        stamps.fistCharge = t; ticks.fistCharge = st.tick;
      }
      if ((seen.includes('fist') || (prevFist > 0 && st.fistCharge === 0)) && stamps.fist === undefined) {
        stamps.fist = t; ticks.fist = st.tick;
        await page.screenshot({ path: join(OUT, 'fist.jpg'), type: 'jpeg', quality: 82 });
      }
      if (st.om.some((d) => d === 'block') && stamps.threat === undefined) {
        stamps.threat = t; ticks.threat = st.tick;
        await page.screenshot({ path: join(OUT, 'threat.jpg'), type: 'jpeg', quality: 82 });
      }
      prevFist = st.fistCharge;
      const played = t - litAt;
      if (st.done) {
        await page.waitForTimeout(2400);
        stamps.end = (Date.now() - tNav) / 1000;
        ticks.end = st.tick;
        await page.screenshot({ path: join(OUT, 'end-card.jpg'), type: 'jpeg', quality: 82 });
        break;
      }
      if (played >= MAX_PLAY_S) {
        stamps.end = t;
        ticks.end = st.tick;
        await page.screenshot({ path: join(OUT, 'end-card.jpg'), type: 'jpeg', quality: 82 });
        break;
      }
      await page.waitForTimeout(40);
    }
    if (!existsSync(join(OUT, 'end-card.jpg'))) {
      await page.screenshot({ path: join(OUT, 'end-card.jpg'), type: 'jpeg', quality: 82 });
      stamps.end = (Date.now() - tNav) / 1000;
    }
    const caps = await page.evaluate(() => {
      return (window as unknown as { __fpsCaps?: Record<string, { tick: number; png: string }> }).__fpsCaps ?? {};
    });
    const writeCap = (key: string, file: string) => {
      if (existsSync(join(OUT, file))) return false;
      const cap = caps[key];
      if (!cap?.png) return false;
      writeFileSync(join(OUT, file), Buffer.from(cap.png.replace(/^data:image\/(png|jpeg);base64,/, ''), 'base64'));
      ticks[`${key}Cap`] = cap.tick;
      return true;
    };
    writeCap('bolter', 'bolter.jpg');
    writeCap('claw', 'claw-hit.jpg');
    writeCap('fist', 'fist.jpg');
    writeCap('threat', 'threat.jpg');
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
    const mp4 = join(VID, 'shoulder-match.mp4');
    const enc = encodeH264(webm, aac, mp4, ss, audioSkip);
    const videoStamps: Record<string, number> = {};
    for (const [k, v] of Object.entries(stamps)) videoStamps[k] = Math.max(0, v - ss);
    if (!existsSync(join(OUT, 'bolter.jpg')) && videoStamps.bolter != null) grabFrame(mp4, videoStamps.bolter, join(OUT, 'bolter.jpg'));
    if (!existsSync(join(OUT, 'claw-hit.jpg')) && videoStamps.claw != null) grabFrame(mp4, videoStamps.claw, join(OUT, 'claw-hit.jpg'));
    const fistT = videoStamps.fist ?? videoStamps.fistCharge;
    if (!existsSync(join(OUT, 'fist.jpg')) && fistT != null) grabFrame(mp4, fistT, join(OUT, 'fist.jpg'));
    if (!existsSync(join(OUT, 'threat.jpg')) && videoStamps.threat != null) grabFrame(mp4, videoStamps.threat, join(OUT, 'threat.jpg'));
    if (!existsSync(join(OUT, 'threat.jpg'))) grabFrame(mp4, Math.min(8, (videoStamps.end ?? 12) * 0.35), join(OUT, 'threat.jpg'));
    const ebuMp4 = spawnSync('ffmpeg', [
      '-hide_banner', '-i', mp4, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-',
    ], { encoding: 'utf8' });
    const ebuMp4Raw = `${ebuMp4.stderr ?? ''}\n${ebuMp4.stdout ?? ''}`;
    writeFileSync(join(OUT, 'ebur128-mp4.txt'), ebuMp4Raw.slice(-2500));
    const dur = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
    const sig = spawnSync('ffmpeg', [
      '-i', mp4, '-vf', 'blackdetect=d=0.08:pix_th=0.10,signalstats', '-frames:v', '24', '-an', '-f', 'null', '-',
    ], { encoding: 'utf8' });
    writeFileSync(join(OUT, 'blackdetect.txt'), blackLog.slice(-2500));
    writeFileSync(join(OUT, 'signalstats.txt'), `${sig.stderr}\n${sig.stdout}`.slice(-2500));
    writeFileSync(join(OUT, 'video.json'), JSON.stringify({
      url: `${base}/?${q}`, seed: VIDEO_SEED, autoplay: VIDEO_AUTO, litAt, litLuma, contactAt, ss,
      tapeOffset, audioSkip, recBytes: Buffer.from(recB64, 'base64').length,
      enc, stamps, videoStamps, ticks, loudnorm: ln.measured, af: ln.af,
      duration: dur.stdout.trim(), ebuMp4: ebuMp4Raw.slice(-1800),
    }, null, 2));
    console.log('video', mp4, enc, 'stamps', videoStamps, 'dur', dur.stdout.trim());
  });
}

await matchVideo();
