// HUD b6p, vidéos combat (manche réelle + carton + son #70), planche, frames.
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/camera-combat');
const FRAMES = join(OUT, 'frames');
const VID = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18197);
const PHASE = process.env.PHASE ?? 'all';
const PLAY = Math.max(1.5, Math.min(2, Number(process.env.PLAY_SPEED ?? 1.75)));
const MATCH_SEED = Number(process.env.MATCH_SEED ?? 900002); // kiter : fist + griffe + kill bolter
const WH_SEED = Number(process.env.WH_SEED ?? 900000);
const VIDEO_PROPS = '0'; // collision props off : même manche lisible (FX/anims/coque restent)

mkdirSync(OUT, { recursive: true });
mkdirSync(FRAMES, { recursive: true });
mkdirSync(VID, { recursive: true });

async function grabPage(page: {
  screenshot: (opts: Record<string, unknown>) => Promise<Buffer | void>;
  evaluate: (fn: () => string) => Promise<string>;
}, path: string) {
  try {
    await page.screenshot({
      path, type: 'jpeg', quality: 80, timeout: 8000, animations: 'disabled', caret: 'hide',
    });
  } catch {
    const dataUrl = await page.evaluate(() => {
      const c = document.getElementById('c') as HTMLCanvasElement | null;
      return c?.toDataURL('image/jpeg', 0.80) ?? '';
    });
    const b64 = dataUrl.split(',')[1];
    if (!b64) throw new Error('grab canvas vide');
    writeFileSync(path, Buffer.from(b64, 'base64'));
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
    await waitListen(server, 'proto sur', 20000);
    return await fn(`http://127.0.0.1:${PORT}`);
  } finally {
    server.kill('SIGTERM');
  }
}

const swiftArgs = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-frame-rate-limit',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];

async function waitTitle(page: { title: () => Promise<string> }, want: string, ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.title() === want) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`title ≠ ${want} (${await page.title()})`);
}

function ff(args: string[]) {
  return spawnSync('ffmpeg', args, { encoding: 'utf8' });
}

function blackEnd(webm: string): { end: number; raw: string } {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-i', webm, '-vf', 'blackdetect=d=0.05:pix_th=0.10', '-an', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const raw = (r.stderr || '') + (r.stdout || '');
  const hits = [...raw.matchAll(/black_start:([0-9.]+)\s+black_end:([0-9.]+)/g)];
  if (!hits.length) return { end: 0, raw };
  const start = Number(hits[0]![1]);
  const end = Number(hits[0]![2]);
  if (start > 0.08) return { end: 0, raw };
  return { end: end + 0.02, raw };
}

function signalstatsAt(src: string, t: string, outFile: string): { yavg: number; raw: string } {
  const r = ff([
    '-hide_banner', '-ss', t, '-i', src, '-vframes', '1',
    '-vf', `signalstats,metadata=print:file=${outFile}`,
    '-f', 'null', '-',
  ]);
  const raw = (existsSync(outFile) ? readFileSync(outFile, 'utf8') : '') + '\n' + (r.stderr || '');
  const m = raw.match(/YAVG=([0-9.]+)/);
  return { yavg: m ? Number(m[1]) : NaN, raw };
}

function durationSec(src: string): number {
  const p = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src,
  ], { encoding: 'utf8' });
  return Number(p.stdout.trim());
}

