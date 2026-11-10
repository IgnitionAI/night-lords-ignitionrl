// Preuves visuelles Le Sas + prototype, Chromium headless SwiftShader, sur le build local.
import { spawn } from 'bun';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConsoleMessage, Page, Request } from 'playwright';
import {
  allAboveGround, launchSwiftshader, movedCount, sasSnapshot, waitSasReady, type BodyState,
} from './sas-e2e-lib';

const ROOT = join(import.meta.dir, '..');
const OUT = join(ROOT, 'docs/captures/pr49');
const PORT = Number(process.env.PORT ?? 18190);
const ORIGIN = `http://127.0.0.1:${PORT}`;

mkdirSync(OUT, { recursive: true });

type LogLine = { type: string; text: string };
type NetFail = { url: string; failure: string | null; method: string };

function attach(page: Page, consoleLines: LogLine[], pageErrors: string[]) {
  page.on('console', (msg: ConsoleMessage) => consoleLines.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(String(err)));
}

async function shot(page: Page, name: string) {
  const file = join(OUT, name);
  await page.screenshot({ path: file, type: 'png' });
  return file;
}

const server = spawn({
  cmd: ['bun', 'dist/server.mjs'],
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdout: 'pipe',
  stderr: 'pipe',
});
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('serveur muet')), 15_000);
  const pump = async () => {
    if (!server.stdout || typeof server.stdout === 'number') return;
    const reader = server.stdout.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = dec.decode(value);
      process.stdout.write(text);
      if (text.includes('proto sur')) { clearTimeout(timer); resolve(); return; }
    }
  };
  void pump().catch(reject);
});

const browser = await launchSwiftshader();
const report: Record<string, unknown> = {
  origin: ORIGIN,
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  dpr: 1,
};

