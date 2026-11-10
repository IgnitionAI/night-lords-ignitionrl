// Manche complète : vidéo Playwright SwiftShader + mix cues muxés AAC 48 kHz stéréo.
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs/videos');
const BANK = join(ROOT, 'web/sfx/nightlords');
const PORT = Number(process.env.PORT ?? 18192);
const SEED = Number(process.env.SEED ?? 3);
const AUTOPLAY = process.env.AUTOPLAY ?? 'brawler';
mkdirSync(OUT_DIR, { recursive: true });

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

const dump = spawnSync('bun', ['scripts/dump-match-cues.ts'], {
  cwd: ROOT,
  env: { ...process.env, SEED: String(SEED), AUTOPLAY, OUT: join(OUT_DIR, 'match-cues.json') },
  encoding: 'utf8',
});
process.stdout.write(dump.stdout);
process.stderr.write(dump.stderr);
if (dump.status !== 0) throw new Error('dump cues failed');

const mix = spawnSync('python3', ['scripts/mix-match-audio.py', join(OUT_DIR, 'match-cues.json'), join(OUT_DIR, 'match-audio.wav')], {
  cwd: ROOT, encoding: 'utf8',
});
process.stdout.write(mix.stdout);
process.stderr.write(mix.stderr);
if (mix.status !== 0) throw new Error('mix audio failed');

const server = spawn('bun', ['dist/server.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
await waitListen(server, 'proto sur', 20000);

const consoleLines: string[] = [];
const pageErrors: string[] = [];
const net: { status: number; url: string }[] = [];
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--autoplay-policy=no-user-gesture-required',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
});
context.setDefaultTimeout(180000);
const page = await context.newPage();
page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));

const url = `http://127.0.0.1:${PORT}/?autoplay=${AUTOPLAY}&seed=${SEED}&cam=couloir&tex=512`;
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#hud .clock', { timeout: 120000 });
await page.mouse.click(640, 360);
const audioState = await page.evaluate(async () => {
  const eng = (window as unknown as { __AUDIO?: { ctx?: AudioContext; unlock?: () => boolean; status?: () => { state: string } } }).__AUDIO;
  eng?.unlock?.();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let running = eng?.ctx?.state ?? 'none';
  if (Ctx && running !== 'running') {
    const c = new Ctx();
    await c.resume();
    running = c.state;
  }
  return { running, status: eng?.status?.() ?? null };
});
const done = await page.waitForFunction(() => {
  const n = (window as unknown as { __NL?: { done?: boolean; tick?: number } }).__NL;
  return !!(n && n.done) || (n && (n.tick ?? 0) > 900);
}, { timeout: 150000 });
void done;
await page.waitForTimeout(1200);
const nl = await page.evaluate(() => (window as unknown as { __NL?: unknown }).__NL);
const video = page.video();
await page.close();
const webm = video ? await video.path() : '';
await context.close();
await browser.close();
server.kill();

const oggs = readdirSync(BANK).filter((f) => f.endsWith('.ogg'));
const manifestHits = net.filter((x) => x.url.includes('manifest.json'));
const sfxNet = net.filter((x) => x.url.includes('/web/sfx/nightlords/'));
const failedSfx = sfxNet.filter((x) => x.status !== 200);
const proof = {
  consoleLines,
  pageErrors,
  audioState,
  manifest: manifestHits,
  sfxFailed: failedSfx,
  sfxOk: sfxNet.filter((x) => x.status === 200).length,
  oggFiles: oggs.length,
  nl,
};
writeFileSync(join(OUT_DIR, 'sound-redesign-live.json'), JSON.stringify(proof, null, 2));
writeFileSync(join(OUT_DIR, 'console.json'), JSON.stringify({ consoleLines, pageErrors, net: net.slice(0, 80), nl }, null, 2));

if (pageErrors.length) throw new Error('pageerror ' + pageErrors.join(';'));
if (failedSfx.length) throw new Error('sfx ' + JSON.stringify(failedSfx.slice(0, 8)));
if (!manifestHits.some((x) => x.status === 200)) throw new Error('manifest not 200');

function leadingBlackEnd(path: string): number {
  const det = spawnSync('ffmpeg', [
    '-hide_banner', '-i', path,
    '-vf', 'blackdetect=d=0.08:pix_th=0.10',
    '-an', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const log = (det.stderr || '') + (det.stdout || '');
  writeFileSync(join(OUT_DIR, 'sound-redesign-blackdetect-src.txt'), log);
  let cut = 0;
  for (const m of log.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (start <= 0.12 && end > cut) cut = end;
  }
  return cut;
}

const videoSs = webm ? leadingBlackEnd(webm) : 0;
const mp4 = join(OUT_DIR, 'sound-redesign.mp4');
const mux = spawnSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', webm || '/dev/null',
  '-i', join(OUT_DIR, 'match-audio.wav'),
  '-map', '0:v:0', '-map', '1:a:0',
  ...(videoSs > 0
    ? ['-vf', `trim=start=${videoSs.toFixed(3)},setpts=PTS-STARTPTS`]
    : []),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '23',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-shortest',
  '-movflags', '+faststart',
  mp4,
], { encoding: 'utf8' });
process.stdout.write(mux.stdout);
process.stderr.write(mux.stderr);
if (mux.status !== 0 || !existsSync(mp4)) throw new Error('mux failed: ' + mux.stderr);

const probe = spawnSync('ffprobe', ['-hide_banner', '-show_streams', '-print_format', 'json', mp4], { encoding: 'utf8' });
writeFileSync(join(OUT_DIR, 'sound-redesign-ffprobe.json'), probe.stdout);
const ebu = spawnSync('ffmpeg', ['-hide_banner', '-i', mp4, '-af', 'ebur128=peak=true:framelog=verbose', '-f', 'null', '-'], { encoding: 'utf8' });
writeFileSync(join(OUT_DIR, 'sound-redesign-ebur128.txt'), (ebu.stderr || '') + (ebu.stdout || ''));
const black = spawnSync('ffmpeg', [
  '-hide_banner', '-i', mp4,
  '-vf', 'blackdetect=d=0.08:pix_th=0.10',
  '-an', '-f', 'null', '-',
], { encoding: 'utf8' });
const blackLog = (black.stderr || '') + (black.stdout || '');
writeFileSync(join(OUT_DIR, 'sound-redesign-blackdetect.txt'), blackLog);
if (/black_start:/.test(blackLog)) throw new Error('blackdetect still reports black_start\n' + blackLog);
console.log(JSON.stringify({ mp4, webm, videoSs, nl, errors: pageErrors, audioState, manifest: manifestHits }, null, 2));
