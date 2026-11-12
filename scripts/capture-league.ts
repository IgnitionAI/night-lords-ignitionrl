// Captures Playwright (Chromium + SwiftShader) de la page ligue.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/league');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.LEAGUE_URL ?? 'http://127.0.0.1:18230/web/league.html';

const consoleLines: { type: string; text: string }[] = [];
const pageErrors: string[] = [];
const net: { status: number; url: string; method: string }[] = [];

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
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('console', m => consoleLines.push({ type: m.type(), text: m.text() }));
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('response', r => net.push({ status: r.status(), url: r.url(), method: r.request().method() }));

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#app:not([hidden]), #err:not([hidden])', { timeout: 30000 });
const errVisible = await page.locator('#err').isVisible().catch(() => false);
const appVisible = await page.locator('#app').isVisible().catch(() => false);
await page.screenshot({ path: join(OUT, 'league-initial.png'), type: 'png', fullPage: true });

if (appVisible) {
  await page.selectOption('#home', '1');
  await page.selectOption('#away', '50');
  await page.click('#play');
  await page.waitForFunction(() => /gen-1 vs gen-50/.test(document.getElementById('matchMeta')?.textContent ?? ''), { timeout: 15000 });
  await page.screenshot({ path: join(OUT, 'league-1-vs-50.png'), type: 'png', fullPage: true });
  await page.selectOption('#home', '10');
  await page.selectOption('#away', '50');
  await page.click('#play');
  await page.waitForFunction(() => /gen-10 vs gen-50/.test(document.getElementById('matchMeta')?.textContent ?? ''), { timeout: 15000 });
  await page.screenshot({ path: join(OUT, 'league-10-vs-50.png'), type: 'png', fullPage: true });
}

const report = {
  url: BASE,
  errVisible,
  appVisible,
  title: await page.title(),
  errText: errVisible ? await page.locator('#err').innerText() : null,
  console: consoleLines,
  pageErrors,
  network: net,
};
writeFileSync(join(OUT, 'playwright.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'console.json'), JSON.stringify(consoleLines, null, 2));
writeFileSync(join(OUT, 'network.json'), JSON.stringify(net, null, 2));
await browser.close();
console.log(JSON.stringify({ ok: true, errVisible, appVisible, shots: appVisible ? 3 : 1, console: consoleLines.length, network: net.length }, null, 2));
if (pageErrors.length) process.exit(2);
if (!appVisible) process.exit(3);
