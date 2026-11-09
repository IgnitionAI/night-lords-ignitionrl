# Protocole de mesure — réseaux de neurones (PPO / TF.js)

Protocole auditable pour entraîner et évaluer la meute (4 Night Lords, politique partagée, Terminator scripté) **sans écraser** la référence gelée **b3**.

La langue de travail du dépôt est le français ; ce document est la source de vérité. English: this is the measurement contract for any future PPO run. Do not overwrite `policies/` or `mesures/eval-b3.json`. Smoke only: `node --import tsx scripts/nn-harness.ts`.

## 1. Référence gelée (b3)

| Champ | Valeur | Où |
|---|---|---|
| Run | 2 000 mises à jour PPO, 32 environnements, seed **3**, ~1 967 s CPU | `README.md`, `runs/b3/metrics.jsonl` |
| Politique déployée | `runs/b3@2000` | `policies/current.json` (acteur), `policies/current-full.json` (acteur+critique) |
| Éval | 200 parties / adversaire, seeds **900000..900199**, `clawWindup: false` | `mesures/eval-b3.json` |
| Snap intermédiaire | 700 MàJ, n=50, seeds 900000..900049 | `runs/eval-b3-snap700-n50.json` |

**Interdit** : réécrire ces fichiers, `cp` vers `policies/current.json`, ou `--out mesures/eval-b3.json`. Un nouveau run a un **nouvel identifiant** (`runs/b4/`, `mesures/nn/b4/eval.json`, …).

Le harnais refuse d'écrire sous `policies/`, `runs/b3/`, `runs/base/`, `jalon1/`, et sur les JSON d'éval déjà publiés (liste dans `src/nn-harness.ts` → `FROZEN_ARTIFACTS`).

## 2. Que mesurer

Toujours sous les **règles d'entraînement** : `newWorld(seed, spawn?, { clawWindup: false })` (`src/train.ts`, `src/evallib.ts`). Le build jouable arme les griffes : ce n'est **pas** comparable (encadré du `RAPPORT.md`).