async function stills() {
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const url = `${base}/?policy=b6p&autoplay=kiter&seed=${MATCH_SEED}&cam=combat&shot=40&tex=512&props=${VIDEO_PROPS}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitTitle(page, 'READY', 60000);
    const hud = await page.evaluate(() => document.getElementById('hud')?.textContent ?? '');
    await grabPage(page, join(OUT, 'policy-b6p-hud.jpg'));
    writeFileSync(join(OUT, 'hud.txt'), hud);
    if (!hud.includes('?policy=b6p') || !/b6@1950|b6p/.test(hud)) throw new Error(`HUD b6p: ${hud}`);
    await browser.close();
  });
}

function dumpAndMix(opp: string, seed: number, wallDuration: number): string {
  const cuesPath = join(VID, `cues-${opp}.json`);
  const dump = spawnSync('bun', ['scripts/dump-match-cues.ts'], {
    cwd: ROOT,
    env: { ...process.env, SEED: String(seed), AUTOPLAY: opp, POLICY: 'b6p', PROPS: VIDEO_PROPS, OUT: cuesPath },
    encoding: 'utf8',
  });
  process.stdout.write(dump.stdout);
  process.stderr.write(dump.stderr);
  if (dump.status !== 0) throw new Error(`dump cues ${opp}`);
  const data = JSON.parse(readFileSync(cuesPath, 'utf8')) as {
    duration: number; cues: { t: number; name: string; gain: number }[];
  };
  for (const c of data.cues) c.t /= PLAY;
  data.duration = Math.max(wallDuration - 2.4, (data.duration || 0) / PLAY);
  const scaled = join(VID, `cues-${opp}-wall.json`);
  writeFileSync(scaled, JSON.stringify(data, null, 2));
  const wav = join(VID, `audio-${opp}.wav`);
  const mix = spawnSync('python3', ['scripts/mix-match-audio.py', scaled, wav], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(mix.stdout);
  process.stderr.write(mix.stderr);
  if (mix.status !== 0) throw new Error(`mix ${opp}`);
  return wav;
}

async function recordMatch(opp: string, outName: string, seed: number) {
  const tmp = join(OUT, `_clip-${opp}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const fpsCap = PLAY / 0.1; // un tick (0,1 s sim) → 1 image, lecture ×PLAY
  let nl: unknown = null;
  let nFrames = 0;
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    context.setDefaultTimeout(240000);
    const page = await context.newPage();
    page.setDefaultTimeout(240000);
    const url = `${base}/?policy=b6p&autoplay=${opp}&seed=${seed}&cam=combat&tex=512&speed=${PLAY}&props=${VIDEO_PROPS}&cap=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => (window as unknown as { __SCENE_READY?: boolean }).__SCENE_READY === true, { timeout: 180000 });
    await page.mouse.click(640, 360);
    const grab = async (path: string) => grabPage(page, path);
    let last: { done?: boolean; tick?: number; winner?: string; reason?: string } | undefined;
    await grab(join(tmp, `${String(nFrames).padStart(4, '0')}.jpg`));
    nFrames++;
    for (let i = 0; i < 1400; i++) {
      last = await page.evaluate(() => (
        window as unknown as { __capStep?: (n?: number) => { done?: boolean; tick?: number; winner?: string; reason?: string } }
      ).__capStep?.(1));
      await grab(join(tmp, `${String(nFrames).padStart(4, '0')}.jpg`));
      nFrames++;
      if (i % 40 === 0) console.log('tick', opp, last?.tick, last?.done, last?.winner);
      if (last?.done) break;
    }
    if (!last?.done) throw new Error(`manche ${opp} non terminée tick=${last?.tick}`);
    const hold = Math.round(2.6 * fpsCap);
    const lastJpg = join(tmp, `${String(nFrames - 1).padStart(4, '0')}.jpg`);
    for (let h = 0; h < hold; h++) {
      const png = join(tmp, `${String(nFrames).padStart(4, '0')}.jpg`);
      spawnSync('cp', [lastJpg, png]);
      nFrames++;
    }
    nl = await page.evaluate(() => (window as unknown as { __NL?: unknown }).__NL);
    await browser.close();
  });
  writeFileSync(join(OUT, `nl-${opp}.json`), JSON.stringify(nl, null, 2));
  const silent = join(tmp, 'cap.mp4');
  const seq = ff([
    '-y', '-hide_banner', '-framerate', String(fpsCap),
    '-i', join(tmp, '%04d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '28', '-preset', 'veryfast',
    silent,
  ]);
  if (seq.status !== 0 || !existsSync(silent)) throw new Error(`seq ${opp}: ${seq.stderr}`);
  const bd = blackEnd(silent);
  writeFileSync(join(OUT, `blackdetect-${opp}.txt`), bd.raw);
  const ss = bd.end;
  const trimmed = Math.max(1, durationSec(silent) - ss);
  const wav = dumpAndMix(opp, seed, trimmed);
  const out = join(VID, outName);
  const enc = ff([
    '-y', '-hide_banner', '-ss', String(ss), '-i', silent, '-i', wav,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
    '-crf', '28', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    out,
  ]);
  if (enc.status !== 0 || !existsSync(out)) throw new Error(`enc ${opp}: ${enc.stderr}`);
  const bytes = Number(spawnSync('stat', ['-c', '%s', out], { encoding: 'utf8' }).stdout.trim());
  if (bytes > 15 * 1024 * 1024) throw new Error(`video trop lourde ${bytes}`);
  if (bytes < 50_000) throw new Error(`video trop courte ${bytes}`);
  const dur = durationSec(out);
  const stats: string[] = [`# signalstats ${outName} trim_ss=${ss} duration=${dur} bytes=${bytes} play=×${PLAY}\n`];
  const samples = ['0', '0.5', '1'];
  const yavgs: { t: string; yavg: number }[] = [];
  for (const t of samples) {
    const f = join(OUT, `signalstats-${opp}-t${t}.txt`);
    const s = signalstatsAt(out, t, f);
    yavgs.push({ t, yavg: s.yavg });
    stats.push(`--- t=${t} ---\n${s.raw}\n`);
  }
  const rest: number[] = [];
  for (let t = 2; t < dur - 0.2; t += 2) {
    const f = join('/tmp', `nl-signalstats-rest-${t}.txt`);
    const s = signalstatsAt(out, String(t), f);
    if (Number.isFinite(s.yavg)) rest.push(s.yavg);
  }
  const meanRest = rest.length ? rest.reduce((a, b) => a + b, 0) / rest.length : NaN;
  const ebu = spawnSync('ffmpeg', ['-hide_banner', '-i', out, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const ebuRaw = `${ebu.stderr ?? ''}\n${ebu.stdout ?? ''}`;
  const lufsHits = [...ebuRaw.matchAll(/I:\s+([-\d.]+)\s+LUFS/g)];
  const lufs = lufsHits.at(-1);
  writeFileSync(join(OUT, `ebur128-${opp}.txt`), ebuRaw.slice(-2500));
  stats.push(`YAVG t=0,0.5,1: ${yavgs.map((x) => x.yavg).join(', ')}\nmean rest (2s..): ${meanRest}\nLUFS I=${lufs?.[1] ?? '?'}\n`);
  writeFileSync(join(OUT, `signalstats-${opp}.txt`), stats.join('\n'));
  console.log('video', out, 'bytes', bytes, 'dur', dur, 'nl', JSON.stringify(nl), 'yavg', yavgs, 'rest', meanRest, 'lufs', lufs?.[1]);
}

async function grabEndCard(opp: string, seed: number): Promise<string> {
  const png = join(OUT, `end-card-${opp}.png`);
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const url = `${base}/?policy=b6p&autoplay=${opp}&seed=${seed}&cam=combat&tex=512&until=end&props=${VIDEO_PROPS}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitTitle(page, 'READY', 180000);
    await page.waitForTimeout(400);
    await page.screenshot({ path: png, type: 'png' });
    await browser.close();
  });
  return png;
}

function appendEndCard(src: string, still: string, seconds: number): void {
  const tmp = src.replace(/\.mp4$/, '-with-card.mp4');
  const recode = ff([
    '-y', '-i', src, '-loop', '1', '-t', String(seconds), '-i', still,
    '-filter_complex',
    '[1:v]scale=1280:720,fps=30,setsar=1,format=yuv420p[card];[0:v][card]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '30', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', tmp,
  ]);
  if (recode.status !== 0) throw new Error(recode.stderr);
  spawnSync('mv', ['-f', tmp, src]);
  const bytes = Number(spawnSync('stat', ['-c', '%s', src], { encoding: 'utf8' }).stdout.trim());
  if (bytes > 15 * 1024 * 1024) throw new Error(`video trop lourde après carton ${bytes}`);
}

function slimRepoImages() {
  const keepOut = new Set([
    'planche-6.jpg',
    'policy-b6p-hud.jpg',
    'hud.txt',
  ]);
  const keepFrames = new Set([
    'b6p-match-fist.jpg',
    'b6p-match-bolter-kill.jpg',
    'b6p-match-claw.jpg',
    'b6p-match-end.jpg',
    'b6p-wallhugger-end.jpg',
  ]);
  for (const name of readdirSync(OUT)) {
    if (name.startsWith('_clip-') || name === 'planche' || name === 'frames') {
      if (name !== 'frames') rmSync(join(OUT, name), { recursive: true, force: true });
      continue;
    }
    if (/\.(png|jpg|jpeg|webp)$/i.test(name) && !keepOut.has(name)) rmSync(join(OUT, name), { force: true });
    if (/^signalstats-.*-rest/.test(name) || /^luma-/.test(name) || /^lab-/.test(name) || /^row-/.test(name)) {
      rmSync(join(OUT, name), { force: true });
    }
  }
  if (existsSync(FRAMES)) {
    for (const name of readdirSync(FRAMES)) {
      if (!keepFrames.has(name)) rmSync(join(FRAMES, name), { force: true });
    }
  }
}

function extractHits(src: string, prefix: string, hits: { label: string; t: number }[]) {
  for (const h of hits) {
    if (!Number.isFinite(h.t) || h.t < 0) continue;
    const jpg = join(FRAMES, `${prefix}-${h.label}.jpg`);
    const r = ff(['-y', '-ss', Math.max(0, h.t).toFixed(3), '-i', src, '-frames:v', '1', '-q:v', '3', jpg]);
    if (r.status !== 0) throw new Error(r.stderr);
    console.log('hit-frame', jpg, 't', h.t.toFixed(2));
  }
}

function extractEight(src: string, prefix: string) {
  const dur = durationSec(src);
  const fracs = [0.04, 0.16, 0.30, 0.45, 0.60, 0.75, 0.90, 0.97];
  for (let i = 0; i < fracs.length; i++) {
    const t = Math.max(0, Math.min(dur - 0.05, dur * fracs[i]!));
    const png = join(FRAMES, `${prefix}-${String(i + 1).padStart(2, '0')}.png`);
    const r = ff(['-y', '-ss', t.toFixed(3), '-i', src, '-vframes', '1', png]);
    if (r.status !== 0) throw new Error(r.stderr);
    console.log('frame', png, 't', t.toFixed(2));
  }
}

const PLANCHE_TICKS = [50, 160, 300];

async function planche() {
  const dir = join(OUT, 'planche');
  mkdirSync(dir, { recursive: true });
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await context.newPage();
    const labeled: string[] = [];
    for (const cam of ['couloir', 'combat'] as const) {
      for (const tick of PLANCHE_TICKS) {
        const url = `${base}/?policy=b6p&autoplay=kiter&seed=${MATCH_SEED}&cam=${cam}&shot=${tick}&tex=512&props=${VIDEO_PROPS}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await waitTitle(page, 'READY', 60000);
        const png = join(dir, `${cam}-t${tick}.jpg`);
        await grabPage(page, png);
        const lab = join(dir, `lab-${cam}-t${tick}.jpg`);
        const r = ff([
          '-y', '-i', png, '-vf',
          `scale=640:360,drawtext=text='${cam} t${tick}':x=12:y=12:fontsize=22:fontcolor=white:borderw=2`,
          lab,
        ]);
        if (r.status !== 0) throw new Error(r.stderr);
        labeled.push(lab);
        console.log('planche', cam, tick);
      }
    }
    await browser.close();
    const row1 = join(dir, 'row-couloir.png');
    const row2 = join(dir, 'row-combat.png');
    const board = join(OUT, 'planche-6.jpg');
    const h1 = ff(['-y', '-i', labeled[0]!, '-i', labeled[1]!, '-i', labeled[2]!, '-filter_complex', 'hstack=inputs=3', row1]);
    if (h1.status !== 0) throw new Error(h1.stderr);
    const h2 = ff(['-y', '-i', labeled[3]!, '-i', labeled[4]!, '-i', labeled[5]!, '-filter_complex', 'hstack=inputs=3', row2]);
    if (h2.status !== 0) throw new Error(h2.stderr);
    const v = ff(['-y', '-i', row1, '-i', row2, '-filter_complex', 'vstack=inputs=2', '-q:v', '3', board]);
    if (v.status !== 0) throw new Error(v.stderr);
    for (const p of [...labeled, row1, row2]) rmSync(p, { force: true });
    rmSync(dir, { recursive: true, force: true });
    console.log('planche', board);
  });
}

