// Captures Playwright (Chromium + SwiftShader) du Terminator : gros plan + vue jeu HUD.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = process.env.PREFIX ?? 'avant';
const OUT = join(ROOT, 'docs/captures/terminator');
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

const SHOTS = [
  { name: 'gros-plan', qs: 'shot=115&seed=3&autoplay=march' },
  { name: 'jeu-hud', qs: 'shot=40&seed=3&autoplay=march&cam=couloir' },
  { name: 'marche-trois-quarts', qs: 'shot=80&seed=3&autoplay=march&cam=troisquarts' },
];

const ownServer = process.env.NO_SERVER !== '1';
const server = ownServer ? spawn('bun', ['dist/server.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
}) : null;
if (server) await waitListen(server, 'proto sur', 15000);

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
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
context.setDefaultTimeout(180000);

const log: {
  prefix: string;
  shots: unknown[];
} = { prefix: PREFIX, shots: [] };

try {
  for (const shot of SHOTS) {
    const page = await context.newPage();
    const consoleLines: { type: string; text: string }[] = [];
    const pageErrors: string[] = [];
    const net: { status: number; url: string }[] = [];
    page.on('console', (m) => consoleLines.push({ type: m.type(), text: m.text() }));
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('response', (r) => net.push({ status: r.status(), url: r.url() }));
    const url = `${BASE}/?${shot.qs}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
    const png = join(OUT, `${PREFIX}-${shot.name}.png`);
    await page.screenshot({ path: png, type: 'png' });
    const pose = await page.evaluate(() => (window as unknown as { __termPose?: unknown }).__termPose ?? null);
    const webgl = await page.evaluate(() => {
      const c = document.getElementById('c') as HTMLCanvasElement | null;
      const gl = c?.getContext('webgl2') || c?.getContext('webgl');
      if (!gl) return { ok: false };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        ok: true,
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    });
    log.shots.push({
      name: shot.name,
      url,
      png,
      pose,
      webgl,
      console: consoleLines,
      pageErrors,
      networkFailed: net.filter((r) => r.status >= 400),
      networkOk: net.filter((r) => r.status < 400).length,
    });
    await page.close();
  }
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
}

writeFileSync(join(OUT, `${PREFIX}-console-network.json`), JSON.stringify(log, null, 2));
writeFileSync(join(OUT, `${PREFIX}-pose.json`), JSON.stringify(log.shots.map((s) => {
  const shot = s as { name: string; pose?: unknown };
  return { name: shot.name, pose: shot.pose };
}), null, 2));
const known404 = (u: string) => u.includes('/web/sfx/nightlords/manifest.json');
for (const s of log.shots as Array<{ name: string; pageErrors: string[]; console: { type: string; text: string }[]; networkFailed: { status: number; url: string }[]; pose?: { tpose?: boolean; clip?: string | null; footDx?: number } }>) {
  const hardConsole = s.console.filter((l) => l.type === 'error' && !l.text.includes('404') && !l.text.includes("Couldn't load texture"));
  const hardNet = s.networkFailed.filter((r) => !known404(r.url));
  if (s.pageErrors.length || hardConsole.length || hardNet.length) {
    throw new Error(`${s.name}: ${JSON.stringify({ pageErrors: s.pageErrors, hardConsole, hardNet })}`);
  }
  if (s.pose?.tpose) {
    throw new Error(`${s.name}: T-pose (clip=${s.pose.clip} footDx=${s.pose.footDx})`);
  }
}
console.log(JSON.stringify({ prefix: PREFIX, shots: (log.shots as { name: string }[]).map((s) => s.name) }, null, 2));
