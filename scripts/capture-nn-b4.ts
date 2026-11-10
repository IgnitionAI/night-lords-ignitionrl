// Capture Playwright (Chromium + SwiftShader) : b4 chargé par défaut, sans ?policy.
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

// `shot=` : pas d'initAudio, donc pas de 404 /web/sfx — 0 erreur console.
const shotUrl = `${BASE}/?autoplay=kiter&seed=900000&cam=couloir&shot=40&tex=512`;
const shotPage = await context.newPage();
shotPage.on('console', onConsole);
shotPage.on('pageerror', onErr);
shotPage.on('response', onRes);
await shotPage.goto(shotUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await shotPage.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
const hud = await shotPage.evaluate(() => document.getElementById('hud')?.textContent ?? '');
await shotPage.screenshot({ path: join(OUT, 'default-b4-hud.png'), type: 'png' });
await shotPage.screenshot({ path: join(OUT, 'shot-policy-b4.png'), type: 'png' });
await shotPage.screenshot({ path: join(OUT, 'live-policy-b4.png'), type: 'png' });

const consoleErrors = consoleLines.filter((l) => l.startsWith('error:'));
const policyDefault = net.some((r) => r.url.includes('/policy/current.json') && r.status === 200);
const usedQueryPolicy = shotUrl.includes('policy=');
const report = {
  liveUrl: shotUrl,
  shotUrl,
  hud,
  policyDefault,
  usedQueryPolicy,
  console: consoleLines,
  consoleErrors,
  pageErrors,
  networkFailed: net.filter((r) => r.status >= 400),
  networkOk: net.filter((r) => r.status < 400).length,
};
writeFileSync(join(OUT, 'playwright.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  pageErrors: pageErrors.length,
  consoleErrors: consoleErrors.length,
  policyDefault,
  usedQueryPolicy,
  hudHasB4: hud.includes('runs/b4@800'),
  hud: hud.slice(0, 280),
}, null, 2));

if (usedQueryPolicy) throw new Error('la capture ne doit pas passer ?policy');
if (!policyDefault) throw new Error('current.json non chargé');
if (!hud.includes('runs/b4@800')) throw new Error(`HUD sans b4: ${hud}`);
if (hud.includes('?policy=')) throw new Error(`HUD mentionne encore ?policy: ${hud}`);
if (pageErrors.length || consoleErrors.length || report.networkFailed.length) {
  throw new Error(`erreurs capture: console=${JSON.stringify(consoleErrors)} net=${JSON.stringify(report.networkFailed)} page=${pageErrors}`);
}

await browser.close();
server.kill('SIGTERM');
console.log('capture-nn-b4 ok');
process.exit(0);
