# b6p — acteur #66, lisibilité par la caméra

Politique **b6p** : `runs/b6@1950` restauré depuis le commit de #66 (`4d26a62`) dans `policies/candidates/b6p/`. SHA-256 acteur `05d4603ee7aec5758da481c052a6f38026e78aea97751a132b7cf510591e19e5`. **Défaut inchangé** : `current.json` = b5. Jouable : `?policy=b6p`. `src/sim.ts`, `NL_CFG.speed` (6), `T_CFG.fwd` (2.5) inchangés. SHA b3 / b4 / b5 / b6-vis2 inchangés.

La lisibilité n’est plus un shaping de politique. Caméra de combat par défaut (Terminator + NL vivant le plus menaçant ou le plus proche). `?cam=couloir` conserve P1.

## Éval n=200, seeds 900000–900199, `clawWindup: false`

Rejouée : `mesures/nn/b6p/eval.json`. Chiffres identiques à #66 (`eval-pr66.json`) : wallHugger 91,5 %, kiter 86,5 %, pool 92,7 %, médianes 37,3–43,8 s.

## Lisibilité SwiftShader (5 seeds kiter, `?probe=read`)

| Caméra | Frames ≥1 NL à l’écran | Kills victime à l’écran |
|---|---|---|
| couloir | 0,570 | 1,00 |
| combat | **0,999** | **1,00** |

Cibles combat : ≥ 0,85 et 1,0. Détail : `mesures/nn/b6p/readability.json`.

## Luma #62 (pleine image, canvas)

Écart max |Δ| = 0,86 / 255, |Δ%| ≤ 5,8 % mais |Δ| ≤ 1,5 donc dans la tolérance. `docs/captures/camera-combat/luma.json`.
