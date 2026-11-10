// Captures SwiftShader avant (?proc=legacy) / après + vidéo < 15 Mo.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { decodePngRgba } from '../web/png-rgba.ts';
import { meanLuma } from '../web/banding.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/anim-impact');
const VID = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18194);
const BASE = `http://127.0.0.1:${PORT}`;
const PHASE = process.env.PHASE ?? 'all';
const VIDEO_SEED = process.env.VIDEO_SEED ?? '900002';
const VIDEO_AUTO = process.env.VIDEO_AUTO ?? 'kiter';
const COMBAT_EVENTS = ['bolt', 'fist', 'claw', 'hit', 'clawArm', 'fistCharge'];

mkdirSync(OUT, { recursive: true });
mkdirSync(VID, { recursive: true });

const ACTIONS: {
  id: string; demo: string; focus: string; shots: [number, number, number]; labels: [string, string, string];
}[] = [
  { id: 'nl-combo', demo: 'impact-combo', focus: '1', shots: [4, 7, 12], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-leap', demo: 'impact-leap', focus: '1', shots: [5, 8, 11], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-dodge-l', demo: 'impact-dodge-l', focus: '1', shots: [3, 4, 6], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-dodge-r', demo: 'impact-dodge-r', focus: '1', shots: [3, 4, 6], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-hit-front', demo: 'impact-hit-front', focus: '1', shots: [12, 13, 15], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-hit-back', demo: 'impact-hit-back', focus: '1', shots: [12, 13, 15], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-hit-left', demo: 'impact-hit-left', focus: '1', shots: [12, 13, 15], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-hit-right', demo: 'impact-hit-right', focus: '1', shots: [12, 13, 15], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-stagger', demo: 'impact-stagger', focus: '0', shots: [5, 6, 8], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-death-throw', demo: 'impact-death-throw', focus: '0', shots: [5, 8, 13], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-death-collapse', demo: 'impact-death-collapse', focus: '0', shots: [12, 14, 16], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'nl-death-dismember', demo: 'impact-death-dismember', focus: '1', shots: [12, 14, 16], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'term-recoil', demo: 'impact-term-recoil', focus: '', shots: [4, 5, 6], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'term-fist', demo: 'impact-term-fist', focus: '', shots: [5, 11, 12], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'term-hit', demo: 'impact-term-hit', focus: '', shots: [5, 6, 7], labels: ['anticipation', 'impact', 'recovery'] },
  { id: 'term-walk', demo: 'impact-term-walk', focus: '', shots: [6, 10, 14], labels: ['anticipation', 'impact', 'recovery'] },
];

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

function query(demo: string, shot: number, focus: string, legacy: boolean): string {
  const p = new URLSearchParams({
    demo, cam: 'troisquarts', shot: String(shot), impact: '0', tex: '512', seed: '1',
  });
  if (focus) p.set('focus', focus);
  if (legacy) p.set('proc', 'legacy');
  return p.toString();
}

async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const server = spawn('bun', ['dist/server.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitListen(server, 'proto sur', 20000);
    return await fn(BASE);
  } finally {
    server.kill('SIGTERM');
  }
}

async function captureStills(legacy: boolean) {
  const tag = legacy ? 'avant' : 'apres';
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const net: { status: number; url: string }[] = [];
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    context.setDefaultTimeout(180000);
    const urls: Record<string, string> = {};
    const poses: Record<string, unknown> = {};
    for (const a of ACTIONS) {
      for (let i = 0; i < 3; i++) {
        const shot = a.shots[i]!;
        const name = `${tag}-${a.id}-${a.labels[i]}-t${shot}`;
        const url = `${base}/?${query(a.demo, shot, a.focus, legacy)}`;
        const page = await context.newPage();
        page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
        page.on('pageerror', (e) => pageErrors.push(String(e)));
        page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
        poses[name] = await page.evaluate(() => (window as unknown as { __termPose?: unknown }).__termPose ?? null);
        await page.screenshot({ path: join(OUT, `${name}.png`), type: 'png' });
        await page.close();
        urls[name] = url;
        console.log('shot', name);
      }
    }
    const consoleErrors = consoleLines.filter((l) => l.startsWith('error:') && !l.includes("Couldn't load texture"));
    const report = {
      urls, poses, console: consoleLines, consoleErrors, pageErrors,
      networkFailed: net.filter((r) => r.status >= 400),
    };
    writeFileSync(join(OUT, `playwright-${tag}.json`), JSON.stringify(report, null, 2));
    if (pageErrors.length || consoleErrors.length || report.networkFailed.length) {
      throw new Error(`erreurs ${tag}: ${[...pageErrors, ...consoleErrors, ...report.networkFailed.map((n) => `${n.status} ${n.url}`)].join('\n')}`);
    }
    const manifestOk = net.some((r) => r.url.includes('/web/sfx/nightlords/manifest.json') && r.status === 200);
    if (!manifestOk) throw new Error(`manifeste sfx absent ou pas 200 (${tag})`);
    for (const [k, p] of Object.entries(poses)) {
      const pose = p as { tpose?: boolean } | null;
      if (pose?.tpose) throw new Error(`T-pose ${k}`);
    }
    await browser.close();
  });
}

