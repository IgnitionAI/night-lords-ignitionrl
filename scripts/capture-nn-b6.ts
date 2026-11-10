// Capture Playwright (Chromium + SwiftShader) : HUD ?policy=b6, plus vidéo d'un match complet.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/nn-b6');
const VID = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18194);
const BASE = `http://127.0.0.1:${PORT}`;
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
    return await fn(BASE);
  } finally {
    server.kill('SIGTERM');
  }
}

async function waitTitle(page: { title: () => Promise<string> }, want: string, ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.title() === want) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`title ≠ ${want} (${await page.title()})`);
}

const swiftArgs = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
];

async function stills() {
  await withServer(async (base) => {
    const consoleLines: string[] = [];
    const pageErrors: string[] = [];
    const net: { status: number; url: string }[] = [];
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const shotUrl = `${base}/?policy=b6&autoplay=kiter&seed=900000&cam=couloir&shot=40&tex=512`;
    const shotPage = await context.newPage();
    shotPage.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
    shotPage.on('pageerror', (e) => pageErrors.push(String(e)));
    shotPage.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
    await shotPage.goto(shotUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitTitle(shotPage, 'READY', 60000);
    const hud = await shotPage.evaluate(() => document.getElementById('hud')?.textContent ?? '');
    await shotPage.screenshot({ path: join(OUT, 'policy-b6-hud.png'), type: 'png' });
    await shotPage.screenshot({ path: join(OUT, 'shot-policy-b6.png'), type: 'png' });

    const liveUrl = `${base}/?policy=b6&autoplay=kiter&seed=900000&cam=couloir&tex=512`;
    const livePage = await context.newPage();
    livePage.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
    livePage.on('pageerror', (e) => pageErrors.push(String(e)));
    livePage.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
    await livePage.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 4000));
    const liveHud = await livePage.evaluate(() => document.getElementById('hud')?.textContent ?? '');
    await livePage.screenshot({ path: join(OUT, 'live-policy-b6.png'), type: 'png' });

    const expected404 = (url: string) => /\/web\/sfx|manifest/i.test(url);
    const consoleErrors = consoleLines.filter((l) => l.startsWith('error:'));
    const unexpectedConsole = consoleErrors.filter((l) => !/404|sfx|manifest/i.test(l));
    const networkFailed = net.filter((r) => r.status >= 400);
    const unexpectedNet = networkFailed.filter((r) => !expected404(r.url));
    const policyB6 = net.some((r) => r.url.includes('/policy/candidates/b6/actor.json') && r.status === 200);
    const report = {
      liveUrl, shotUrl, hud, liveHud, policyB6,
      usedQueryPolicy: true,
      console: consoleLines, consoleErrors, pageErrors, networkFailed, unexpectedNet, unexpectedConsole,
    };
    writeFileSync(join(OUT, 'playwright.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      pageErrors: pageErrors.length,
      unexpectedConsole: unexpectedConsole.length,
      policyB6,
      hudHasB6: hud.includes('runs/b6') && hud.includes('?policy=b6'),
      hud: hud.slice(0, 360),
    }, null, 2));
    if (!policyB6) throw new Error('candidates/b6/actor.json non chargé');
    if (!hud.includes('?policy=b6')) throw new Error(`HUD sans ?policy=b6: ${hud}`);
    if (!/b6/.test(hud)) throw new Error(`HUD sans b6: ${hud}`);
    if (pageErrors.length || unexpectedConsole.length || unexpectedNet.length) {
      throw new Error(`erreurs capture: console=${JSON.stringify(unexpectedConsole)} net=${JSON.stringify(unexpectedNet)} page=${pageErrors}`);
    }
    await browser.close();
  });
  console.log('capture-nn-b6 stills ok');
}

