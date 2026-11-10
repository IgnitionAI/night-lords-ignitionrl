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
    const sfx404 = (u: string) => u.includes('/web/sfx/');
    const hardNet = report.networkFailed.filter((r) => !sfx404(r.url));
    const hardConsole = consoleErrors.filter((l) => !l.includes('404'));
    if (pageErrors.length || hardConsole.length || hardNet.length) {
      throw new Error(`erreurs ${tag}: ${[...pageErrors, ...hardConsole, ...hardNet.map((n) => `${n.status} ${n.url}`)].join('\n')}`);
    }
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

async function video() {
  const tmp = join(OUT, '_clips');
  mkdirSync(tmp, { recursive: true });
  const clips: string[] = [];
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
    for (const a of ACTIONS) {
      const dir = join(tmp, a.id);
      mkdirSync(dir, { recursive: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir, size: { width: 1280, height: 720 } },
      });
      const page = await context.newPage();
      const p = new URLSearchParams({ demo: a.demo, cam: 'troisquarts', impact: '0', tex: '512', seed: '1' });
      if (a.focus) p.set('focus', a.focus);
      await page.goto(`${base}/?${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('#hud', { timeout: 180000 });
      await page.waitForTimeout(2200);
      await context.close();
      const webm = spawnSync('bash', ['-lc', `ls -1 "${dir}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
      if (!webm) throw new Error(`pas de webm pour ${a.id}`);
      const mp4 = join(tmp, `${a.id}.mp4`);
      const enc = spawnSync('ffmpeg', [
        '-y', '-i', webm, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
        '-t', '2.2', mp4,
      ], { encoding: 'utf8' });
      if (enc.status !== 0) throw new Error(enc.stderr);
      clips.push(mp4);
      console.log('clip', a.id, mp4);
    }
    const matchDir = join(tmp, 'match');
    mkdirSync(matchDir, { recursive: true });
    const matchCtx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: matchDir, size: { width: 1280, height: 720 } },
    });
    const matchPage = await matchCtx.newPage();
    await matchPage.goto(`${base}/?autoplay=brawler&cam=troisquarts&impact=0&tex=512&seed=18`, {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await matchPage.waitForSelector('#hud', { timeout: 180000 });
    await matchPage.waitForTimeout(8000);
    await matchCtx.close();
    const matchWebm = spawnSync('bash', ['-lc', `ls -1 "${matchDir}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
    const matchMp4 = join(tmp, 'match.mp4');
    const encM = spawnSync('ffmpeg', [
      '-y', '-i', matchWebm, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
      '-t', '8', matchMp4,
    ], { encoding: 'utf8' });
    if (encM.status !== 0) throw new Error(encM.stderr);
    clips.push(matchMp4);
    await browser.close();
  });
  const list = join(tmp, 'list.txt');
  writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
  const out = join(VID, 'anim-impact.mp4');
  const cat = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-movflags', '+faststart',
    out,
  ], { encoding: 'utf8' });
  if (cat.status !== 0) throw new Error(cat.stderr);
  const st = spawnSync('stat', ['-c', '%s', out], { encoding: 'utf8' });
  const bytes = Number(st.stdout.trim());
  if (bytes > 15 * 1024 * 1024) throw new Error(`video trop lourde ${bytes}`);
  console.log('video', out, 'bytes', bytes);
}

if (PHASE === 'avant' || PHASE === 'all') await captureStills(true);
if (PHASE === 'apres' || PHASE === 'all') await captureStills(false);
if (PHASE === 'combo' || PHASE === 'all') combo();
if (PHASE === 'video' || PHASE === 'all') await video();
console.log('capture-anim-impact ok', PHASE);
process.exit(0);