function combo() {
  for (const a of ACTIONS) {
    for (let i = 0; i < 3; i++) {
      const shot = a.shots[i]!;
      const label = a.labels[i]!;
      const avant = join(OUT, `avant-${a.id}-${label}-t${shot}.png`);
      const apres = join(OUT, `apres-${a.id}-${label}-t${shot}.png`);
      const out = join(OUT, `combo-${a.id}-${label}-t${shot}.png`);
      if (!existsSync(avant) || !existsSync(apres)) throw new Error(`manque ${avant} ou ${apres}`);
      const r = spawnSync('ffmpeg', [
        '-y', '-i', avant, '-i', apres,
        '-filter_complex',
        "[0:v]drawtext=text='AVANT':x=16:y=16:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.55[l];"
        + "[1:v]drawtext=text='APRES whoa':x=16:y=16:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.55[r];"
        + '[l][r]hstack=inputs=2',
        out,
      ], { encoding: 'utf8' });
      if (r.status !== 0) {
        const plain = spawnSync('ffmpeg', ['-y', '-i', avant, '-i', apres, '-filter_complex', 'hstack=inputs=2', out], { encoding: 'utf8' });
        if (plain.status !== 0) throw new Error(plain.stderr || r.stderr);
      }
      console.log('combo', out);
    }
  }
}

function encodeH264(webm: string, mp4: string, ss: number, maxT?: number): number {
  const webmDur = ffprobeDur(webm);
  let start = Math.max(0, ss);
  if (!Number.isFinite(start) || start >= webmDur - 0.2) {
    start = maxT !== undefined ? Math.max(0, webmDur - maxT) : 0;
  }
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(start), '-i', webm,
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-s', '1280x720', '-r', '30', '-crf', '26',
  ];
  if (maxT !== undefined) args.push('-t', String(maxT));
  args.push(mp4);
  const enc = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(enc.stderr || `ffmpeg ${mp4}`);
  const d = ffprobeDur(mp4);
  if (!Number.isFinite(d) || d < 0.3) throw new Error(`clip vide ${mp4} dur=${d} webm=${webmDur} ss=${start}`);
  return d;
}

function ffprobeDur(path: string): number {
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path,
  ], { encoding: 'utf8' });
  return Number(probe.stdout.trim());
}

function ffprobeJson(path: string): unknown {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,sample_rate,channels', '-of', 'json', path], { encoding: 'utf8' });
  return JSON.parse(probe.stdout || '{}');
}

function ebur128(path: string): { integrated?: string; raw: string } {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', path, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const raw = `${r.stderr ?? ''}\n${r.stdout ?? ''}`;
  const m = raw.match(/I:\s+([-\d.]+)\s+LUFS/);
  return { integrated: m?.[1], raw: raw.slice(-2000) };
}

function headStats(path: string, t: number) {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-ss', String(t), '-t', '0.12', '-i', path,
    '-vf', 'blackdetect=d=0.04:pix_th=0.10,signalstats,metadata=print:file=-',
    '-an', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const text = `${r.stderr ?? ''}\n${r.stdout ?? ''}`;
  const yavg = [...text.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((x) => Number(x[1]));
  const black = [...text.matchAll(/black_start:([\d.]+)/g)].map((x) => Number(x[1]));
  return { t, yavg: yavg[0] ?? null, blackStarts: black, snippet: text.slice(-800) };
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

function mixAac(cuesJson: string, wav: string, aac: string) {
  const mix = spawnSync('python3', [join(ROOT, 'scripts/mix-match-audio.py'), cuesJson, wav], { cwd: ROOT, encoding: 'utf8' });
  if (mix.status !== 0) throw new Error(mix.stderr || mix.stdout);
  const aacEnc = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '96k', aac,
  ], { encoding: 'utf8' });
  if (aacEnc.status !== 0) throw new Error(aacEnc.stderr);
  return mix.stdout.trim();
}

