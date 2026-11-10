// E2E léger Le Sas : Chromium headless + SwiftShader, sur le build.
// SAS_E2E=1 bun test test/sas-e2e.test.ts  (exige `bun run build` et `bunx playwright install chromium`)
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { allAboveGround, launchSwiftshader, movedCount, sasSnapshot, waitSasReady } from '../scripts/sas-e2e-lib';

const ROOT = join(import.meta.dir, '..');
const enabled = process.env.SAS_E2E === '1';
const PORT = Number(process.env.SAS_E2E_PORT ?? 18192);
const ORIGIN = `http://127.0.0.1:${PORT}`;

if (!enabled) {
  test.skip('Le Sas e2e Playwright (SAS_E2E=1)', () => {});
} else {
describe('Le Sas — Playwright SwiftShader', () => {
  let server: Subprocess | undefined;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    if (!existsSync(join(ROOT, 'dist/server.mjs')) || !existsSync(join(ROOT, 'web/dist/sas.html'))) {
      throw new Error('build manquant : bun run build');
    }
    server = spawn({
      cmd: ['bun', 'dist/server.mjs'],
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('serveur muet')), 15_000);
      const onData = async (stream: ReadableStream<Uint8Array> | number | undefined) => {
        if (!stream || typeof stream === 'number') return;
        const reader = stream.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (dec.decode(value).includes('proto sur')) { clearTimeout(timer); resolve(); return; }
        }
      };
      void onData(server!.stdout).catch(reject);
    });
    browser = await launchSwiftshader();
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    server?.kill();
  }, 15_000);

  test('7/7 caisses se déplacent, restent au-dessus du sol, reset, 0 erreur console', async () => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(`${ORIGIN}/sas?debug=1`, { waitUntil: 'domcontentloaded' });
    await waitSasReady(page);
    const before = await sasSnapshot(page);
    expect(before.bodies).toHaveLength(7);
    await page.getByRole('button', { name: /Rafale/ }).click();
    await page.waitForTimeout(2500);
    const after = await sasSnapshot(page);
    const { moved } = movedCount(before.bodies, after.bodies);
    expect(moved).toBe(7);
    expect(allAboveGround(after.bodies)).toBe(true);
    expect(Number(after.metrics.collisions)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Recommencer' }).click();
    await page.waitForTimeout(400);
    const reset = await sasSnapshot(page);
    expect(reset.bodies).toHaveLength(7);
    expect(allAboveGround(reset.bodies)).toBe(true);
    expect(errors).toEqual([]);
  }, 60_000);
});
}
