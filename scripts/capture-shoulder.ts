// Preuve caméra épaule : manche ?cam=shoulder&autoplay, 1 tick = 1 frame, stills extraits du mp4.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/shoulder');
const VID = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18212);
const BASE = `http://127.0.0.1:${PORT}`;
const VIDEO_SEED = process.env.VIDEO_SEED ?? '900007';
const VIDEO_AUTO = process.env.VIDEO_AUTO ?? 'kiter';
const FPS = 10; // DT = 0,1 s → 1 tick / image, lecture 1×
const END_HOLD_S = 2.4;

mkdirSync(OUT, { recursive: true });
mkdirSync(VID, { recursive: true });

const SW = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-frame-rate-limit',
];

type StepInfo = {
  tick?: number;
  done?: boolean;
  winner?: string;
  reason?: string;
  msgShown?: boolean;
  events?: string[];
  eventWho?: (number | null)[];
  fistCharge?: number;
  om?: string[];
  pose?: { camX: number; camY: number; camZ: number; lookX: number; lookY: number; lookZ: number; orbit: number };
  read?: {
    termOnScreen?: boolean;
    termMeshOn?: boolean;
    termMeshShare?: number;
    termMeshArea?: number;
    headOn?: boolean;
    shoulderOn?: boolean;
    nls?: { i: number; readable?: boolean; distCam?: number; meshOn?: boolean; distTerm?: number }[];
  };
};

type LiveAcc = {
  seed: number;
  winner?: string;
  tick: number;
  frames: number;
  termInFov: number;
  areaOk: number;
  headShoulderOk: number;
  clawHits: number;
  clawNlClear: number;
  clawSmooth: number;
  clawWindowTicks: number;
  clawWindowSmooth: number;
  clawWindowMaxCam: number;
};

function freshAcc(seed: number): LiveAcc {
  return {
    seed, tick: 0, frames: 0, termInFov: 0, areaOk: 0, headShoulderOk: 0,
    clawHits: 0, clawNlClear: 0, clawSmooth: 0, clawWindowTicks: 0, clawWindowSmooth: 0,
    clawWindowMaxCam: 0,
  };
}

function poseCamDist(
  a?: { camX: number; camY: number; camZ: number; lookX: number; lookY: number; lookZ: number; orbit: number },
  b?: { camX: number; camY: number; camZ: number; lookX: number; lookY: number; lookZ: number; orbit: number },
) {
  if (!a || !b) return { cam: 0, look: 0, orbit: 0 };
  const ax = a.lookX - a.camX, ay = a.lookY - a.camY, az = a.lookZ - a.camZ;
  const bx = b.lookX - b.camX, by = b.lookY - b.camY, bz = b.lookZ - b.camZ;
  const al = Math.hypot(ax, ay, az) || 1;
  const bl = Math.hypot(bx, by, bz) || 1;
  const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (al * bl)));
  return {
    cam: Math.hypot(b.camX - a.camX, b.camY - a.camY, b.camZ - a.camZ),
    look: Math.hypot(b.lookX - a.lookX, b.lookY - a.lookY, b.lookZ - a.lookZ),
    orbit: Math.acos(dot),
  };
}

function ingestLive(acc: LiveAcc, last: StepInfo, prevPose: StepInfo['pose'] | null, holding: boolean) {
  acc.tick = last.tick ?? acc.tick;
  acc.frames++;
  const read = last.read;
  if (read?.termMeshOn || read?.termOnScreen) acc.termInFov++;
  const area = read?.termMeshArea ?? 1;
  if (area <= 0.4) acc.areaOk++;
  if (read?.headOn && read?.shoulderOn) acc.headShoulderOk++;
  const d = poseCamDist(prevPose, last.pose);
  if (holding && prevPose) {
    acc.clawWindowTicks++;
    acc.clawWindowMaxCam = Math.max(acc.clawWindowMaxCam, d.cam);
    if (d.cam <= 0.72 + 1e-6 && d.look <= 1.20 + 1e-6 && d.orbit <= 0.55 + 1e-6) acc.clawWindowSmooth++;
  }
  const ev = last.events ?? [];
  const who = last.eventWho ?? [];
  for (let i = 0; i < ev.length; i++) {
    if (ev[i] !== 'claw') continue;
    acc.clawHits++;
    const idx = who[i];
    const nl = read?.nls?.find((n) => n.i === idx);
    if (nl?.meshOn) acc.clawNlClear++;
    if (d.cam <= 0.72 + 1e-6 && d.look <= 1.20 + 1e-6 && d.orbit <= 0.55 + 1e-6) acc.clawSmooth++;
  }
}

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