function muxUnder15(silent: string, aac: string | null, delay: number, out: string) {
  let crf = 28;
  const tmp = join(OUT, '_vid', 'scaled.mp4');
  mkdirSync(join(OUT, '_vid'), { recursive: true });
  while (crf <= 36) {
    const scale = spawnSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', silent,
      '-vf', 'scale=1280:720,fps=24,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), tmp,
    ], { encoding: 'utf8' });
    if (scale.status !== 0) throw new Error(scale.stderr);
    const vdur = ffprobeDur(tmp);
    const args = aac
      ? ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-itsoffset', String(delay), '-i', aac,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-t', String(vdur),
        '-map', '0:v:0', '-map', '1:a:0', '-movflags', '+faststart', out]
      : ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-c:v', 'copy', '-an', '-t', String(vdur),
        '-movflags', '+faststart', out];
    const mux = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    if (mux.status !== 0) throw new Error(mux.stderr);
    const bytes = Number(spawnSync('stat', ['-c', '%s', out], { encoding: 'utf8' }).stdout.trim());
    if (bytes <= 15 * 1024 * 1024) return { crf, bytes };
    crf += 2;
  }
  throw new Error(`video trop lourde ${out}`);
}

async function liveConsole(base: string) {
  const browser = await chromium.launch({ headless: true, args: SW });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const net: { status: number; url: string }[] = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
  const url = `${base}/?autoplay=${VIDEO_AUTO}&cam=epaule&seed=${VIDEO_SEED}&tex=512&props=0`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#hud', { timeout: 180000 });
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => {
    const n = (window as unknown as { __NL?: { tick?: number; done?: boolean } }).__NL;
    return (n?.tick ?? 0) > 20;
  }, undefined, { timeout: 60000 });
  const tposeHits: number[] = [];
  await page.waitForFunction(() => {
    const n = (window as unknown as { __NL?: { done?: boolean; tick?: number; nlsAlive?: number } }).__NL;
    const pose = (window as unknown as { __termPose?: { tpose?: boolean } }).__termPose;
    if (pose?.tpose) (window as unknown as { __tposeHit?: boolean }).__tposeHit = true;
    const dead = (n?.nlsAlive ?? 4) < 4;
    return Boolean(n?.done) || dead || (n?.tick ?? 0) >= 220;
  }, undefined, { timeout: 120000 });
  await page.waitForTimeout(800);
  const pose = await page.evaluate(() => {
    return (window as unknown as { __termPose?: { tpose?: boolean } }).__termPose ?? null;
  });
  const tposeDuring = await page.evaluate(() => Boolean((window as unknown as { __tposeHit?: boolean }).__tposeHit));
  if (tposeDuring || pose?.tpose) tposeHits.push(1);
  const nl = await page.evaluate(() => (window as unknown as { __NL?: unknown }).__NL ?? null);
  await browser.close();
  const manifest = net.filter((r) => r.url.includes('/web/sfx/nightlords/manifest.json'));
  const consoleErrors = consoleLines.filter((l) => l.startsWith('error:'));
  const failed = net.filter((r) => r.status >= 400);
  const report = {
    mode: 'live-match-fx',
    url, nl, pose, console: consoleLines, consoleErrors, pageErrors,
    networkFailed: failed, manifest,
  };
  writeFileSync(join(OUT, 'playwright-live.json'), JSON.stringify(report, null, 2));
  if (pageErrors.length) throw new Error(`pageerror live: ${pageErrors.join('\n')}`);
  if (consoleErrors.length) throw new Error(`console live: ${consoleErrors.join('\n')}`);
  if (failed.length) throw new Error(`net live: ${failed.map((n) => `${n.status} ${n.url}`).join('\n')}`);
  if (!manifest.some((m) => m.status === 200)) throw new Error('manifeste sfx pas en 200');
  if (tposeHits.length) throw new Error('T-pose détectée en match live');
  const bodies = (nl as { bodies?: { alive: boolean; loco: boolean; kind: string | null; clip: string | null; visibleSkinned?: number }[] } | null)?.bodies ?? [];
  const ghost = bodies.filter((b) => !b.alive && (b.loco || (b.visibleSkinned ?? 0) > 0));
  if (ghost.length) throw new Error(`NL mort encore visible/loco: ${JSON.stringify(ghost)}`);
  console.log('live-console ok', JSON.stringify({
    tick: (nl as { tick?: number } | null)?.tick,
    done: (nl as { done?: boolean } | null)?.done,
    tpose: pose?.tpose ?? false,
    bodies,
    manifest: manifest.map((m) => m.status),
  }));
}

