# Night Lords sur IgnitionRL — prototype « La Meute »

Un Terminator surpuissant, piloté par un joueur, contre une meute de 4 Night Lords entraînés par apprentissage par renforcement (PPO multi-agents). Chaque Night Lord, seul, meurt en un coup : la meute ne gagne qu'en se coordonnant (appât, flanc, finition), à partir d'observations limitées (cône de vision, bruit, vox entre frères). Pas de triche : la meute et le Terminator suivent les mêmes règles de simulation.

Prototype « gris » (cubes, pas d'habillage), construit à partir du framework RL navigateur [IgnitionAI/ignition](https://github.com/IgnitionAI/ignition) (IgnitionRL).

> **Statut : prototype de recherche.** Tous les chiffres ci-dessous sont des **mesures de prototype** sur une seule machine (8 CPU, tfjs-node sur CPU). Le run b3 repose sur **une seule graine** (seed 3), sans barre d'erreur entre runs. L'expérience C utilise un **joueur synthétique** (une tactique scriptée), pas un humain. Les règles (armure, portées, vitesses) sont des valeurs de prototype, sans réglage ni référence.

*Projet de fan non officiel. Warhammer 40,000 et Night Lords sont des marques et propriétés de Games Workshop. Ce dépôt ne contient aucun asset de Games Workshop.*

## English summary

A grey-box prototype where one overpowered, player-controlled Terminator faces a pack of four Night Lords trained with multi-agent PPO (TensorFlow.js, headless Node). The pack only sees what its rules allow (vision cone, noise, explicit vox relay). The b3 run (2,000 updates, 1,967 s of compute, single seed) beats the training tactics 111–196/200 and unseen tactics 57–127/200; games last a median 17–28 s. Neither goal is met yet (85 % wins everywhere, 30–90 s games). Mechanism C (fine-tuning against a "ghost" cloned from the player between rounds) currently *hurts*: −0.225 win rate versus a no-ghost control, measured on 3 seeds against a synthetic player. All numbers are prototype measurements.

## Résultats mesurés (b3)

Run b3 : 2 000 mises à jour PPO, 32 environnements, seed 3, 1 967 s de calcul. Éval sur 200 parties tenues à part par adversaire (seeds 900000 à 900199), politique figée — `mesures/eval-b3.json`.

| Adversaire | Vu à l'entraînement | Victoires de la meute | Durée médiane | Parties de 30 à 90 s |
|---|---|---|---|---|
| march | oui | 190/200 | 17,3 s | 0,5 % |
| turret | oui | 111/200 | 21,1 s | 20,5 % |
| brawler | oui | 161/200 | 19,2 s | 1,5 % |
| backpedal | oui | 196/200 | 21,0 s | 2,5 % |
| wallHugger | non | 102/200 | 28,1 s | 35,5 % |
| kiter | non | 57/200 | 19,3 s | 4,5 % |
| elite | non | 127/200 | 21,2 s | 6,5 % |

**Objectifs non atteints** : 85 % de victoires contre chaque tactique, et des parties de 30 à 90 s.

**Mécanisme C** (`mesures/experiment-c.json`) : 3 graines × 3 manches d'un joueur synthétique (tactique `elite`, jamais vue), fantôme appris par clonage de comportement, 30 mises à jour de ré-entraînement par manche. Taux de victoire contre le joueur : 0,635 au départ, **0,428 ± 0,078** après ré-entraînement contre le fantôme, **0,653 ± 0,071** pour le contrôle sans fantôme, soit **−0,225 ± 0,095** par rapport au contrôle. La meute bat le fantôme à 0,993 : le fantôme imite mal le joueur.

Détails et historique : `RAPPORT.md` (état du 31/10) et `jalon1/RAPPORT-jalon1.md`. Cadrage initial : `CONCEPT.md`.

## Lancer

Node 24, CPU suffisant.

```sh
npm install              # three, esbuild, tsx, @tensorflow/tfjs-node 4.22 (polyfill util pour Node 24 dans build.mjs)
node build.mjs           # dist/*.mjs (Node) + web/dist/main.js (navigateur)
node dist/train.mjs --updates 800 --envs 32 --out runs/base --seed 1     # PPO multi-agents headless
node dist/eval.mjs --pack runs/base/actor.json --n 200                    # taux de victoire, seeds 900000+
scripts/mesures.sh                                                         # mesures du jalon 1
cp runs/base/actor.json policies/current.json && cp runs/base/full.json policies/current-full.json
node dist/server.mjs     # http://127.0.0.1:18190/  (?debug=1  ?autoplay=march|turret|brawler|backpedal|wallHugger  ?seed=  ?shot=<ticks>  ?fog=linear  ?grid=1  ?pivot=0|0.3|0.5  ?tell=0)
```

`policies/` contient la politique b3 (prête pour `node dist/server.mjs`). `src/guard.ts` met l'entraînement en pause si la machine est chargée (load, inodes, autres tests) ; `GUARD_FS` choisit le disque surveillé (par défaut `.`).

## Fichiers

- `src/sim.ts` : simulation à pas fixe (100 ms), observations, récompenses
- `src/tactics.ts` : Terminators scriptés et fantôme ; `src/recorder.ts`, `src/bc.ts`, `src/tobs.ts` : enregistrement et clonage de comportement
- `src/ppo.ts`, `src/train.ts` : PPO multi-agents ; `src/eval.ts`, `src/evallib.ts` : évaluation
- `src/server.ts` : serveur local et ré-entraînement entre manches ; `src/experiment-c.ts` : expérience C
- `web/` : rendu Three.js et vue de contrôle (touche V)
- Caméra : couloir derrière le Terminator, 8,2 m / 3,4 m de haut / fov 58 (68 en portrait). Elle se cale
  derrière son dos et remonte à 4,9 m si son œil tombe dans l'emprise d'un pilier.
- Pivot (P3) : la caméra se décale de 30 % au plus vers la menace la plus proche quand celle-ci est derrière
  le dos depuis plus d'une seconde. `?pivot=` règle le plafond, `?pivot=0` coupe. Le joueur garde la main,
  rien n'est forcé. `?fog=linear` revient au brouillard 8→38 m, `?grid=1` réaffiche la grille du grey-box.
- Télégraphe : un Night Lord dont la griffe est prête (`cd = 0`) et qui est à moins de 6 m voit son liseré de
  silhouette passer du bleu froid au rouge ardent. `?tell=0` le coupe. Il ne dit pas « il est dangereux » mais
  « il peut frapper maintenant » ; la simulation ne donne aucun temps de préparation, la frappe tombe dans le
  tick où elle est choisie.
- `shots/` : captures 16:9 et 9:16 (prototype du jalon 1)
- `mesures/`, `jalon1/mesures/`, `runs/*metrics.jsonl` : mesures brutes citées dans les rapports

## Provenance

Code de départ : [IgnitionAI/ignition@52974ec](https://github.com/IgnitionAI/ignition/tree/52974ec) (`packages/demo-cage-duel/src`, `packages/backend-tfjs/src`, `packages/core/src`). Il n'est pas recopié ici ; `src/ppo.ts` est une adaptation du PPO de `backend-tfjs` (déclaré MIT).

## Licence

MIT, © 2026 IgnitionAI. Voir `LICENSE`.
