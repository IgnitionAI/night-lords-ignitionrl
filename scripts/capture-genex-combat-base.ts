// Recette IGN-136/137 : kinds de base retargetés, deux Night Lords, poses regardées.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/genex-combat-base');
const PORT = Number(process.env.PORT ?? 18220);
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

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
  server.on('exit', (code) => {
    clearTimeout(timer);
    reject(new Error(`serveur exit ${code}`));
  });
});

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/data/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
context.setDefaultTimeout(180000);
const consoleLines: string[] = [];
const pageErrors: string[] = [];
const networkFailed: { status: number; url: string }[] = [];
const urls: Record<string, string> = {};
const diagnostics: Record<string, unknown> = {};
const jobs: [string, string][] = [
  ['nl1-attack-debut', 'demo=genex-nl1-attack&cam=epaule&shot=4&focus=0'],
  ['nl1-attack-contact', 'demo=genex-nl1-attack&cam=epaule&shot=6&focus=0'],
  ['nl1-attack-fin', 'demo=genex-nl1-attack&cam=epaule&shot=7&focus=0'],
  ['nl1-death-debut', 'demo=combat-death&cam=troisquarts&shot=5&focus=0&genexBase=1'],
  ['nl1-death-chute', 'demo=combat-death&cam=troisquarts&shot=9&focus=0&genexBase=1'],
  ['nl1-death-fin', 'demo=combat-death&cam=troisquarts&shot=13&focus=0&genexBase=1'],
  ['nl2-attack-debut', 'demo=combat-attack&cam=epaule&shot=4&focus=1&genexBase=1'],
  ['nl2-attack-contact', 'demo=combat-attack&cam=epaule&shot=6&focus=1&genexBase=1'],
  ['nl2-attack-fin', 'demo=combat-attack&cam=epaule&shot=7&focus=1&genexBase=1'],
  ['nl2-hit-debut', 'demo=combat-hit&cam=epaule&shot=4&focus=1&genexBase=1'],
  ['nl2-hit-contact', 'demo=combat-hit&cam=epaule&shot=5&focus=1&genexBase=1'],
  ['nl2-hit-fin', 'demo=combat-hit&cam=epaule&shot=6&focus=1&genexBase=1'],
  ['nl2-dodge-debut', 'demo=combat-nl-dodge&cam=epaule&shot=3&focus=1&genexBase=1'],
  ['nl2-dodge-contact', 'demo=combat-nl-dodge&cam=epaule&shot=5&focus=1&genexBase=1'],
  ['nl2-dodge-fin', 'demo=combat-nl-dodge&cam=epaule&shot=7&focus=1&genexBase=1'],
];

for (const [name, demoQuery] of jobs) {
  const page = await context.newPage();
  page.on('console', (message) => consoleLines.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) networkFailed.push({ status: response.status(), url: response.url() });
  });
  const url = `${BASE}/?${demoQuery}&impact=0&tex=512&seed=1`;
  urls[name] = url;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 85 });
  diagnostics[name] = await page.evaluate(() => ({
    camera: (window as unknown as { __CAM?: unknown }).__CAM,
    bodies: (window as unknown as { __nlBodies?: unknown }).__nlBodies,
  }));
  await page.close();
}

const report = { urls, diagnostics, console: consoleLines, pageErrors, networkFailed };
writeFileSync(join(OUT, 'playwright.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pageErrors: pageErrors.length, networkFailed: networkFailed.length, shots: Object.keys(urls).length }));
await browser.close();
server.kill('SIGTERM');
if (pageErrors.length || networkFailed.some((r) => !r.url.includes('/web/sfx/'))) process.exit(1);
