// Lisibilité SwiftShader : part des frames avec ≥1 NL à l'écran, part des kills visibles.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'mesures/nn/b6p');
const PORT = Number(process.env.PORT ?? 18196);
const SEEDS = [900000, 900001, 900002, 900003, 900004];
const CAMS = (process.env.CAMS ?? 'couloir,combat').split(',') as ('couloir' | 'combat')[];
const OPP = process.env.OPP ?? 'kiter';

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

const swiftArgs = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
];

type Report = {
  cam: string; seed: number; ticks: number; winner: string; reason: string;
  frames: number; frameShare: number; kills: number; killShare: number;
  termOnScreen: number; termScreenHMedian: number; termLosShare: number;
};

async function main() {
  const server = spawn('bun', ['dist/server.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitListen(server, 'proto sur', 20000);
    const browser = await chromium.launch({ headless: true, args: swiftArgs });
    const rows: Report[] = [];
    for (const cam of CAMS) {
      for (const seed of SEEDS) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const url = `http://127.0.0.1:${PORT}/?policy=b6p&autoplay=${OPP}&seed=${seed}&cam=${cam}&probe=read&tex=256&env=0`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
        const t0 = Date.now();
        while (Date.now() - t0 < 180000) {
          const title = await page.title();
          if (title === 'READY') break;
          await page.waitForTimeout(200);
        }
        if (await page.title() !== 'READY') throw new Error(`probe timeout ${cam} ${seed}`);
        const rep = await page.evaluate(() => (window as unknown as { __READ_REPORT?: Report & { killMiss?: unknown } }).__READ_REPORT);
        if (!rep) throw new Error(`pas de __READ_REPORT ${cam} ${seed}`);
        const full = rep as Report & { killMiss?: unknown };
        rows.push({
          cam, seed, ticks: full.ticks, winner: full.winner, reason: full.reason,
          frames: full.frames, frameShare: full.frameShare, kills: full.kills, killShare: full.killShare,
          termOnScreen: full.termOnScreen ?? 0,
          termScreenHMedian: full.termScreenHMedian ?? 0,
          termLosShare: full.termLosShare ?? 0,
        });
        console.log(JSON.stringify(rows[rows.length - 1]));
        await page.close();
      }
    }
    await browser.close();
    const byCam = Object.fromEntries(CAMS.map((cam) => {
      const rs = rows.filter((r) => r.cam === cam);
      const avg = (k: keyof Report) => rs.reduce((s, r) => s + Number(r[k]), 0) / rs.length;
      const heights = rs.map((r) => r.termScreenHMedian).sort((a, b) => a - b);
      const termScreenHMedian = heights[Math.floor(heights.length / 2)] ?? 0;
      return [cam, {
        frameShare: avg('frameShare'), killShare: avg('killShare'),
        termOnScreen: avg('termOnScreen'), termScreenHMedian, termLosShare: avg('termLosShare'),
        seeds: rs,
      }];
    }));
    const out = { opp: OPP, policy: 'b6p', nSeeds: SEEDS.length, seeds: SEEDS, byCam, rows };
    writeFileSync(join(OUT, 'readability.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ byCam: Object.fromEntries(Object.entries(byCam).map(([k, v]) => [k, {
      frameShare: v.frameShare, killShare: v.killShare,
      termOnScreen: v.termOnScreen, termScreenHMedian: v.termScreenHMedian, termLosShare: v.termLosShare,
    }])) }, null, 2));
    const combat = byCam.combat!;
    if (combat.frameShare < 0.85) throw new Error(`combat frameShare ${combat.frameShare} < 0.85`);
    if (combat.killShare < 1) throw new Error(`combat killShare ${combat.killShare} < 1`);
    if (combat.termOnScreen < 0.98) throw new Error(`combat termOnScreen ${combat.termOnScreen} < 0.98`);
  } finally {
    server.kill('SIGTERM');
  }
}

await main();