async function matchVideo() {
  const tmp = join(OUT, '_vid');
  mkdirSync(tmp, { recursive: true });
  const got: Record<string, boolean> = {};
  await withServer(async (base) => {
    await liveConsole(base);
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
        body: JSON.stringify({ ok: false, reason: 'capture', summary: 'capture anim+fx' }),
      });
    });
    const q = new URLSearchParams({
      autoplay: VIDEO_AUTO, seed: VIDEO_SEED, cam: 'epaule', tex: '512', props: '0',
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
    }, COMBAT_EVENTS, { timeout: 180000 });
    const contactAt = (Date.now() - tNav) / 1000;

    const grab = async (key: string, path: string) => {
      if (got[key]) return;
      got[key] = true;
      await page.screenshot({ path, type: 'png' });
      console.log('still', key);
    };

    const deadline = Date.now() + 240000;
    let prevFistCharge = 0;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => {
        const nl = (window as unknown as { __NL?: { tick?: number; done?: boolean; events?: string[]; winner?: string; fistCharge?: number } }).__NL;
        const msg = document.getElementById('msg');
        return {
          tick: nl?.tick ?? 0,
          done: !!nl?.done,
          events: nl?.events ?? [],
          winner: nl?.winner,
          fistCharge: nl?.fistCharge ?? 0,
          msg: msg ? getComputedStyle(msg).display : 'missing',
          text: msg?.textContent ?? '',
        };
      });
      if (st.events.includes('clawArm')) await grab('windup', join(OUT, 'match-windup.png'));
      if (st.events.includes('claw') || st.events.includes('clawArmor')) await grab('claw', join(OUT, 'match-claw-impact.png'));
      if ((st.events.includes('fist') || (prevFistCharge > 0 && st.fistCharge === 0)) && !got.fist) {
        await page.waitForTimeout(50);
        await grab('fist', join(OUT, 'match-fist.png'));
      }
      prevFistCharge = st.fistCharge;
      if (st.events.includes('bolt')) await grab('bolter', join(OUT, 'match-bolter.png'));
      const bodies = await page.evaluate(() => (
        window as unknown as { __NL?: { nlsAlive?: number; bodies?: { alive: boolean; loco: boolean; kind: string | null; visibleSkinned?: number }[] } }
      ).__NL);
      if (bodies?.bodies) {
        const ghost = bodies.bodies.filter((b) => !b.alive && (b.loco || (b.visibleSkinned ?? 0) > 0));
        if (ghost.length) throw new Error(`fantôme locomotion ${JSON.stringify(ghost)} tick=${st.tick}`);
        const corpse = bodies.bodies.find((b) => !b.alive && b.kind === 'death');
        if (corpse && !got.death) {
          await page.waitForTimeout(180);
          await grab('death', join(OUT, 'match-nl-death.png'));
        }
      }
      if (st.done && st.msg === 'block' && /gagne|abattu|tenu/i.test(st.text)) {
        await page.waitForTimeout(2200);
        await grab('end', join(OUT, 'match-end-card.png'));
        break;
      }
      await page.waitForTimeout(50);
    }
    if (!got.end) {
      await page.waitForTimeout(2200);
      await grab('end', join(OUT, 'match-end-card.png'));
    }
    await context.close();
    await browser.close();

    const webm = spawnSync('bash', ['-lc', `ls -1t "${tmp}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
    if (!webm) throw new Error('pas de webm match');
    const detect = spawnSync('ffmpeg', [
      '-i', webm, '-vf', 'blackdetect=d=0.08:pix_th=0.10', '-an', '-f', 'null', '-',
    ], { encoding: 'utf8' });
    const blackLog = `${detect.stderr}\n${detect.stdout}`;
    let ss = Math.max(0, contactAt - 0.4);
    const blackEnd = [...blackLog.matchAll(/black_end:([\d.]+)/g)].map((m) => Number(m[1]!));
    if (blackEnd.length && blackEnd[0]! > 0) ss = Math.max(ss, blackEnd[0]! + 0.04);
    ss = Math.max(ss, litAt - 0.1, 0);
    const body = join(tmp, 'match-body.mp4');
    encodeH264(webm, body, ss);

    const cuesJson = join(tmp, 'match-cues.json');
    const dump = spawnSync('bun', [join(ROOT, 'scripts/dump-match-cues.ts')], {
      cwd: ROOT,
      env: { ...process.env, SEED: VIDEO_SEED, AUTOPLAY: VIDEO_AUTO, PROPS: '0', OUT: cuesJson },
      encoding: 'utf8',
    });
    if (dump.status !== 0) throw new Error(dump.stderr || dump.stdout);
    const dumpData = JSON.parse(readFileSync(cuesJson, 'utf8')) as { duration?: number; cues: { t: number; name: string; gain: number }[] };
    const bodyDur = ffprobeDur(body);
    const simDur = Number(dumpData.duration) || bodyDur;
    const scale = bodyDur / Math.max(0.5, simDur);
    for (const c of dumpData.cues) c.t *= scale;
    dumpData.duration = bodyDur;
    writeFileSync(cuesJson, JSON.stringify(dumpData));
    const wav = join(tmp, 'match.wav');
    const aac = join(tmp, 'match.m4a');
    mixAac(cuesJson, wav, aac);
    const out = join(VID, 'anim-impact.mp4');
    const enc = muxUnder15(body, aac, 0, out);
    const probe = ffprobeJson(out);
    const lufs = ebur128(out);
    const heads = [0, 0.5, 1].map((t) => headStats(out, t));
    writeFileSync(join(OUT, 'video-probe.json'), JSON.stringify({
      out, enc, probe, lufs: lufs.integrated, lufsRaw: lufs.raw, heads, ss, litAt, contactAt, dump: dump.stdout.trim(), got,
    }, null, 2));
    console.log('match-video', out, enc, 'lufs', lufs.integrated);
  });
}

async function demosVideo() {
  const tmp = join(OUT, '_clips');
  mkdirSync(tmp, { recursive: true });
  const clips: string[] = [];
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: SW });
    for (const a of ACTIONS) {
      const dir = join(tmp, a.id);
      mkdirSync(dir, { recursive: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir, size: { width: 1280, height: 720 } },
      });
      context.setDefaultTimeout(180000);
      const page = await context.newPage();
      const p = new URLSearchParams({ demo: a.demo, cam: 'troisquarts', tex: '512', seed: '1' });
      if (a.focus) p.set('focus', a.focus);
      await page.goto(`${base}/?${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => {
        const n = (window as unknown as { __NL?: { tick?: number } }).__NL;
        const h = document.getElementById('hud');
        return (n?.tick ?? 0) >= 1 && !!h && (h.textContent?.length ?? 0) > 40;
      }, undefined, { timeout: 180000 });
      await page.mouse.click(640, 360);
      await waitLit(page).catch(() => undefined);
      await page.waitForTimeout(2800);
      await context.close();
      const webm = spawnSync('bash', ['-lc', `ls -1 "${dir}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
      if (!webm) throw new Error(`pas de webm ${a.id}`);
      const mp4 = join(tmp, `${a.id}.mp4`);
      const d = encodeH264(webm, mp4, Math.max(0, ffprobeDur(webm) - 2.25), 2.2);
      clips.push(mp4);
      console.log('demo', a.id, d);
    }
    await browser.close();
  });
  const list = join(tmp, 'demos.txt');
  writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
  const silent = join(tmp, 'demos-silent.mp4');
  const cat = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-s', '1280x720', '-r', '30', '-crf', '28', silent,
  ], { encoding: 'utf8' });
  if (cat.status !== 0) throw new Error(cat.stderr);
  const demoDur = ffprobeDur(silent);
  const cuesJson = join(tmp, 'demos-cues.json');
  writeFileSync(cuesJson, JSON.stringify({ duration: demoDur, cues: [] }));
  const wav = join(tmp, 'demos.wav');
  const aac = join(tmp, 'demos.m4a');
  mixAac(cuesJson, wav, aac);
  const out = join(VID, 'anim-demos.mp4');
  const enc = muxUnder15(silent, aac, 0, out);
  const probe = ffprobeJson(out);
  const lufs = ebur128(out);
  const heads = [0, 0.5, 1].map((t) => headStats(out, t));
  writeFileSync(join(OUT, 'demos-probe.json'), JSON.stringify({ out, enc, probe, lufs: lufs.integrated, heads }, null, 2));
  console.log('demos-video', out, enc);
}

if (PHASE === 'avant') await captureStills(true);
if (PHASE === 'apres') await captureStills(false);
if (PHASE === 'combo') combo();
if (PHASE === 'live') await withServer((base) => liveConsole(base));
if (PHASE === 'match' || PHASE === 'video' || PHASE === 'all') await matchVideo();
if (PHASE === 'demos') await demosVideo();
console.log('capture-anim-impact ok', PHASE);
process.exit(0);
