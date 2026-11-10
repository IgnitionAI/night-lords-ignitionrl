import { chromium, type Browser, type Page } from 'playwright';

export const SWIFTSHADER_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--no-sandbox',
  '--disable-dev-shm-usage',
];

export type BodyState = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
};

export function dist3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export async function launchSwiftshader(): Promise<Browser> {
  return chromium.launch({ headless: true, args: SWIFTSHADER_ARGS });
}

export async function waitSasReady(page: Page, timeout = 60_000) {
  await page.waitForFunction(() => Boolean((window as Window & { __SAS?: { ready?: boolean } }).__SAS?.ready), null, { timeout });
}

export async function sasSnapshot(page: Page) {
  return page.evaluate(() => {
    const sas = (window as Window & {
      __SAS?: {
        ready: boolean;
        shots: number;
        bodies: () => BodyState[];
        metrics: () => Record<string, unknown>;
      };
    }).__SAS;
    if (!sas) throw new Error('window.__SAS absent');
    return {
      ready: sas.ready,
      shots: sas.shots,
      bodies: sas.bodies(),
      metrics: sas.metrics(),
      fallback: Boolean(document.querySelector('.notice')),
      status: document.querySelector('.status')?.textContent ?? '',
    };
  });
}

export function movedCount(before: BodyState[], after: BodyState[], minMeters = 0.5) {
  const n = Math.min(before.length, after.length);
  let moved = 0;
  const distances: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = dist3(before[i].position, after[i].position);
    distances.push(d);
    if (d > minMeters) moved += 1;
  }
  return { moved, distances, n };
}

export function allAboveGround(bodies: BodyState[], minY = 0) {
  return bodies.every(b => b.position.y > minY);
}