async function recordMatch(policy: string, outName: string) {
  const tmp = join(OUT, `_clip-${policy}`);
  mkdirSync(tmp, { recursive: true });
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const context = await browser.newContext({
      viewport: { width: 960, height: 540 },
      recordVideo: { dir: tmp, size: { width: 960, height: 540 } },
    });
    const page = await context.newPage();
    const url = `${base}/?policy=${policy}&autoplay=kiter&seed=900000&cam=couloir&tex=256&env=0`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#hud', { timeout: 180000 });
    const t0 = Date.now();
    let last = '';
    while (Date.now() - t0 < 420000) {
      const st = await page.evaluate(() => {
        const hud = document.getElementById('hud')?.textContent ?? '';
        const msg = document.getElementById('msg');
        const msgOn = !!msg && getComputedStyle(msg).display !== 'none';
        return { hud, msgOn, title: document.title };
      });
      if (st.hud !== last) {
        last = st.hud;
        const t = /t(\d+)/.exec(st.hud)?.[1] ?? '?';
        console.log(policy, 'video tick', t, 'msg', st.msgOn, 's', ((Date.now() - t0) / 1000).toFixed(0));
      }
      if (st.msgOn) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const end = await page.evaluate(() => {
      const msg = document.getElementById('msg');
      return !!msg && getComputedStyle(msg).display !== 'none';
    });
    if (!end) throw new Error(`manche ${policy} non terminée (timeout vidéo)`);
    await page.waitForTimeout(2500);
    await context.close();
    await browser.close();
  });
  const webm = spawnSync('bash', ['-lc', `ls -1t "${tmp}"/*.webm | head -1`], { encoding: 'utf8' }).stdout.trim();
  if (!webm || !existsSync(webm)) throw new Error(`pas de webm ${policy}`);
  const out = join(VID, outName);
  const enc = spawnSync('ffmpeg', [
    '-y', '-i', webm, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
    '-crf', '26', '-preset', 'veryfast', '-movflags', '+faststart',
    '-vf', 'scale=1280:720',
    out,
  ], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(enc.stderr);
  const st = spawnSync('stat', ['-c', '%s', out], { encoding: 'utf8' });
  const bytes = Number(st.stdout.trim());
  if (bytes > 15 * 1024 * 1024) throw new Error(`video trop lourde ${bytes}`);
  if (bytes < 50_000) throw new Error(`video trop courte ${bytes}`);
  console.log('video', out, 'bytes', bytes);
}

const PLANCHE_TICKS = [80, 160, 240, 320, 400, 480];

async function planche() {
  const dir = join(OUT, 'planche');
  mkdirSync(dir, { recursive: true });
  await withServer(async (base) => {
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await context.newPage();
    const files: string[] = [];
    for (const tick of PLANCHE_TICKS) {
      const url = `${base}/?policy=b6&autoplay=kiter&seed=900000&cam=couloir&shot=${tick}&tex=512`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitTitle(page, 'READY', 60000);
      const png = join(dir, `t${tick}.png`);
      await page.screenshot({ path: png, type: 'png' });
      files.push(png);
      console.log('planche', tick);
    }
    await browser.close();
    const labeled = files.map((f, i) => {
      const tick = PLANCHE_TICKS[i];
      const out = join(dir, `lab-t${tick}.png`);
      const lab = spawnSync('ffmpeg', [
        '-y', '-i', f, '-vf',
        `scale=640:360,drawtext=text='t${tick} (${(tick * 0.1).toFixed(0)}s)':x=12:y=12:fontsize=22:fontcolor=white:borderw=2`,
        out,
      ], { encoding: 'utf8' });
      if (lab.status !== 0) throw new Error(lab.stderr);
      return out;
    });
    const row1 = join(dir, 'row1.png');
    const row2 = join(dir, 'row2.png');
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
  await recordMatch('b6', 'b6-match.mp4');
  await recordMatch('b5', 'b5-match.mp4');
}
if (PHASE === 'planche' || PHASE === 'all') await planche();
console.log('capture-nn-b6 ok', PHASE);
process.exit(0);
