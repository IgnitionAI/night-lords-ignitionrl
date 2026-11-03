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
node dist/server.mjs     # http://127.0.0.1:18190/  (?debug=1  ?autoplay=march|turret|brawler|backpedal|wallHugger  ?seed=  ?shot=<ticks>  ?fog=linear  ?grid=1  ?pivot=0|0.3|0.5  ?tell=0  ?cam=couloir  ?impact=0  ?demo=reveal)
```

`policies/` contient la politique b3 (prête pour `node dist/server.mjs`) : `current.json` est `runs/b3@2000` (2 000 mises à jour, seed 3). `src/guard.ts` met l'entraînement en pause si la machine est chargée (load, inodes, autres tests) ; `GUARD_FS` choisit le disque surveillé (par défaut `.`).

## Rejouer une mesure

Tout l'aléatoire passe par `--seed` : initialisation des poids (BC et PPO, graine dérivée par couche), brassage des mini-lots, tirages d'actions, seeds des mondes et des tactiques `randomized()`, et seeds d'éval (900 000+). Deux exécutions avec la même graine et les mêmes arguments produisent **les mêmes poids et les mêmes métriques** ; seules les durées (`seconds`, `updateSeconds`, `wallSeconds`) relèvent de l'horloge murale.

Cette reproductibilité est **prouvée par `npm test` à 20 mises à jour** : deux constructions identiques, deux entraînements courts, mêmes poids et même perte. Elle **n'est pas encore prouvée à pleine échelle** : les deux runs complets de 200 et 2 000 mises à jour ont été interrompus par le garde de charge machine (`src/guard.ts`), donc la vérification complète est **en attente**. La commande pour la faire, quand la machine est au repos, est juste en dessous (les deux `train.mjs` puis le `diff` des `metrics.jsonl`). « Reproductible à 20 mises à jour » et « reproductible à 2 000 » ne sont pas la même affirmation, et seul le premier est acquis aujourd'hui.

```sh
npm test                                                              # reproductibilité des poids (≈ 4 s)
node build.mjs
node dist/train.mjs --updates 200 --envs 32 --out runs/replay-a --seed 3
node dist/train.mjs --updates 200 --envs 32 --out runs/replay-b --seed 3
node dist/eval.mjs --pack runs/replay-a/actor.json --n 200            # seeds 900000..900199
```

```sh
# même graine ⇒ mêmes couches ; même graine ⇒ même metrics.jsonl (aux durées près)
node -e 'const a=require("./runs/replay-a/actor.json"),b=require("./runs/replay-b/actor.json");console.log(JSON.stringify(a.layers)===JSON.stringify(b.layers)?"mêmes poids":"poids différents")'
diff <(sed -E 's/"([a-zA-Z]*[sS]econds)":[0-9.]+/"\1":0/g' runs/replay-a/metrics.jsonl) <(sed -E 's/"([a-zA-Z]*[sS]econds)":[0-9.]+/"\1":0/g' runs/replay-b/metrics.jsonl) && echo "mêmes métriques"
```

Une graine différente (`--seed 4`) doit changer les deux. L'éval est elle aussi reproductible : relancer la même commande `eval.mjs` donne le même rapport, aux `wallSeconds` près.

## Fichiers

- `src/sim.ts` : simulation à pas fixe (100 ms), observations, récompenses
- `src/tactics.ts` : Terminators scriptés et fantôme ; `src/recorder.ts`, `src/bc.ts`, `src/tobs.ts` : enregistrement et clonage de comportement
- `src/ppo.ts`, `src/train.ts` : PPO multi-agents ; `src/eval.ts`, `src/evallib.ts` : évaluation
- `src/server.ts` : serveur local et ré-entraînement entre manches ; `src/experiment-c.ts` : expérience C
- `web/` : rendu Three.js et vue de contrôle (touche V)
- Caméra à l'épaule (défaut) : 3,55 m derrière le Terminator, 1,15 m sur son épaule droite, 2,5 m du sol,
  fov 62 (74 en portrait), et un point de visée 5 m devant lui. On est dans l'armure.
- Caméra de couloir (`?cam=couloir`) : 8,2 m / 3,4 m de haut / fov 58 (68 en portrait). Elle se cale derrière
  son dos et remonte à 4,9 m si son œil tombe dans l'emprise d'un pilier.
- Poids : respiration de 5,2 s (±28 mm), appui du pas (un à-coup tous les 1,55 m, 25 mm = 0,40°), recul du
  bolter (76 mm arrière, 1,09° de nez, ressort amorti) et un flash de bouche de 75 ms qui éclaire les piliers
  et les silhouettes. Le halo du gantelet pulse en bleu. `?impact=0` coupe le tout (et le flash), pour mesurer
  ce que le poids coûte : course verticale 83 mm contre 56 mm, rotation identique.
- Le flash peint la salle (+11,6/255 sur le sol, +12,5 sur le pilier droit), pas la proie (+1,8) : la lumière
  est à 1,9 m devant le Terminator, donc tout ce qui est assez près pour l'encaisser est derrière sa propre
  silhouette. Le Night Lord reste la forme noire **contre** la salle allumée — c'est mesuré, pas choisi
  (voir `web/models/MANIFESTE.md`).
- Les ressorts sont évalués en forme fermée au moment du rendu, pas intégrés au pas de 100 ms : sinon le poids
  arrivait par saccades de 10 Hz. Une capture `?shot=` tombe donc exactement sur le tick, à 60 fps tout est lisse.
- Flou de rotation : 5 prises dans la passe plein écran quand le lacet dépasse le seuil, rien au repos.
- Pivot (P3) : la caméra se décale de 30 % au plus vers la menace la plus proche quand celle-ci est derrière
  le dos depuis plus d'une seconde. `?pivot=` règle le plafond, `?pivot=0` coupe. Le joueur garde la main,
  rien n'est forcé. `?fog=linear` revient au brouillard 8→38 m, `?grid=1` réaffiche la grille du grey-box.
- Télégraphe : un Night Lord dont la griffe est prête (`cd = 0`) et qui est à moins de 6 m voit son liseré de
  silhouette passer du bleu froid au rouge ardent. `?tell=0` le coupe. Il ne dit pas « il est dangereux » mais
  « il peut frapper maintenant » ; la simulation ne donne aucun temps de préparation, la frappe tombe dans le
  tick où elle est choisie. 2 ticks d'armement sont décidés côté simulation (Khayon) : quand ils arriveront,
  le télégraphe se branchera sur l'armement et non sur `cd === 0`, et le build jouable ne sera plus comparable
  aux mesures b3 (voir `web/models/MANIFESTE.md`).
- Mode démo (`?demo=reveal`) : **mise en scène**, pas une manche jouée. Il place les cinq acteurs et leur donne
  un script d'actions — quatre ticks de marche, une rafale au tick 6 — pour obtenir un plan impossible en jeu :
  un Night Lord à 3,2 m dans la gueule du bolter au moment où la rafale part. Le pas de simulation reste le
  vrai (`step()` calcule les dégâts, les événements, le bruit) et le HUD affiche « MISE EN SCÈNE » dans
  l'image. Aucune capture de ce mode ne doit être présentée comme du jeu joué (voir `web/models/MANIFESTE.md`).
- `shots/` : captures 16:9 et 9:16 (prototype du jalon 1)
- `mesures/`, `jalon1/mesures/`, `runs/*metrics.jsonl` : mesures brutes citées dans les rapports

## Provenance

Code de départ : [IgnitionAI/ignition@52974ec](https://github.com/IgnitionAI/ignition/tree/52974ec) (`packages/demo-cage-duel/src`, `packages/backend-tfjs/src`, `packages/core/src`). Il n'est pas recopié ici ; `src/ppo.ts` est une adaptation du PPO de `backend-tfjs` (déclaré MIT).

## Licence

MIT, © 2026 IgnitionAI. Voir `LICENSE`.