if (PHASE === 'hits') {
  const ticks = [154, 359, 395];
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const capUrl = `${base}/?policy=b6p&autoplay=kiter&seed=${MATCH_SEED}&cam=combat&tex=512&speed=${PLAY}&props=${VIDEO_PROPS}&cap=1`;
    await page.goto(capUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => (window as unknown as { __SCENE_READY?: boolean }).__SCENE_READY === true, { timeout: 180000 });
    let t = 0;
    for (const want of ticks) {
      let st: Record<string, unknown> | undefined;
      while (t < want) {
        st = await page.evaluate(() => (
          window as unknown as { __capStep?: (n?: number) => { tick?: number } }
        ).__capStep?.(1)) as Record<string, unknown> | undefined;
        t = Number(st?.tick ?? t + 1);
      }
      const jpg = join(FRAMES, `cmp-cap-t${want}.jpg`);
      await grabPage(page, jpg);
      console.log('cap', want, jpg, JSON.stringify(st));
    }
    for (const want of ticks) {
      const url = `${base}/?policy=b6p&autoplay=kiter&seed=${MATCH_SEED}&cam=combat&tex=512&props=${VIDEO_PROPS}&shot=${want}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitTitle(page, 'READY', 90000);
      const jpg = join(FRAMES, `cmp-shot-t${want}.jpg`);
      await grabPage(page, jpg);
      console.log('shot', want, jpg);
    }
    await browser.close();
  });
}
if (PHASE === 'stills' || PHASE === 'all') await stills();
if (PHASE === 'video' || PHASE === 'all') {
  const only = process.env.OPP;
  for (const [opp, name, seed] of [['kiter', 'b6p-match.mp4', MATCH_SEED], ['wallHugger', 'b6p-wallhugger.mp4', WH_SEED]] as const) {
    if (only && only !== opp) continue;
    const evPath = join(OUT, `events-${opp}.json`);
    const dump = spawnSync('bun', ['scripts/dump-match-events.ts'], {
      cwd: ROOT,
      env: {
        ...process.env, SEED: String(seed), AUTOPLAY: opp, POLICY: 'b6p', PROPS: VIDEO_PROPS,
        PLAY_SPEED: String(PLAY), OUT: evPath,
      },
      encoding: 'utf8',
    });
    process.stdout.write(dump.stdout);
    process.stderr.write(dump.stderr);
    await recordMatch(opp, name, seed);
    const ev = JSON.parse(readFileSync(evPath, 'utf8')) as {
      fistHit?: { videoT: number }; clawHit?: { videoT: number }; boltKill?: { videoT: number };
    };
    const hits = name === 'b6p-match.mp4'
      ? [
        { label: 'fist', t: (ev.fistHit?.videoT ?? -1) },
        { label: 'bolter-kill', t: (ev.boltKill?.videoT ?? -1) },
        { label: 'claw', t: (ev.clawHit?.videoT ?? -1) },
        { label: 'end', t: Math.max(0, durationSec(join(VID, name)) - 0.12) },
      ]
      : [
        { label: 'end', t: Math.max(0, durationSec(join(VID, name)) - 0.12) },
      ];
    extractHits(join(VID, name), name.replace('.mp4', ''), hits);
  }
}
if (PHASE === 'planche' || PHASE === 'all') await planche();
if (PHASE === 'frames') {
  extractEight(join(VID, 'b6p-match.mp4'), 'b6p-match');
  extractEight(join(VID, 'b6p-wallhugger.mp4'), 'b6p-wallhugger');
}
if (PHASE === 'all' || PHASE === 'slim') slimRepoImages();
console.log('capture-b6p ok', PHASE);
process.exit(0);
