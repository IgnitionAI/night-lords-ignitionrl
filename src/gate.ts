// Garde-fou du mécanisme C : une politique ré-entraînée contre le fantôme n'est déployée que si elle bat mieux
// le fantôme (seeds 850000+) sans perdre plus de 3 points en moyenne sur les tactiques fixes du pool.
// Le joueur réel n'est jamais consulté : seules ses manches enregistrées (via le fantôme) servent.
import { POOL, bcGhost } from './tactics';
import { runGames } from './evallib';
import type { ActorJSON } from './policy';

const fixedPool = Object.keys(POOL).filter(k => k !== 'randomized');
const poolMean = (a: ActorJSON, n: number) => fixedPool.reduce((s, k) => s + runGames(a, () => POOL[k](), n, 850000).packWinRate, 0) / fixedPool.length;
export function gateDecision(cur: ActorJSON, cand: ActorJSON, ghost: ActorJSON, nGhost = 100, nPool = 50) {
  const gh = (a: ActorJSON) => runGames(a, x => bcGhost(ghost, x), nGhost, 850000).packWinRate;
  const g = { ghostCur: gh(cur), ghostCand: gh(cand), poolCur: +poolMean(cur, nPool).toFixed(3), poolCand: +poolMean(cand, nPool).toFixed(3), accepted: false };
  g.accepted = g.ghostCand >= g.ghostCur && g.poolCand >= g.poolCur - 0.03;
  return g;
}
