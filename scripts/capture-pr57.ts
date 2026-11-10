// Captures Playwright (Chromium + SwiftShader) pour #57 : 6 frames RAF + ?shot=.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/pr57');
const PORT = Number(process.env.PORT ?? 18190);
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

const server = spawn('bun', ['dist/server.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
await waitListen(server, 'proto sur', 15000);

const consoleLines: string[] = [];
const pageErrors: string[] = [];
const net: { status: number; url: string }[] = [];
const onConsole = (m: { type: () => string; text: () => string }) => consoleLines.push(`${m.type()}: ${m.text()}`);
const onErr = (e: Error) => pageErrors.push(String(e));
const onRes = (r: { status: () => number; url: () => string }) => net.push({ status: r.status(), url: r.url() });

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

const shotUrl = `${BASE}/?autoplay=march&seed=3&cam=couloir&shot=20&tex=512`;
const shotPage = await context.newPage();
shotPage.on('console', onConsole);
shotPage.on('pageerror', onErr);
shotPage.on('response', onRes);
await shotPage.goto(shotUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await shotPage.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
await shotPage.screenshot({ path: join(OUT, 'shot-20.png'), type: 'png' });

const liveUrl = `${BASE}/?autoplay=march&seed=3&cam=couloir&tex=512`;
const page = await context.newPage();
page.on('console', onConsole);
page.on('pageerror', onErr);
page.on('response', onRes);
await page.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#hud .clock', { timeout: 120000 });
await page.waitForFunction(() => /t[3-9]\d/.test(document.getElementById('hud')?.textContent ?? ''), { timeout: 120000 });
await page.screenshot({ path: join(OUT, 'live-still.png'), type: 'png' });

const rafTick = () => page.evaluate(() => new Promise<void>((r) => {
  requestAnimationFrame(() => requestAnimationFrame(() => r()));
}));
for (let i = 0; i < 6; i++) {
  await rafTick();
  await page.screenshot({ path: join(OUT, `raf-${i}.png`), type: 'png' });
}

const consoleErrors = consoleLines.filter((l) => l.startsWith('error:') && !l.includes("Couldn't load texture"));
const report = {
  liveUrl, shotUrl,
  console: consoleLines,
  consoleErrors,
  pageErrors,
  networkFailed: net.filter((r) => r.status >= 400),
  networkOk: net.filter((r) => r.status < 400).length,
  frames: 6,
};
writeFileSync(join(OUT, 'playwright.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  pageErrors: pageErrors.length,
  consoleErrors: consoleErrors.length,
  netFail: report.networkFailed.length,
  frames: 6,
}, null, 2));
const sfx404 = (u: string) => u.includes('/web/sfx/');
const hardNet = report.networkFailed.filter((r) => !sfx404(r.url));
const hardConsole = consoleErrors.filter((l) => !l.includes('404'));
if (pageErrors.length || hardConsole.length || hardNet.length) {
  throw new Error(`erreurs: ${[...pageErrors, ...hardConsole].join('\n')}`);
}

await browser.close();
server.kill('SIGTERM');
console.log('capture-pr57 ok');
process.exit(0);
