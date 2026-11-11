// Portillon IGN-136 : contrôle du clip NL-1 action 97 après retarget local.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/genex-retarget-nl1-action97');
const PORT = Number(process.env.PORT ?? 18210);
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

for (const [name, query] of [
  ['debut-t0', 'demo=genex-nl1-attack&cam=epaule&shot=4&impact=0&tex=512&seed=1&focus=0'],
  ['contact', 'demo=genex-nl1-attack&cam=epaule&shot=6&impact=0&tex=512&seed=1&focus=0'],
  ['fin', 'demo=genex-nl1-attack&cam=epaule&shot=7&impact=0&tex=512&seed=1&focus=0'],
  ['contact-troisquarts', 'demo=genex-nl1-attack&cam=troisquarts&shot=6&impact=0&tex=512&seed=1&focus=0'],
] as const) {
  const page = await context.newPage();
  page.on('console', (message) => consoleLines.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) networkFailed.push({ status: response.status(), url: response.url() });
  });
  const url = `${BASE}/?${query}`;
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
