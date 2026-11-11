// Manche réelle b5 avec les 20 clips retargetés : vidéo interne, carton de fin et preuves.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium, type Page } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/genex-match');
const FRAMES = join(OUT, 'frames');
const VIDEO = join(ROOT, 'docs/videos/genex-combat-base.mp4');
const PORT = Number(process.env.PORT ?? 18222);
const PLAY_SPEED = 1.75;
mkdirSync(FRAMES, { recursive: true });
mkdirSync(dirname(VIDEO), { recursive: true });

async function grabPage(page: Page, path: string): Promise<void> {
  try {
    await page.screenshot({ path, type: 'jpeg', quality: 80, timeout: 8000, animations: 'disabled', caret: 'hide' });
  } catch {
    const dataUrl = await page.evaluate(() => {
      const canvas = document.getElementById('c') as HTMLCanvasElement | null;
      return canvas?.toDataURL('image/jpeg', 0.80) ?? '';
    });
    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('capture canvas vide');
    writeFileSync(path, Buffer.from(base64, 'base64'));
  }
}

const server = spawn('bun', ['dist/server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout serveur')), 20000);
  const onData = (buf: Buffer) => {
    const text = buf.toString();
    process.stdout.write(text);
    if (text.includes('proto sur')) {
      clearTimeout(timer);
      resolve();
    }
  };
  server.stdout?.on('data', onData);
  server.stderr?.on('data', onData);
  server.on('exit', (code) => reject(new Error(`serveur exit ${code}`)));
});

let finalState: unknown;
let finalTick = 0;
let frame = 0;
try {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/data/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${PORT}/?autoplay=kiter&seed=900002&cam=combat&tex=512&speed=${PLAY_SPEED}&cap=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => (window as unknown as { __SCENE_READY?: boolean }).__SCENE_READY === true, { timeout: 180000 });
  await page.mouse.click(640, 360);
  let state: { done?: boolean; tick?: number } | undefined;
  await grabPage(page, join(FRAMES, `${String(frame++).padStart(4, '0')}.jpg`));
  for (let index = 0; index < 350; index++) {
    state = await page.evaluate(() => (window as unknown as { __capStep?: (n?: number) => { done?: boolean; tick?: number } }).__capStep?.(4));
    finalTick = state?.tick ?? finalTick;
    await grabPage(page, join(FRAMES, `${String(frame++).padStart(4, '0')}.jpg`));
    if (state?.done) break;
  }
  if (!state?.done) throw new Error(`manche non terminée tick=${finalTick}`);
  finalState = await page.evaluate(() => (window as unknown as { __NL?: unknown }).__NL);
  const finalFrame = frame - 1;
  for (let hold = 0; hold < 45; hold++) {
    copyFileSync(join(FRAMES, `${String(finalFrame).padStart(4, '0')}.jpg`), join(FRAMES, `${String(frame++).padStart(4, '0')}.jpg`));
  }
  writeFileSync(join(OUT, 'capture.json'), JSON.stringify({ finalState, finalTick, finalFrame, frames: frame }, null, 2));
  await browser.close();
} finally {
  server.kill('SIGTERM');
}

const encode = spawnSync('ffmpeg', [
  '-y', '-hide_banner', '-framerate', String(PLAY_SPEED / 0.4),
  '-i', join(FRAMES, '%04d.jpg'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '32', '-preset', 'veryfast',
  VIDEO,
], { encoding: 'utf8' });
if (encode.status !== 0 || !existsSync(VIDEO)) throw new Error(encode.stderr);
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', VIDEO], { encoding: 'utf8' });
writeFileSync(join(OUT, 'ffprobe.json'), probe.stdout);
const black = spawnSync('ffmpeg', ['-hide_banner', '-i', VIDEO, '-vf', 'blackdetect=d=0.05:pix_th=0.10', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
writeFileSync(join(OUT, 'blackdetect.txt'), black.stderr + black.stdout);
if (!probe.stdout.includes('"codec_name": "h264"')) throw new Error('vidéo H264 non vérifiée');
console.log(JSON.stringify({ video: VIDEO, finalState, finalTick, probe: JSON.parse(probe.stdout).format }, null, 2));
