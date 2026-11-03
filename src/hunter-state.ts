// Canal de rendu : l'état des quatre Night Lords tel que la simulation le connaît déjà, pour l'ambiance
// (sons, lumières réactives, souffle). Ce n'est **pas** une observation d'entraînement : rien ici n'entre dans
// `observe()` / `nlFrame()` (leur sémantique sert à l'entraînement) ni dans `tObserve()` du Terminator, et le
// canal n'est jamais sérialisé vers le client du joueur. Aucun DOM, aucun texte de HUD : la seule sortie est un
// `CustomEvent` local émis par `web/hunter-channel.ts`, et seulement quand `?control=1` est demandé.
//
// Aucune nouvelle logique ici : on **lit** `w.nls` (position, orientation, croyance, dernière action) et
// `NL_CFG` (ouverture et portée des cônes). Recalculer quoi que ce soit ferait diverger ce que Fulgrim entend
// de ce que la simulation a réellement décidé pour ce tick.
import { NL_CFG, ROLES, type World } from './sim';

/** Photographie d'un chasseur à un tick donné. Les booléens recopient tels quels `belief.seen/heard/vox`. */
export interface HunterState {
  role: number;
  name: string;
  alive: boolean;
  x: number;
  y: number;
  facing: number;
  visionHalf: number;
  visionRange: number;
  seesTarget: boolean;
  hearsTarget: boolean;
  voxActive: boolean;
  /** Âge de la croyance, en ticks de simulation (comme `belief.age`), pas en secondes. */
  beliefAge: number;
  lastAction: number;
}

/**
 * État courant des quatre frères, lu sans le modifier. Un appel par tick suffit ; le tableau renvoyé est neuf
 * (aucune référence partagée avec `w.nls`), donc le rendu peut le garder entre deux images sans risque.
 */
export function hunterState(w: World): HunterState[] {
  return w.nls.map(n => ({
    role: n.role,
    name: ROLES[n.role],
    alive: n.alive,
    x: n.x,
    y: n.y,
    facing: n.facing,
    visionHalf: NL_CFG.visionHalf,
    visionRange: NL_CFG.visionRange,
    seesTarget: n.belief.seen,
    hearsTarget: n.belief.heard,
    voxActive: n.belief.vox,
    beliefAge: n.belief.age,
    lastAction: n.lastAction,
  }));
}
