// Manche complète : vidéo Playwright + mix des cues (événements de sim) muxés AAC.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs/videos');
const PORT = Number(process.env.PORT ?? 18191);
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

writeFileSync(join(OUT_DIR, 'console.json'), JSON.stringify({ consoleLines, pageErrors, net: net.slice(0, 80), nl }, null, 2));

const mp4 = join(OUT_DIR, 'sound-match.mp4');
const mux = spawnSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', webm || '/dev/null',
  '-i', join(OUT_DIR, 'match-audio.wav'),
  '-map', '0:v:0', '-map', '1:a:0',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '23',
  '-c:a', 'aac', '-b:a', '160k',
  '-shortest',
  '-movflags', '+faststart',
  mp4,
], { encoding: 'utf8' });
process.stdout.write(mux.stdout);
process.stderr.write(mux.stderr);
if (mux.status !== 0 || !existsSync(mp4)) throw new Error('mux failed: ' + mux.stderr);

const probe = spawnSync('ffprobe', ['-hide_banner', '-show_streams', '-print_format', 'json', mp4], { encoding: 'utf8' });
writeFileSync(join(OUT_DIR, 'ffprobe.json'), probe.stdout);
const ebu = spawnSync('ffmpeg', ['-hide_banner', '-i', mp4, '-af', 'ebur128=framelog=verbose', '-f', 'null', '-'], { encoding: 'utf8' });
writeFileSync(join(OUT_DIR, 'ebur128.txt'), (ebu.stderr || '') + (ebu.stdout || ''));
console.log(JSON.stringify({ mp4, webm, nl, errors: pageErrors, manifest404: net.filter((x) => x.url.includes('manifest') && x.status === 404) }, null, 2));
