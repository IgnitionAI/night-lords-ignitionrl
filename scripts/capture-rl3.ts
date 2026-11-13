// Capture Playwright (Chromium + SwiftShader) : jouer → envoyer → entraîner → rejouer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/rl3');
const PORT = Number(process.env.RL3_PORT ?? 18230);
const BASE = `http://127.0.0.1:${PORT}`;

mkdirSync(OUT, { recursive: true });

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

const server = spawn('bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT)], {
  cwd: ROOT, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'],
});
await waitListen(server, '127.0.0.1', 20000);

const consoleLines: string[] = [];
const pageErrors: string[] = [];
const net: { status: number; url: string }[] = [];
let gpu = 'unknown';
let renderNote = '';

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
const page = await context.newPage();
page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));

const url = `${BASE}/web/index.html?rl3=1&autoplay=wallHugger&seed=1&cam=couloir&tex=256&env=0`;
let ok = false;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#rl3', { timeout: 60000 });
  await page.waitForFunction(() => /t[2-9]\d/.test(document.getElementById('hud')?.textContent ?? ''), { timeout: 90000 });
  gpu = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) return 'no-webgl';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'webgl';
  });
  renderNote = /swiftshader|llvmpipe|software/i.test(gpu) ? 'SwiftShader/CPU' : gpu;
  await page.screenshot({ path: join(OUT, '01-play.png'), type: 'png' });
  await page.click('#rl3-send');
  await page.waitForFunction(() => /ok|frames|error/i.test(document.getElementById('rl3-log')?.textContent ?? ''), { timeout: 30000 });
  await page.screenshot({ path: join(OUT, '02-send.png'), type: 'png' });
  await page.click('#rl3-train');
  await page.waitForFunction(() => /accVal|majorityVal|error|synthétique/i.test(document.getElementById('rl3-log')?.textContent ?? ''), { timeout: 120000 });
  await page.screenshot({ path: join(OUT, '03-train.png'), type: 'png' });
  await page.click('#rl3-replay');
  await page.waitForFunction(() => /replay figé|checkpoint absent/i.test(document.getElementById('rl3-log')?.textContent ?? ''), { timeout: 30000 });
  await page.screenshot({ path: join(OUT, '04-replay.png'), type: 'png' });
  ok = true;
} catch (e) {
  renderNote = `NON VÉRIFIÉ: ${String(e)}`;
  try { await page.screenshot({ path: join(OUT, 'fail.png'), type: 'png' }); } catch { /* */ }
}

writeFileSync(join(OUT, 'console.json'), JSON.stringify({ consoleLines, pageErrors }, null, 1));
writeFileSync(join(OUT, 'network.json'), JSON.stringify(net, null, 1));
writeFileSync(join(OUT, 'playwright.json'), JSON.stringify({
  url, ok, gpu, renderNote, base: BASE, swiftshader: true,
  netSample: net.slice(0, 40),
  consoleTail: consoleLines.slice(-40),
  pageErrors,
}, null, 1));

await browser.close();
server.kill('SIGTERM');
console.log(JSON.stringify({ ok, gpu, renderNote, out: OUT }));
if (!ok) process.exit(1);
