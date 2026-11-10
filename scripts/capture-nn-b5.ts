// Capture Playwright (Chromium + SwiftShader) : b5 via ?policy=b5 ; défaut inchangé.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/nn-b5');
const PORT = Number(process.env.PORT ?? 18193);
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
    '--disable-dev-shm-usage',
  ],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

async function waitTitle(page: { title: () => Promise<string> }, want: string, ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.title() === want) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`title ≠ ${want} (${await page.title()})`);
}

const shotUrl = `${BASE}/?policy=b5&autoplay=kiter&seed=900000&cam=couloir&shot=40&tex=512`;
const shotPage = await context.newPage();
shotPage.on('console', onConsole);
shotPage.on('pageerror', onErr);
shotPage.on('response', onRes);
await shotPage.goto(shotUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitTitle(shotPage, 'READY', 60000);
const hud = await shotPage.evaluate(() => document.getElementById('hud')?.textContent ?? '');
await shotPage.screenshot({ path: join(OUT, 'policy-b5-hud.png'), type: 'png' });
await shotPage.screenshot({ path: join(OUT, 'shot-policy-b5.png'), type: 'png' });

const liveUrl = `${BASE}/?policy=b5&autoplay=kiter&seed=900000&cam=couloir&tex=512`;
const livePage = await context.newPage();
const liveConsole: string[] = [];
const liveNet: { status: number; url: string }[] = [];
livePage.on('console', (m) => liveConsole.push(`${m.type()}: ${m.text()}`));
livePage.on('pageerror', onErr);
livePage.on('response', (r) => liveNet.push({ status: r.status(), url: r.url() }));
await livePage.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
const liveHud = await livePage.evaluate(() => document.getElementById('hud')?.textContent ?? '');
await livePage.screenshot({ path: join(OUT, 'live-policy-b5.png'), type: 'png' });

const expected404 = (url: string) => /\/web\/sfx|manifest/i.test(url);
const consoleErrors = [...consoleLines, ...liveConsole].filter((l) => l.startsWith('error:'));
const unexpectedConsole = consoleErrors.filter((l) => !/404|sfx|manifest/i.test(l));
const networkFailed = [...net, ...liveNet].filter((r) => r.status >= 400);
const unexpectedNet = networkFailed.filter((r) => !expected404(r.url));
const policyB5 = [...net, ...liveNet].some((r) => r.url.includes('/policy/candidates/b5/actor.json') && r.status === 200);
const report = {
  liveUrl,
  shotUrl,
  hud,
  liveHud,
  policyB5,
  usedQueryPolicy: shotUrl.includes('policy=b5'),
  console: [...consoleLines, ...liveConsole],
  consoleErrors,
  pageErrors,
  networkFailed,
  unexpectedNet,
  unexpectedConsole,
};
writeFileSync(join(OUT, 'playwright.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  pageErrors: pageErrors.length,
  unexpectedConsole: unexpectedConsole.length,
  policyB5,
  hudHasB5: hud.includes('b5') || hud.includes('runs/b5'),
  hud: hud.slice(0, 320),
}, null, 2));

if (!shotUrl.includes('policy=b5')) throw new Error('la capture doit passer ?policy=b5');
if (!policyB5) throw new Error('candidates/b5/actor.json non chargé');
if (!(hud.includes('?policy=b5') && (hud.includes('runs/b5') || hud.includes('b5')))) {
  throw new Error(`HUD sans b5: ${hud}`);
}
if (pageErrors.length || unexpectedConsole.length || unexpectedNet.length) {
  throw new Error(`erreurs capture: console=${JSON.stringify(unexpectedConsole)} net=${JSON.stringify(unexpectedNet)} page=${pageErrors}`);
}

await browser.close();
server.kill('SIGTERM');
console.log('capture-nn-b5 ok');
process.exit(0);