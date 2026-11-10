// Captures Playwright (Chromium + SwiftShader CPU) : séquences combat + console/réseau.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/captures/combat-anims');
const PORT = Number(process.env.PORT ?? 18191);
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
await waitListen(server, 'proto sur', 20000);

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

async function shot(name: string, query: string) {
  const url = `${BASE}/?${query}`;
  const page = await context.newPage();
  page.on('console', onConsole);
  page.on('pageerror', onErr);
  page.on('response', onRes);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
  await page.screenshot({ path: join(OUT, `${name}.png`), type: 'png' });
  await page.close();
  return url;
}

const urls: Record<string, string> = {};
const jobs: [string, string][] = [
  ['attack-t4', 'demo=combat-attack&cam=couloir&shot=4&impact=0&tex=512&seed=1'],
  ['attack-t5', 'demo=combat-attack&cam=couloir&shot=5&impact=0&tex=512&seed=1'],
  ['attack-t7', 'demo=combat-attack&cam=couloir&shot=7&impact=0&tex=512&seed=1'],
  ['nl-attack-troisquarts-t5', 'demo=combat-attack&cam=troisquarts&shot=5&impact=0&tex=512&seed=1'],
  ['hit-t4', 'demo=combat-hit&cam=couloir&shot=4&impact=0&tex=512&seed=1'],
  ['hit-t5', 'demo=combat-hit&cam=couloir&shot=5&impact=0&tex=512&seed=1'],
  ['hit-t6', 'demo=combat-hit&cam=couloir&shot=6&impact=0&tex=512&seed=1'],
  ['hit-epaule-t5', 'demo=combat-hit&cam=epaule&shot=5&impact=0&tex=512&seed=1'],
  ['term-hit-troisquarts-t5', 'demo=combat-hit&cam=troisquarts&shot=5&impact=0&tex=512&seed=1'],
  ['death-t5', 'demo=combat-death&cam=couloir&shot=5&impact=0&tex=512&seed=1'],
  ['death-t7', 'demo=combat-death&cam=couloir&shot=7&impact=0&tex=512&seed=1'],
  ['death-t10', 'demo=combat-death&cam=couloir&shot=10&impact=0&tex=512&seed=1'],
  ['death-t14', 'demo=combat-death&cam=couloir&shot=14&impact=0&tex=512&seed=1'],
  ['nl-death-troisquarts-t10', 'demo=combat-death&cam=troisquarts&shot=10&impact=0&tex=512&seed=1'],
  ['dodge-t2', 'demo=combat-dodge&cam=couloir&shot=2&impact=0&tex=512&seed=1'],
  ['dodge-t4', 'demo=combat-dodge&cam=couloir&shot=4&impact=0&tex=512&seed=1'],
  ['dodge-t5', 'demo=combat-dodge&cam=couloir&shot=5&impact=0&tex=512&seed=1'],
  ['dodge-epaule-t4', 'demo=combat-dodge&cam=epaule&shot=4&impact=0&tex=512&seed=1'],
  ['term-dodge-troisquarts-t4', 'demo=combat-dodge&cam=troisquarts&shot=4&impact=0&tex=512&seed=1'],
  ['shot-t4', 'demo=combat-shot&cam=couloir&shot=4&impact=0&tex=512&seed=1'],
  ['shot-t5', 'demo=combat-shot&cam=couloir&shot=5&impact=0&tex=512&seed=1'],
  ['term-shot-troisquarts-t5', 'demo=combat-shot&cam=troisquarts&shot=5&impact=0&tex=512&seed=1'],
  ['nl-dodge-t3', 'demo=combat-nl-dodge&cam=couloir&shot=3&impact=0&tex=512&seed=1'],
  ['nl-dodge-troisquarts-t4', 'demo=combat-nl-dodge&cam=troisquarts&shot=4&impact=0&tex=512&seed=1'],
  ['term-fist-t5', 'demo=combat-term-fist&cam=couloir&shot=5&impact=0&tex=512&seed=1'],
  ['term-fist-troisquarts-t6', 'demo=combat-term-fist&cam=troisquarts&shot=6&impact=0&tex=512&seed=1'],
  ['nl-hit-t12', 'demo=combat-term-fist&cam=couloir&shot=12&impact=0&tex=512&seed=1'],
  ['nl-hit-troisquarts-t12', 'demo=combat-term-fist&cam=troisquarts&shot=12&impact=0&tex=512&seed=1'],
];
for (const [name, q] of jobs) urls[name] = await shot(name, q);

const consoleErrors = consoleLines.filter((l) => l.startsWith('error:') && !l.includes("Couldn't load texture"));
const report = {
  urls,
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
  netFail: report.networkFailed.length,
  shots: jobs.length,
}, null, 2));

const sfx404 = (u: string) => u.includes('/web/sfx/');
const hardNet = report.networkFailed.filter((r) => !sfx404(r.url));
const hardConsole = consoleErrors.filter((l) => !l.includes('404'));
if (pageErrors.length || hardConsole.length || hardNet.length) {
  throw new Error(`erreurs: ${[...pageErrors, ...hardConsole, ...hardNet.map((n) => String(n.status) + ' ' + n.url)].join('\n')}`);
}

await browser.close();
server.kill('SIGTERM');
console.log('capture-combat-anims ok');
process.exit(0);