try {
  for (const vp of [{ w: 1440, h: 900, tag: '1440' }, { w: 390, h: 844, tag: '390' }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    const consoleLines: LogLine[] = [];
    const pageErrors: string[] = [];
    attach(page, consoleLines, pageErrors);
    await page.goto(`${ORIGIN}/sas?debug=1`, { waitUntil: 'domcontentloaded' });
    await waitSasReady(page);
    await page.waitForTimeout(600);
    const before = await sasSnapshot(page);
    await shot(page, `sas-${vp.tag}-ready.png`);
    await page.getByRole('button', { name: /Rafale/ }).click();
    await page.waitForTimeout(220);
    const impact = await sasSnapshot(page);
    await shot(page, `sas-${vp.tag}-impact.png`);
    await page.waitForTimeout(2500);
    const after = await sasSnapshot(page);
    await shot(page, `sas-${vp.tag}-after.png`);
    const move = movedCount(before.bodies, after.bodies);
    await page.getByRole('button', { name: 'Recommencer' }).click();
    await page.waitForTimeout(500);
    const reset = await sasSnapshot(page);
    report[`sas-${vp.tag}`] = {
      viewport: vp,
      consoleErrors: consoleLines.filter(l => l.type === 'error'),
      pageErrors,
      before, impact, after, reset,
      moved: move.moved,
      distances: move.distances,
      afterAboveGround: allAboveGround(after.bodies),
      resetAboveGround: allAboveGround(reset.bodies),
      collisions: after.metrics.collisions,
      backend: after.metrics.backend,
      calls: after.metrics.calls,
      triangles: after.metrics.triangles,
    };
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const consoleLines: LogLine[] = [];
    const pageErrors: string[] = [];
    const failed: NetFail[] = [];
    attach(page, consoleLines, pageErrors);
    await page.route(/\.glb(\?|$)/i, async route => {
      failed.push({ url: route.request().url(), failure: 'blocked-glb', method: route.request().method() });
      await route.abort('failed');
    });
    page.on('requestfailed', (req: Request) => {
      failed.push({ url: req.url(), failure: req.failure()?.errorText ?? null, method: req.method() });
    });
    await page.goto(`${ORIGIN}/sas?debug=1`, { waitUntil: 'domcontentloaded' });
    await waitSasReady(page);
    await page.waitForTimeout(800);
    const snap = await sasSnapshot(page);
    await shot(page, 'sas-1440-fallback.png');
    report.fallback = {
      notice: snap.fallback,
      status: snap.status,
      bodies: snap.bodies.length,
      console: consoleLines,
      pageErrors,
      networkFailed: failed,
      metrics: snap.metrics,
    };
    await page.close();
  }

  const proto = [
    { name: 'ready', url: '/?shot=8&seed=3&autoplay=march&debug=1' },
    { name: 'impact', url: '/?shot=14&seed=3&demo=reveal&debug=1' },
    { name: 'after', url: '/?shot=235&seed=18&autoplay=march&debug=1' },
    { name: 'hud', url: '/?shot=8&seed=3&autoplay=march' },
  ];
  for (const vp of [{ w: 1440, h: 900, tag: '1440' }, { w: 390, h: 844, tag: '390' }]) {
    for (const step of proto) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
      const consoleLines: LogLine[] = [];
      const pageErrors: string[] = [];
      const failed: NetFail[] = [];
      attach(page, consoleLines, pageErrors);
      page.on('requestfailed', (req: Request) => {
        failed.push({ url: req.url(), failure: req.failure()?.errorText ?? null, method: req.method() });
      });
      page.on('response', res => {
        if (res.status() >= 400) failed.push({ url: res.url(), failure: String(res.status()), method: res.request().method() });
      });
      if (step.name === 'hud') {
        // Banque hors dépôt : le 404 sfx pollue la console. On sert un manifeste vide pour la preuve HUD.
        await page.route('**/web/sfx/**', async route => {
          const url = route.request().url();
          if (url.includes('manifest.json')) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{"samples":[]}' });
          } else {
            await route.fulfill({ status: 204, body: '' });
          }
        });
      }
      await page.goto(`${ORIGIN}${step.url}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.title === 'READY', null, { timeout: 60_000 });
      await page.waitForTimeout(300);
      await shot(page, `proto-${vp.tag}-${step.name}.png`);
      const sc = await page.evaluate(() => (window as Window & { __SC?: () => unknown }).__SC?.() ?? null);
      report[`proto-${vp.tag}-${step.name}`] = { url: step.url, viewport: vp, title: await page.title(), sc, consoleErrors: consoleLines.filter(l => l.type === 'error'), pageErrors, networkFailed: failed };
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}

writeFileSync(join(OUT, 'sas.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'console.json'), JSON.stringify({
  sas1440: {
    consoleErrors: (report['sas-1440'] as { consoleErrors: unknown }).consoleErrors,
    pageErrors: (report['sas-1440'] as { pageErrors: unknown }).pageErrors,
  },
  sas390: {
    consoleErrors: (report['sas-390'] as { consoleErrors: unknown }).consoleErrors,
    pageErrors: (report['sas-390'] as { pageErrors: unknown }).pageErrors,
  },
  proto: Object.fromEntries(Object.entries(report).filter(([k]) => k.startsWith('proto-')).map(([k, v]) => [k, {
    consoleErrors: (v as { consoleErrors: unknown }).consoleErrors,
    pageErrors: (v as { pageErrors: unknown }).pageErrors,
  }])),
}, null, 2));
writeFileSync(join(OUT, 'network-fallback.json'), JSON.stringify(report.fallback, null, 2));

const s1440 = report['sas-1440'] as {
  moved: number; afterAboveGround: boolean; resetAboveGround: boolean;
  before: { bodies: BodyState[] }; after: { bodies: BodyState[] }; reset: { bodies: BodyState[] };
  pageErrors: string[]; consoleErrors: unknown[];
};
if (s1440.moved !== 7) throw new Error(`attendu 7/7 déplacés, obtenu ${s1440.moved}`);
if (!s1440.afterAboveGround || !s1440.resetAboveGround) throw new Error('un corps est sous le sol');
if (s1440.pageErrors.length) throw new Error(`erreurs page: ${s1440.pageErrors.join('; ')}`);
if (!((report.fallback as { notice: boolean }).notice)) throw new Error('bandeau repli procédural absent');
for (const tag of ['1440', '390']) {
  const hud = report[`proto-${tag}-hud`] as { consoleErrors: unknown[]; pageErrors: string[] };
  if (hud.pageErrors.length) throw new Error(`HUD ${tag} page: ${hud.pageErrors.join('; ')}`);
  if ((hud.consoleErrors as unknown[]).length) throw new Error(`HUD ${tag} console: ${JSON.stringify(hud.consoleErrors)}`);
}
console.log('sas-proof ok', OUT);