Par adversaire, sur politiques **figées** (pas de gradient pendant l'éval) :

- `packWins` / `packWinRate`
- `medianSeconds`, `meanSeconds`, `p10Seconds`, `p90Seconds`, `share30to90`
- `meanNightLordsKilled`, `reasons` (Terminator abattu / meute anéantie / téléporté)
- `clawArms` (doit rester **0** si `clawWindup: false`)
- coût : `seconds` / `updateSeconds` dans `metrics.jsonl` (horloge, non reproductible)

Adversaires (mêmes noms que b3) :

- vus à l'entraînement : `march`, `turret`, `brawler`, `backpedal`
- jamais vus : `wallHugger`, `kiter`, `elite`

## 3. Comment mesurer

1. **Entraîner** (job long, **hors** de ce harnais smoke) :
   ```sh
   node build.mjs
   node dist/train.mjs --updates 2000 --envs 32 --out runs/NEW_RUN_ID --seed TRAIN_SEED
   ```
   Seeds d'entraînement : **1..899999**. L'éval réserve **900000+**. La garde C utilise **850000+**. Ne pas réutiliser la seed 3 si on veut une barre d'erreur **entre runs** ; la réutiliser seulement pour une **relecture** de b3 (reproductibilité, encore non prouvée à 2 000 MàJ — voir README).
2. **Évaluer** dans un fichier **nouveau** :
   ```sh
   node dist/eval.mjs --pack runs/NEW_RUN_ID/actor.json --n 200 --seedBase 900000 --out mesures/nn/NEW_RUN_ID/eval.json
   ```
   Pas de `--claw-windup` (ou `--claw-windup false`).
3. **Comparer à b3** par lecture, jamais par écrasement :
   ```sh
   node -e 'const a=require("./mesures/eval-b3.json"),b=require("./mesures/nn/NEW_RUN_ID/eval.json");
   for (const k of Object.keys(a.results)) console.log(k, b.results[k].packWinRate - a.results[k].packWinRate)'
   ```

Hyperparamètres de référence (`src/ppo.ts` `DEFAULT_PPO`, `src/train.ts`) : `lr=3e-4`, hidden `[128,128]`, clip 0.2, 4 epochs, minibatch 2048, `entCoef=0.01`, `vfCoef=0.5`, γ=0.99, λ=0.95, `steps` (K)=128, 4 agents, obs 32, 8 actions. Ne pas changer `NL_CFG.speed` ni `T_CFG.fwd` dans ce protocole.

## 4. Smoke (ce dépôt)

Commande courte, **une graine**, quelques parties, timeout humain ~2 min :

```sh
node --import tsx scripts/nn-harness.ts
# équivalent explicite :
node --import tsx scripts/nn-harness.ts --n 3 --opps march --seedBase 910000 --pack policies/current.json --out mesures/nn-scratch/smoke.json
```

- Graines smoke : **910000+** (ne recouvrent pas l'éval publiée).
- `n` plafonné à 8 dans le harnais. Une éval à 200 parties = `eval.mjs`, pas le smoke.
- Sortie **JSON** sur stdout + fichier sous `mesures/nn-scratch/` uniquement.
- `comparableToB3: false` (n et graines ≠ b3). Le smoke vérifie le tuyau, pas une régression scientifique.
- `--updates` / `--train` : **refusés** (pas de job PPO).
- Lecture seule de `policies/current.json`. Aucun poids écrit.

## 5. Critères de réussite / régression (run réel)

Objectifs déjà publiés (non atteints par b3) :

| Critère | Seuil | Lecture |
|---|---|---|
| Victoire meute | ≥ 85 % **chaque** adversaire (y compris unseen) | `packWinRate` |
| Durée | médiane dans **30–90 s**, `share30to90` élevé | `medianSeconds`, `share30to90` |

Régression **par rapport à b3** (à n=200, mêmes seeds 900000..900199, `clawWindup: false`) :

| Signal | Régression | Bruit (ordre de grandeur) |
|---|---|---|
| `packWinRate` | baisse **> 3 points** sur un adversaire, ou baisse moyenne pool **> 3 points** | ~±3 pts à 200 parties autour de 70 % (`mesures/LECTURE-EVAL-ARMEMENT.md`) |
| `medianSeconds` | écart **> 2 s** dans le sens « parties encore plus courtes » si on visait l'allongement | — |
| `clawArms` | ≠ 0 alors qu'on a demandé les règles b3 | bug de protocole, arrêter |

Une politique candidate **n'est pas** copiée dans `policies/` tant que la comparaison n'est pas écrite dans `mesures/nn/<id>/` **et** qu'un humain n'a pas tranché. Le mécanisme C (`src/gate.ts`) a sa propre garde (seeds 850000+, −3 pts pool) : ce n'est pas ce protocole.

## 6. Où écrire les artefacts

| Type | Chemin | Gelé ? |
|---|---|---|
| Politique b3 | `policies/current.json`, `policies/current-full.json` | **oui** |
| Éval b3 | `mesures/eval-b3.json` | **oui** |
| Métriques b3 | `runs/b3/metrics.jsonl` | **oui** |
| Smoke | `mesures/nn-scratch/` (gitignore) | non, jetable |
| Nouveau run | `runs/<id>/actor.json`, `full.json`, `metrics.jsonl` | non, **id nouveau** |
| Nouvelle éval | `mesures/nn/<id>/eval.json` | non, **id nouveau** |
| Comparaison rédigée | `mesures/nn/<id>/LECTURE.md` | non |

`.gitignore` : `mesures/nn-scratch/`, `runs/nn-scratch/`. Un run réel se versionne **volontairement** (comme `runs/b3/metrics.jsonl`).

## 7. Avant un vrai run d'entraînement

- Machine au repos : garde `src/guard.ts` (load, inodes, un seul `train.mjs`).
- `npm test` vert, `node build.mjs` → `build ok`.
- `node --import tsx scripts/measure-stride.ts` inchangé (locomotion hors protocole NN).
- Choisir `NEW_RUN_ID` et `TRAIN_SEED` ≠ chemins gelés.
- Prévoir l'éval 7×200 parties **après** le run, fichier nouveau.
- Ne pas toucher `NL_CFG.speed`, `T_CFG.fwd`, pas de sprint Terminator, pas de nouvel asset Genex.

## 8. Preuve de non-écrasement

Les tests `test/nn-harness.test.ts` : même graine ⇒ mêmes métriques (hors `wallSeconds`) ; `writeHarnessReport` lève sur `mesures/eval-b3.json` et `policies/*` ; empreintes SHA-256 des artefacts gelés inchangées après un smoke.
