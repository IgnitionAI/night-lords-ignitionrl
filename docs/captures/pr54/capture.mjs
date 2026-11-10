// Harnais de preuve visuelle PR #54 : Playwright Chromium + SwiftShader, après bun run build.
// Usage : PORT=18190 bun docs/captures/pr54/capture.mjs
// Sorties : PNG + console.json + network-fail.json ; trace Playwright si un shot échoue.
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 18190);
const PREFIX = process.env.PREFIX ?? 'apres';
const BASE = `http://127.0.0.1:${PORT}`;
const TRACE = join(OUT, `trace-${PREFIX}.zip`);

const SHOTS = [
  { name: 'ensemble-couloir-t40-s3', qs: 'shot=40&seed=3&autoplay=march&cam=couloir' },
  { name: 'nl-couloir-t115-s3', qs: 'shot=115&seed=3&autoplay=march&cam=couloir' },
  { name: 'terminator-epaule-t115-s3', qs: 'shot=115&seed=3&autoplay=march' },
  { name: 'reveal-epaule-t14-s18', qs: 'shot=14&demo=reveal&seed=18' },
  { name: 'meute-t235-s18', qs: 'shot=235&seed=18&autoplay=march' },
  { name: 'ensemble-couloir-t14-s18', qs: 'shot=14&demo=reveal&seed=18&cam=couloir' },
];

mkdirSync(OUT, { recursive: true });

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

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

const log = { prefix: PREFIX, base: BASE, shots: [] };
let failed = false;

try {
  for (const shot of SHOTS) {
    const page = await context.newPage();
    const consoleMsgs = [];
    const errors = [];
    const netFail = [];
    page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('requestfailed', (r) => netFail.push({ url: r.url(), err: r.failure()?.errorText ?? 'fail' }));
    page.on('response', (r) => { if (r.status() >= 400) netFail.push({ url: r.url(), err: `HTTP ${r.status()}` }); });
    const url = `${BASE}/?${shot.qs}`;
    const rec = { name: shot.name, url, ok: false, title: '', console: consoleMsgs, errors, netFail };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction(() => document.title === 'READY', null, { timeout: 180_000 });
      rec.title = await page.title();
      rec.webgl = await page.evaluate(() => {
        const c = document.getElementById('c');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return { ok: false };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          ok: true,
          vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        };
      });
      const png = join(OUT, `${PREFIX}-${shot.name}.png`);
      await page.screenshot({ path: png, type: 'png' });
      rec.ok = true;
      rec.png = png;
    } catch (e) {
      failed = true;
      rec.error = String(e);
    }
    rec.consoleErrors = consoleMsgs.filter((m) => m.type === 'error');
    rec.consoleWarns = consoleMsgs.filter((m) => m.type === 'warning');
    log.shots.push(rec);
    await page.close();
  }
} finally {
  if (failed) await context.tracing.stop({ path: TRACE });
  else await context.tracing.stop();
  await browser.close();
  writeFileSync(join(OUT, `log-${PREFIX}.json`), JSON.stringify(log, null, 2));
}

const errCount = log.shots.reduce((n, s) => n + s.consoleErrors.length + s.errors.length, 0);
const netCount = log.shots.reduce((n, s) => n + s.netFail.length, 0);
console.log(JSON.stringify({ prefix: PREFIX, failed, errCount, netCount, shots: log.shots.map((s) => ({ name: s.name, ok: s.ok, errors: s.errors.length, consoleErrors: s.consoleErrors.length, netFail: s.netFail.length, webgl: s.webgl })) }, null, 2));
if (failed) process.exit(1);
