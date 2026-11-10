// Captures SwiftShader avant (?proc=legacy) / après + vidéo < 15 Mo.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/anim-impact');
const VID = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18194);
const BASE = `http://127.0.0.1:${PORT}`;
const PHASE = process.env.PHASE ?? 'all';

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
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '26',
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

async function liveConsole(base: string) {
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
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const net: { status: number; url: string }[] = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
  await page.goto(`${base}/?autoplay=kiter&cam=troisquarts&seed=900000&tex=512`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.waitForSelector('#hud', { timeout: 180000 });
  await page.mouse.click(480, 270);
  await page.waitForFunction(() => {
    const n = (window as unknown as { __NL?: { tick?: number } }).__NL;
    return (n?.tick ?? 0) > 20;
  }, undefined, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const nl = await page.evaluate(() => (window as unknown as { __NL?: unknown }).__NL ?? null);
  await browser.close();
  const manifest = net.filter((r) => r.url.includes('/web/sfx/nightlords/manifest.json'));
  const consoleErrors = consoleLines.filter((l) => l.startsWith('error:'));
  const failed = net.filter((r) => r.status >= 400);
  const report = {
    mode: 'live-match',
    url: `${base}/?autoplay=kiter&cam=troisquarts&seed=900000&tex=512`,
    nl, console: consoleLines, consoleErrors, pageErrors,
    networkFailed: failed,
    manifest,
  };
  writeFileSync(join(OUT, 'playwright-live.json'), JSON.stringify(report, null, 2));
  if (pageErrors.length) throw new Error(`pageerror live: ${pageErrors.join('\n')}`);
  if (consoleErrors.length) throw new Error(`console live: ${consoleErrors.join('\n')}`);
  if (failed.length) throw new Error(`net live: ${failed.map((n) => `${n.status} ${n.url}`).join('\n')}`);
  if (!manifest.some((m) => m.status === 200)) throw new Error('manifeste sfx pas en 200');
  console.log('live-console ok', JSON.stringify({ tick: (nl as { tick?: number } | null)?.tick, manifest: manifest.map((m) => m.status) }));
}

async function video() {
  const tmp = join(OUT, '_clips');
  mkdirSync(tmp, { recursive: true });
  const clips: string[] = [];
  let demoDur = 0;
  let matchDur = 0;
  const swift = [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
  ];
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swift });
    for (const a of ACTIONS) {
      const mp4 = join(tmp, `${a.id}.mp4`);
      if (existsSync(mp4) && ffprobeDur(mp4) >= 2) {
        const d = ffprobeDur(mp4);
        demoDur += d;
        clips.push(mp4);
        console.log('clip reuse', a.id, d);
        continue;
      }
      const dir = join(tmp, a.id);
      mkdirSync(dir, { recursive: true });
      const context = await browser.newContext({
        viewport: { width: 960, height: 540 },
        recordVideo: { dir, size: { width: 960, height: 540 } },
      });
      context.setDefaultTimeout(180000);
      const page = await context.newPage();
      const p = new URLSearchParams({ demo: a.demo, cam: 'troisquarts', impact: '0', tex: '512', seed: '1' });
      if (a.focus) p.set('focus', a.focus);
      const t0 = Date.now();
      await page.goto(`${base}/?${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => {
        const n = (window as unknown as { __NL?: { tick?: number } }).__NL;
        const h = document.getElementById('hud');
        return (n?.tick ?? 0) >= 1 && !!h && (h.textContent?.length ?? 0) > 40;
      }, undefined, { timeout: 180000 });
      await page.mouse.click(480, 270);
      const loadS = (Date.now() - t0) / 1000;
      await page.waitForTimeout(4000);
      await context.close();
      const webm = spawnSync('bash', ['-lc', `ls -1 "${dir}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
      if (!webm) throw new Error(`pas de webm pour ${a.id}`);
      const d = encodeH264(webm, mp4, Math.max(0, ffprobeDur(webm) - 2.25), 2.2);
      void loadS;
      demoDur += d;
      clips.push(mp4);
      console.log('clip', a.id, d);
    }
    await browser.close();

    const matchMp4Existing = join(tmp, 'match.mp4');
    if (existsSync(matchMp4Existing) && ffprobeDur(matchMp4Existing) > 200) {
      matchDur = ffprobeDur(matchMp4Existing);
      clips.push(matchMp4Existing);
      console.log('match reuse', matchDur);
    } else {

    const matchBrowser = await chromium.launch({ headless: true, args: swift });
    const matchDir = join(tmp, 'match');
    mkdirSync(matchDir, { recursive: true });
    const matchCtx = await matchBrowser.newContext({
      viewport: { width: 960, height: 540 },
      recordVideo: { dir: matchDir, size: { width: 960, height: 540 } },
    });
    matchCtx.setDefaultTimeout(120000);
    const matchPage = await matchCtx.newPage();
    const matchUrl = `${base}/?autoplay=kiter&cam=troisquarts&tex=512&seed=900000`;
    const tMatch = Date.now();
    await matchPage.goto(matchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await matchPage.waitForFunction(() => {
      const n = (window as unknown as { __NL?: { tick?: number } }).__NL;
      return (n?.tick ?? 0) >= 1;
    }, undefined, { timeout: 120000 });
    await matchPage.mouse.click(480, 270);
    const matchLoadS = (Date.now() - tMatch) / 1000;
    const deadline = Date.now() + 420000;
    let last: { tick?: number; done?: boolean; winner?: string } | null = null;
    while (Date.now() < deadline) {
      last = await matchPage.evaluate(() => (window as unknown as { __NL?: { tick?: number; done?: boolean; winner?: string } }).__NL ?? null);
      const msg = await matchPage.evaluate(() => {
        const el = document.getElementById('msg');
        return el ? getComputedStyle(el).display : 'missing';
      });
      console.log('match-poll', JSON.stringify({ last, msg, wall: ((Date.now() - tMatch) / 1000).toFixed(1) }));
      if (last?.done || msg === 'block') break;
      await matchPage.waitForTimeout(1500);
    }
    await matchPage.waitForTimeout(1600);
    await matchPage.screenshot({ path: join(OUT, 'match-end.png'), type: 'png' });
    await matchCtx.close();
    await matchBrowser.close();
    const matchWebm = spawnSync('bash', ['-lc', `ls -1 "${matchDir}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
    const matchMp4 = join(tmp, 'match.mp4');
    matchDur = encodeH264(matchWebm, matchMp4, Math.max(0, matchLoadS - 0.2));
    clips.push(matchMp4);
    console.log('match', matchDur, last);
    }
  });
  const cuesJson = join(tmp, 'match-cues.json');
  const dump = spawnSync('bun', [join(ROOT, 'scripts/dump-match-cues.ts')], {
    cwd: ROOT,
    env: { ...process.env, SEED: '900000', AUTOPLAY: 'kiter', OUT: cuesJson },
    encoding: 'utf8',
  });
  if (dump.status !== 0) throw new Error(dump.stderr || dump.stdout);
  const wav = join(tmp, 'match.wav');
  const mix = spawnSync('python3', [join(ROOT, 'scripts/mix-match-audio.py'), cuesJson, wav], {
    cwd: ROOT, encoding: 'utf8',
  });
  if (mix.status !== 0) throw new Error(mix.stderr || mix.stdout);
  const aac = join(tmp, 'match.m4a');
  const aacEnc = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', wav,
    '-c:a', 'aac', '-b:a', '96k', aac,
  ], { encoding: 'utf8' });
  if (aacEnc.status !== 0) throw new Error(aacEnc.stderr);
  const list = join(tmp, 'list.txt');
  writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
  const silent = join(tmp, 'concat-silent.mp4');
  const cat = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=854:480,fps=24,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '34',
    silent,
  ], { encoding: 'utf8' });
  if (cat.status !== 0) throw new Error(cat.stderr);
  const out = join(VID, 'anim-impact.mp4');
  const mux = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', silent, '-itsoffset', String(demoDur), '-i', aac,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k',
    '-movflags', '+faststart',
    '-metadata', 'title=anim-impact whoa + match kiter seed 900000',
    out,
  ], { encoding: 'utf8' });
  if (mux.status !== 0) throw new Error(mux.stderr);
  const bytes = Number(spawnSync('stat', ['-c', '%s', out], { encoding: 'utf8' }).stdout.trim());
  if (bytes > 15 * 1024 * 1024) throw new Error(`video trop lourde ${bytes}`);
  const dur = ffprobeDur(out);
  writeFileSync(join(OUT, 'video-probe.json'), JSON.stringify({
    out, bytes, duration: dur, demoDur, matchDur, dump: dump.stdout.trim(), mix: mix.stdout.trim(),
  }, null, 2));
  console.log('video', out, 'bytes', bytes, 'ffprobe', dur, 'demo', demoDur, 'match', matchDur);
}

if (PHASE === 'avant' || PHASE === 'all') await captureStills(true);
if (PHASE === 'apres' || PHASE === 'all') await captureStills(false);
if (PHASE === 'combo' || PHASE === 'all') combo();
if (PHASE === 'live') await withServer((base) => liveConsole(base));
if (PHASE === 'video' || PHASE === 'all') await video();
console.log('capture-anim-impact ok', PHASE);
process.exit(0);
