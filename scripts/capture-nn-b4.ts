// Capture Playwright (Chromium + SwiftShader) d'un match ?policy=b4.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/nn-b4');
const PORT = Number(process.env.PORT ?? 18192);
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

const shotUrl = `${BASE}/?policy=b4&autoplay=kiter&seed=900000&cam=couloir&shot=40&tex=512`;
const shotPage = await context.newPage();
shotPage.on('console', onConsole);
shotPage.on('pageerror', onErr);
shotPage.on('response', onRes);
await shotPage.goto(shotUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await shotPage.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
await shotPage.screenshot({ path: join(OUT, 'shot-policy-b4.png'), type: 'png' });

const liveUrl = `${BASE}/?policy=b4&autoplay=kiter&seed=900000&cam=couloir&tex=512`;
const page = await context.newPage();
page.on('console', onConsole);
page.on('pageerror', onErr);
page.on('response', onRes);
await page.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#hud .clock', { timeout: 120000 });
await page.waitForFunction(() => /t[2-9]\d/.test(document.getElementById('hud')?.textContent ?? ''), { timeout: 120000 });
const hud = await page.evaluate(() => document.getElementById('hud')?.textContent ?? '');
await page.screenshot({ path: join(OUT, 'live-policy-b4.png'), type: 'png' });

const consoleErrors = consoleLines.filter((l) => l.startsWith('error:') && !l.includes("Couldn't load texture"));
const policyOk = net.some((r) => r.url.includes('/policy/candidates/b4/actor.json') && r.status === 200);
const report = {
  liveUrl, shotUrl, hud,
  policyOk,
  console: consoleLines,
  consoleErrors,
  pageErrors,
  networkFailed: net.filter((r) => r.status >= 400),
  networkOk: net.filter((r) => r.status < 400).length,
};
writeFileSync(join(OUT, 'playwright.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pageErrors: pageErrors.length, consoleErrors: consoleErrors.length, policyOk, hud: hud.slice(0, 200) }, null, 2));
const sfx404 = (u: string) => u.includes('/web/sfx/');
const hardNet = report.networkFailed.filter((r) => !sfx404(r.url));
const hardConsole = consoleErrors.filter((l) => !l.includes('404'));
if (pageErrors.length || hardConsole.length || hardNet.length || !policyOk) {
  throw new Error(`erreurs capture b4: ${[...pageErrors, ...hardConsole].join('\n')} policyOk=${policyOk}`);
}

await browser.close();
server.kill('SIGTERM');
console.log('capture-nn-b4 ok');
process.exit(0);