async function grabPage(page: {
  screenshot: (opts: Record<string, unknown>) => Promise<Buffer | void>;
}, path: string) {
  await page.screenshot({
    path, type: 'jpeg', quality: 70, timeout: 30000, animations: 'disabled', caret: 'hide',
  });
}

function durationSec(src: string): number {
  const p = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src,
  ], { encoding: 'utf8' });
  return Number(p.stdout.trim());
}

function grabFrame(mp4: string, t: number, dest: string) {
  const r = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', mp4, '-ss', Math.max(0, t).toFixed(3), '-frames:v', '1', '-q:v', '4', dest,
  ], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(dest)) throw new Error(`frame ${dest}: ${r.stderr}`);
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
  const af = `${ln},alimiter=limit=0.70794578:level=false:attack=1:release=80`;
  const enc = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-af', af,
    '-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', '96k', aac,
  ], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(enc.stderr || 'loudnorm aac');
  writeFileSync(join(OUT, 'loudnorm.txt'), raw.slice(-3500));
  return { raw, measured, af };
}

function encodeH264(seqDir: string, aac: string | null, out: string) {
  let crf = 32;
  while (crf <= 36) {
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(FPS), '-i', join(seqDir, '%04d.jpg'),
    ];
    if (aac && existsSync(aac)) {
      args.push('-i', aac, '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'copy', '-shortest');
    } else {
      args.push('-an');
    }
    args.push(
      '-vf', 'scale=1280:720,fps=24,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
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

function freezeBefore(mp4: string, beforeS: number): { raw: string; longHits: { t: number; d: number }[] } {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-i', mp4, '-vf', 'freezedetect=n=0.003:d=0.3', '-an', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const raw = `${r.stderr ?? ''}\n${r.stdout ?? ''}`;
  const starts = [...raw.matchAll(/freeze_start:([\d.]+)/g)].map((m) => Number(m[1]));
  const durs = [...raw.matchAll(/freeze_duration:([\d.]+)/g)].map((m) => Number(m[1]));
  const longHits: { t: number; d: number }[] = [];
  for (let i = 0; i < starts.length; i++) {
    const t = starts[i]!;
    const d = durs[i] ?? 0.3;
    if (t + 0.05 < beforeS) longHits.push({ t, d });
  }
  writeFileSync(join(OUT, 'freezedetect.txt'), raw.slice(-4000));
  return { raw, longHits };
}

async function matchVideo() {
  const tmp = join(OUT, '_vid');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const ticks: Record<string, number> = {};
  const videoStamps: Record<string, number> = {};
  let nFrames = 0;
  let last: StepInfo | undefined;
  const liveVideo = freshAcc(Number(VIDEO_SEED));
  let prevPose: StepInfo['pose'] | null = null;
  let holding = false;
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    context.setDefaultTimeout(300000);
    const page = await context.newPage();
    await page.route('**/api/round', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: false, reason: 'capture', summary: 'capture shoulder' }),
      });
    });
    const q = new URLSearchParams({
      autoplay: VIDEO_AUTO, seed: VIDEO_SEED, cam: 'shoulder', tex: '512', props: '0', cap: '1',
    });
    await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => (window as unknown as { __SCENE_READY?: boolean }).__SCENE_READY === true, { timeout: 180000 });
    await page.mouse.click(640, 360);

    const stamp = (key: string, tick: number) => {
      if (videoStamps[key] !== undefined) return;
      videoStamps[key] = nFrames / FPS;
      ticks[key] = tick;
    };

    await grabPage(page, join(tmp, `${String(nFrames).padStart(4, '0')}.jpg`));
    nFrames++;

    for (let i = 0; i < 1400; i++) {
      last = await page.evaluate(() => (
        window as unknown as { __capStep?: (n?: number) => StepInfo }
      ).__capStep?.(1));
      await grabPage(page, join(tmp, `${String(nFrames).padStart(4, '0')}.jpg`));
      const ev = last?.events ?? [];
      const tick = last?.tick ?? 0;
      const termOn = last?.read?.termMeshOn === true || last?.read?.termOnScreen === true;
      if (ev.includes('bolt')) stamp('bolter', tick);
      if (ev.includes('fist')) stamp('fist', tick);
      if (ev.includes('claw')) stamp('claw', tick);
      if (tick >= 30 && termOn && last?.om?.some((d) => d !== 'none')) stamp('threat', tick);
      if (ev.includes('claw') || ev.includes('clawArm') || ev.includes('whiff')) holding = true;
      if (last) ingestLive(liveVideo, last, prevPose, holding);
      prevPose = last?.pose ?? prevPose;
      if (holding && liveVideo.clawWindowTicks > 8 && !ev.includes('claw') && !ev.includes('clawArm')) {
        holding = false;
      }
      nFrames++;
      if (i % 40 === 0) console.log('tick', last?.tick, last?.done, last?.winner);
      if (last?.done) break;
    }
    if (!last?.done) throw new Error(`manche non terminée tick=${last?.tick}`);
    await page.waitForFunction(() => {
      const msg = document.getElementById('msg');
      return !!msg && getComputedStyle(msg).display === 'block';
    }, { timeout: 15000 }).catch(() => null);
    await grabPage(page, join(tmp, `${String(nFrames).padStart(4, '0')}.jpg`));
    stamp('end', last.tick ?? 0);
    nFrames++;
    const hold = Math.round(END_HOLD_S * FPS);
    const lastJpg = join(tmp, `${String(nFrames - 1).padStart(4, '0')}.jpg`);
    for (let h = 0; h < hold; h++) {
      spawnSync('cp', [lastJpg, join(tmp, `${String(nFrames).padStart(4, '0')}.jpg`)]);
      nFrames++;
    }
    await browser.close();
  });

  const cuesPath = join(OUT, 'cues.json');
  const dump = spawnSync('bun', ['scripts/dump-match-cues.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      SEED: VIDEO_SEED, AUTOPLAY: VIDEO_AUTO, POLICY: 'b5', PROPS: '0', HUNT: '1', OUT: cuesPath,
    },
    encoding: 'utf8',
  });
  process.stdout.write(dump.stdout);
  process.stderr.write(dump.stderr);
  if (dump.status !== 0) throw new Error('dump cues');
  const wav = join(tmp, 'mix.wav');
  const mix = spawnSync('python3', ['scripts/mix-match-audio.py', cuesPath, wav], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(mix.stdout);
  process.stderr.write(mix.stderr);
  if (mix.status !== 0) throw new Error('mix audio');
  const aac = join(tmp, 'mix.m4a');
  const ln = loudnormAac(wav, aac);
  const mp4 = join(VID, 'shoulder-match.mp4');
  const enc = encodeH264(tmp, aac, mp4);
  const dur = durationSec(mp4);
  const ebuMp4 = spawnSync('ffmpeg', [
    '-hide_banner', '-i', mp4, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const ebuMp4Raw = `${ebuMp4.stderr ?? ''}\n${ebuMp4.stdout ?? ''}`;
  writeFileSync(join(OUT, 'ebur128-mp4.txt'), ebuMp4Raw.slice(-2500));
  const iAll = [...ebuMp4Raw.matchAll(/\bI:\s+(-?[\d.]+)\s+LUFS/g)];
  const tpM = ebuMp4Raw.match(/True peak:[\s\S]*?Peak:\s+(-?[\d.]+)\s+dBFS/);
  const ebuFinal = { I: iAll.length ? Number(iAll[iAll.length - 1]![1]) : null, TP: tpM ? Number(tpM[1]) : null };
  const black = spawnSync('ffmpeg', [
    '-i', mp4, '-vf', 'blackdetect=d=0.08:pix_th=0.10', '-an', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  writeFileSync(join(OUT, 'blackdetect.txt'), `${black.stderr}\n${black.stdout}`.slice(-2500));
  const freeze = freezeBefore(mp4, (videoStamps.end ?? dur) - 0.05);
  if (freeze.longHits.length) {
    throw new Error(`gel > 0,3 s avant carton: ${JSON.stringify(freeze.longHits)}`);
  }
  const stills: Record<string, string> = {
    bolter: 'bolter.jpg',
    claw: 'claw-hit.jpg',
    fist: 'fist.jpg',
    threat: 'threat.jpg',
    end: 'end-card.jpg',
  };
  for (const [key, file] of Object.entries(stills)) {
    const t = videoStamps[key];
    if (t == null) throw new Error(`stamp manquant ${key}: ${JSON.stringify(videoStamps)}`);
    grabFrame(mp4, key === 'end' ? t + 0.4 : t, join(OUT, file));
  }
  const imgBytes = Object.values(stills).reduce((a, f) => a + readFileSync(join(OUT, f)).length, 0);
  writeFileSync(join(OUT, 'video.json'), JSON.stringify({
    url: `/?autoplay=${VIDEO_AUTO}&seed=${VIDEO_SEED}&cam=shoulder&tex=512&props=0&cap=1`,
    seed: VIDEO_SEED, autoplay: VIDEO_AUTO, fps: FPS, nFrames, stillsFrom: 'ffmpeg-video',
    enc, duration: dur, videoStamps, ticks, loudnorm: ln.measured, af: ln.af,
    ebuFinal, freezeHitsBeforeEnd: freeze.longHits, imgBytes, winner: last?.winner, reason: last?.reason,
    ebuMp4: ebuMp4Raw.slice(-1800),
  }, null, 2));
  rmSync(tmp, { recursive: true, force: true });
  console.log('video', mp4, enc, 'stamps', videoStamps, 'dur', dur, 'ebu', ebuFinal, 'img', imgBytes);
  if (ebuFinal.I == null || ebuFinal.I > -14 || ebuFinal.I < -16) throw new Error(`LUFS ${ebuFinal.I}`);
  if (ebuFinal.TP == null || ebuFinal.TP > -1) throw new Error(`TP ${ebuFinal.TP}`);
  if (imgBytes > 2 * 1024 * 1024) throw new Error(`stills trop lourdes ${imgBytes}`);
  writeFileSync(join(OUT, 'live-video-framing.json'), JSON.stringify(liveVideo, null, 2) + '\n');
}

const MEASURE_SEEDS = [900002, 900004, 900007, 900010, 900017];

async function measureLiveFraming() {
  const perSeed: LiveAcc[] = [];
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    for (const seed of MEASURE_SEEDS) {
      const acc = freshAcc(seed);
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      context.setDefaultTimeout(300000);
      const page = await context.newPage();
      await page.route('**/api/round', async (route) => {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: false, reason: 'capture', summary: 'framing shoulder' }),
        });
      });
      const q = new URLSearchParams({
        autoplay: VIDEO_AUTO, seed: String(seed), cam: 'shoulder', tex: '512', props: '0', cap: '1',
      });
      await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => (window as unknown as { __SCENE_READY?: boolean }).__SCENE_READY === true, { timeout: 180000 });
      let prevPose: StepInfo['pose'] | null = null;
      let holding = false;
      for (let i = 0; i < 1400; i++) {
        const last = await page.evaluate(() => (
          window as unknown as { __capStep?: (n?: number) => StepInfo }
        ).__capStep?.(1));
        if (!last) break;
        const ev = last.events ?? [];
        if (ev.includes('claw') || ev.includes('clawArm') || ev.includes('whiff')) holding = true;
        ingestLive(acc, last, prevPose, holding);
        prevPose = last.pose ?? prevPose;
        if (holding && acc.clawWindowTicks > 8 && !ev.includes('claw') && !ev.includes('clawArm')) holding = false;
        acc.winner = last.winner;
        if (last.done) break;
        if (i % 80 === 0) console.log('framing', seed, last.tick, last.winner);
      }
      perSeed.push(acc);
      await context.close();
    }
    await browser.close();
  });
  const frames = perSeed.reduce((a, s) => a + s.frames, 0);
  const termInFov = perSeed.reduce((a, s) => a + s.termInFov, 0);
  const areaOk = perSeed.reduce((a, s) => a + s.areaOk, 0);
  const headShoulderOk = perSeed.reduce((a, s) => a + s.headShoulderOk, 0);
  const clawHits = perSeed.reduce((a, s) => a + s.clawHits, 0);
  const clawNlClear = perSeed.reduce((a, s) => a + s.clawNlClear, 0);
  const clawSmooth = perSeed.reduce((a, s) => a + s.clawSmooth, 0);
  const clawWindowTicks = perSeed.reduce((a, s) => a + s.clawWindowTicks, 0);
  const clawWindowSmooth = perSeed.reduce((a, s) => a + s.clawWindowSmooth, 0);
  const termShare = frames ? termInFov / frames : 0;
  const areaShare = frames ? areaOk / frames : 0;
  const headShoulderShare = frames ? headShoulderOk / frames : 0;
  const clawClearShare = clawHits ? clawNlClear / clawHits : 0;
  const clawSmoothShare = clawHits ? clawSmooth / clawHits : 0;
  const clawWindowSmoothShare = clawWindowTicks ? clawWindowSmooth / clawWindowTicks : 1;
  const out = {
    autoplay: 'kiter',
    policy: 'policies/current.json',
    seeds: MEASURE_SEEDS,
    pose: 'live-camera-mesh',
    source: 'playwright-webgl',
    frames, termInFov, termShare, termTarget: 0.95,
    areaOk, areaShare, areaTarget: 0.45, termMaxArea: 0.4,
    headShoulderOk, headShoulderShare, headShoulderTarget: 0.90,
    clawHits, clawNlClear, clawClearShare, clawClearTarget: 0.8,
    clawSmooth, clawSmoothShare, clawSmoothTarget: 0.55,
    clawWindowTicks, clawWindowSmooth, clawWindowSmoothShare, clawWindowSmoothTarget: 0.55,
    clawMaxCamStepM: 0.72, clawMaxLookStepM: 1.2, clawMaxOrbitStepRad: 0.55,
    ok: termShare >= 0.95 && clawClearShare >= 0.8 && clawSmoothShare >= 0.55
      && clawWindowSmoothShare >= 0.55
      && areaShare >= 0.45 && headShoulderShare >= 0.9,
    perSeed: perSeed.map((s) => ({
      seed: s.seed, winner: s.winner, tick: s.tick,
      frames: s.frames, termShare: s.frames ? s.termInFov / s.frames : 0,
      areaShare: s.frames ? s.areaOk / s.frames : 0,
      headShoulderShare: s.frames ? s.headShoulderOk / s.frames : 0,
      clawHits: s.clawHits, clawClearShare: s.clawHits ? s.clawNlClear / s.clawHits : 0,
      clawSmoothShare: s.clawHits ? s.clawSmooth / s.clawHits : 0,
      clawWindowSmoothShare: s.clawWindowTicks ? s.clawWindowSmooth / s.clawWindowTicks : 1,
      clawWindowMaxCam: s.clawWindowMaxCam,
    })),
  };
  writeFileSync(join(OUT, 'framing.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('framing live', JSON.stringify({ ok: out.ok, termShare, clawClearShare, clawSmoothShare, frames, clawHits }));
  if (!out.ok) throw new Error(`framing live ko ${JSON.stringify(out)}`);
}

if (process.env.SKIP_VIDEO !== '1') await matchVideo();
if (process.env.SKIP_FRAMING !== '1') await measureLiveFraming();
