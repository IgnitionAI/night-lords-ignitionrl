# b6p — acteur #66, lisibilité par la caméra

Politique **b6p** : `runs/b6@1950` restauré depuis le commit de #66 (`4d26a62`) dans `policies/candidates/b6p/`. SHA-256 acteur `05d4603ee7aec5758da481c052a6f38026e78aea97751a132b7cf510591e19e5`. **Défaut inchangé** : `current.json` = b5. Jouable : `?policy=b6p`. `src/sim.ts`, `NL_CFG.speed` (6), `T_CFG.fwd` (2.5) inchangés. SHA b3 / b4 / b5 / b6-vis2 inchangés.

La lisibilité n’est plus un shaping de politique. Caméra de combat par défaut : ancrée sur le Terminator (marge NDC 0,78, hauteur d’écran ≥ 8 %, raycast 3D vs piliers), NL dans le cadre s’il est à ≤ 30 m. `?cam=couloir` conserve P1. `?speed=1,75` affiche « lecture ×1,75 » dans le HUD.

## Éval n=200, seeds 900000–900199, `clawWindup: false`

Rejouée : `mesures/nn/b6p/eval.json`. Chiffres identiques à #66 (`eval-pr66.json`) : wallHugger 91,5 %, kiter 86,5 %, pool 92,7 %, médianes 37,3–43,8 s.

## Lisibilité SwiftShader (5 seeds kiter, `?probe=read`)

NL « à l’écran » = vivant à ≤ 30 m du T et dans le frustum (pas le brouillard).

| Caméra | NL proches à l’écran | Kills | T à l’écran | T taille médiane | LOS T |
|---|---|---|---|---|---|
| couloir | 0,973 | 1,00 | 1,000 | 0,295 | 0,567 |
| combat | **1,000** | **1,00** | **0,999** | **0,344** | **1,000** |

Cibles combat : NL ≥ 0,85, kills = 1, T à l’écran ≥ 0,98. Détail : `mesures/nn/b6p/readability.json`.

`deathsWithoutTermDamage` (éval n=200) : 0 partout.

## Luma #62 (pleine image, canvas)

Écart max |Δ| = 0,86 / 255, |Δ%| ≤ 5,8 % mais |Δ| ≤ 1,5 donc dans la tolérance. `docs/captures/camera-combat/luma.json`.
