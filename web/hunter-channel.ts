// Canal « cogitator » : l'état des chasseurs part de la simulation vers le rendu d'ambiance, jamais vers le
// DOM du joueur. Fulgrim écoute `window` sur `cogitator:hunters` ; le `detail` est un `HunterState[]` frais
// (voir `src/hunter-state.ts`) produit pour le tick courant. Aucun élément DOM, aucun texte, aucun log.
//
// Le canal est muet par défaut : il ne s'ouvre que si l'URL porte `?control=1`. `?debug=1` pilote la vue de
// contrôle historique (touche V) et n'ouvre **pas** ce canal — les deux flags sont indépendants.
import type { HunterState } from '../src/hunter-state';

/** Nom de l'événement consommé par l'ambiance. `detail: HunterState[]`, un tableau neuf par publication. */
export const HUNTER_EVENT = 'cogitator:hunters';

/** Vrai uniquement pour `control=1` : ni `debug=1`, ni `control=0`, ni l'absence de paramètre. */
export function isControlViewEnabled(search: string): boolean {
  return new URLSearchParams(search).get('control') === '1';
}

/** Cible minimale : `window` en navigateur, `globalThis` si un hôte y expose `dispatchEvent`. */
interface Sink { dispatchEvent(ev: unknown): boolean }

function sink(): Sink | null {
  const g = globalThis as unknown as { window?: Partial<Sink>; dispatchEvent?: Sink['dispatchEvent'] };
  const win = g.window;
  if (win && typeof win.dispatchEvent === 'function') return win as Sink;
  if (typeof g.dispatchEvent === 'function') return globalThis as unknown as Sink;
  return null;
}

/** `?control=1` de la page courante ; chaîne vide hors navigateur (tests Node, worker). */
function currentSearch(): string {
  const g = globalThis as unknown as {
    window?: { location?: { search?: string } };
    location?: { search?: string };
  };
  const fromWindow = g.window?.location?.search;
  if (typeof fromWindow === 'string') return fromWindow;
  return g.location?.search ?? '';
}

/**
 * Publie l'état des chasseurs sur `window`, **une fois par tick au plus** : l'appelant (la boucle de
 * `web/main.ts`) appelle cette fonction une seule fois par pas de simulation, avec le drapeau déjà vérifié.
 * La garde est aussi refaite ici : sans `?control=1`, aucun événement n'est émis et rien ne fuit vers le joueur.
 */
export function publishHunterState(states: HunterState[], search: string = currentSearch()): void {
  if (!isControlViewEnabled(search)) return;
  const target = sink();
  if (!target) return; // pas d'hôte à événements : canal muet, jamais d'erreur
  const ev = typeof CustomEvent === 'function'
    ? new CustomEvent(HUNTER_EVENT, { detail: states })
    : { type: HUNTER_EVENT, detail: states };
  target.dispatchEvent(ev);
}
