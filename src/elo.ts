// Classement ELO déterministe à partir d'un journal de matchs.
//
// Formule (Elo 1978, échelle échiquéenne) :
//   E_home = 1 / (1 + 10^((R_away - R_home) / 400))
//   R' = R + K * (S - E)
//
// Constantes figées :
//   K = 32 (écart type « club », assez mobile sur une petite ligue)
//   SCALE = 400
//   INITIAL = 1500
//
// Score S : victoire = 1, défaite = 0, nul = 0,5.
// Mise à jour **simultanée** : les deux cotes du match sont lues avant toute écriture
// (on n'applique pas A puis B avec la cote déjà bougée). L'ordre entre matchs est
// celui du journal, chronologique.

export const ELO_K = 32;
export const ELO_SCALE = 400;
export const INITIAL_ELO = 1500;

export type MatchWinner = 'home' | 'away' | 'draw';
export interface EloMatch { home: string; away: string; winner: MatchWinner }
export type Ratings = Record<string, number>;

function scoreOf(winner: MatchWinner): number {
  switch (winner) {
    case 'home': return 1;
    case 'away': return 0;
    case 'draw': return 0.5;
    default: {
      const _x: never = winner;
      throw new Error(`winner inconnu: ${_x as string}`);
    }
  }
}

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / ELO_SCALE));
}

/** Met à jour A et B à partir des cotes **pré-match**. `winner` est 'A' | 'B' | 'draw'. */
export function applyMatch(ratings: { A: number; B: number }, winner: 'A' | 'B' | 'draw'): { A: number; B: number } {
  const sA = winner === 'A' ? 1 : winner === 'B' ? 0 : 0.5;
  const eA = expectedScore(ratings.A, ratings.B);
  const eB = 1 - eA;
  return {
    A: ratings.A + ELO_K * (sA - eA),
    B: ratings.B + ELO_K * ((1 - sA) - eB),
  };
}

export function ratingsFromMatches(matches: readonly EloMatch[], ids: readonly string[], initial = INITIAL_ELO): Ratings {
  const r: Ratings = {};
  for (const id of ids) r[id] = initial;
  for (const m of matches) {
    if (!(m.home in r)) r[m.home] = initial;
    if (!(m.away in r)) r[m.away] = initial;
    const sHome = scoreOf(m.winner);
    const eHome = expectedScore(r[m.home], r[m.away]);
    const eAway = 1 - eHome;
    const home0 = r[m.home], away0 = r[m.away];
    r[m.home] = home0 + ELO_K * (sHome - eHome);
    r[m.away] = away0 + ELO_K * ((1 - sHome) - eAway);
  }
  return r;
}
