// HUD b6p, vidéos combat, planche couloir vs combat (SwiftShader).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/camera-combat');
const VID = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18197);
const PHASE = process.env.PHASE ?? 'all';

mkdirSync(OUT, { recursive: true });
mkdirSync(VID, { recursive: true });

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
];

async function waitTitle(page: { title: () => Promise<string> }, want: string, ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.title() === want) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`title ≠ ${want} (${await page.title()})`);
}

async function stills() {
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const url = `${base}/?policy=b6p&autoplay=kiter&seed=900000&cam=combat&shot=40&tex=512`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitTitle(page, 'READY', 60000);
    const hud = await page.evaluate(() => document.getElementById('hud')?.textContent ?? '');
    await page.screenshot({ path: join(OUT, 'policy-b6p-hud.png'), type: 'png' });
    writeFileSync(join(OUT, 'hud.txt'), hud);
    if (!hud.includes('?policy=b6p') || !/b6@1950|b6p/.test(hud)) throw new Error(`HUD b6p: ${hud}`);
    await browser.close();
  });
}

async function recordMatch(opp: string, outName: string) {
  const tmp = join(OUT, `_clip-${opp}`);
  mkdirSync(tmp, { recursive: true });
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const context = await browser.newContext({
      viewport: { width: 960, height: 540 },
      recordVideo: { dir: tmp, size: { width: 960, height: 540 } },
    });
    const page = await context.newPage();
    const url = `${base}/?policy=b6p&autoplay=${opp}&seed=900000&cam=combat&tex=256&env=0`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#hud', { timeout: 180000 });
    const t0 = Date.now();
    while (Date.now() - t0 < 420000) {
      const st = await page.evaluate(() => {
        const msg = document.getElementById('msg');
        return { msgOn: !!msg && getComputedStyle(msg).display !== 'none' };
      });
      if (st.msgOn) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const end = await page.evaluate(() => {
      const msg = document.getElementById('msg');
      return !!msg && getComputedStyle(msg).display !== 'none';
    });
    if (!end) throw new Error(`manche ${opp} non terminée`);
    await page.waitForTimeout(2500);
    await context.close();
    await browser.close();
  });
  const webm = spawnSync('bash', ['-lc', `ls -1t "${tmp}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
  if (!webm || !existsSync(webm)) throw new Error(`pas de webm ${opp}`);
  const out = join(VID, outName);
  const enc = spawnSync('ffmpeg', [
    '-y', '-i', webm, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
    '-crf', '28', '-preset', 'veryfast', '-movflags', '+faststart',
    '-vf', 'scale=1280:720',
    out,
  ], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(enc.stderr);
  const bytes = Number(spawnSync('stat', ['-c', '%s', out], { encoding: 'utf8' }).stdout.trim());
  if (bytes > 15 * 1024 * 1024) throw new Error(`video trop lourde ${bytes}`);
  if (bytes < 50_000) throw new Error(`video trop courte ${bytes}`);
  console.log('video', out, 'bytes', bytes);
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
        const url = `${base}/?policy=b6p&autoplay=kiter&seed=900000&cam=${cam}&shot=${tick}&tex=512`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await waitTitle(page, 'READY', 60000);
        const png = join(dir, `${cam}-t${tick}.png`);
        await page.screenshot({ path: png, type: 'png' });
        const lab = join(dir, `lab-${cam}-t${tick}.png`);
        const r = spawnSync('ffmpeg', [
          '-y', '-i', png, '-vf',
          `scale=640:360,drawtext=text='${cam} t${tick}':x=12:y=12:fontsize=22:fontcolor=white:borderw=2`,
          lab,
        ], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error(r.stderr);
        labeled.push(lab);
        console.log('planche', cam, tick);
      }
    }
    await browser.close();
    const row1 = join(dir, 'row-couloir.png');
    const row2 = join(dir, 'row-combat.png');
    const board = join(OUT, 'planche-6.png');
    const h1 = spawnSync('ffmpeg', ['-y', '-i', labeled[0], '-i', labeled[1], '-i', labeled[2], '-filter_complex', 'hstack=inputs=3', row1], { encoding: 'utf8' });
    if (h1.status !== 0) throw new Error(h1.stderr);
    const h2 = spawnSync('ffmpeg', ['-y', '-i', labeled[3], '-i', labeled[4], '-i', labeled[5], '-filter_complex', 'hstack=inputs=3', row2], { encoding: 'utf8' });
    if (h2.status !== 0) throw new Error(h2.stderr);
    const v = spawnSync('ffmpeg', ['-y', '-i', row1, '-i', row2, '-filter_complex', 'vstack=inputs=2', board], { encoding: 'utf8' });
    if (v.status !== 0) throw new Error(v.stderr);
    console.log('planche', board);
  });
}

if (PHASE === 'stills' || PHASE === 'all') await stills();
if (PHASE === 'video' || PHASE === 'all') {
  await recordMatch('kiter', 'b6p-match.mp4');
  await recordMatch('wallHugger', 'b6p-wallhugger.mp4');
}
if (PHASE === 'planche' || PHASE === 'all') await planche();
console.log('capture-b6p ok', PHASE);
process.exit(0);
