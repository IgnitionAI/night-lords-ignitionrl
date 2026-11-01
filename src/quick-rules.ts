// Mesure rapide (jalon 1b → b4) : durée et victoires d'une politique figée sous des variantes de règles. Scratch, non entraînant.
import { readFileSync } from 'node:fs';
import { T_CFG, NL_CFG } from './sim';
import { POOL, UNSEEN } from './tactics';
import { runGames } from './evallib';
const pack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const variant = JSON.parse(process.argv[3] ?? '{}'); const n = Number(process.argv[4] ?? 50);
Object.assign(T_CFG, variant.T ?? {}); Object.assign(NL_CFG, variant.NL ?? {});
const out: Record<string, unknown> = {};
for (const k of ['march', 'turret', 'brawler', 'backpedal', 'kiter', 'wallHugger', 'elite']) {
  const mk = POOL[k] ?? UNSEEN[k]; const s = runGames(pack, () => mk(), n, 900000);
  out[k] = `${s.packWins}/${n} med=${s.medianSeconds}s 30-90=${(s.share30to90 * 100).toFixed(0)}%`;
}
console.log(JSON.stringify(variant), JSON.stringify(out));
