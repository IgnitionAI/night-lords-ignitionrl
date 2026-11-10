```sh
bun install              # three, esbuild, vite, @tensorflow/tfjs-node 4.22 — 139 paquets
bun run build            # vite (navigateur -> web/dist/main.js) + esbuild (Node -> dist/*.mjs)
bun run dev              # serveur de développement Vite, HMR, http://127.0.0.1:18230/web/index.html
bun dist/train.mjs --updates 800 --envs 32 --out runs/base --seed 1      # PPO multi-agents headless
bun dist/eval.mjs --pack runs/base/actor.json --n 200                     # taux de victoire, seeds 900000+
scripts/mesures.sh                                                         # mesures du jalon 1
cp runs/base/actor.json policies/current.json && cp runs/base/full.json policies/current-full.json
bun dist/server.mjs      # http://127.0.0.1:18190/  (?debug=1  ?autoplay=march|turret|brawler|backpedal|wallHugger  ?seed=  ?shot=<ticks>  ?fog=linear  ?grid=1  ?pivot=0|0.3|0.5  ?tell=0  ?cam=couloir  ?impact=0  ?demo=reveal  ?alarme=0  ?tex=1024  ?env=0  ?lights=all  ?props=0  ?policy=b6p)
```# Night Lords sur IgnitionRL — prototype « La Meute »

Un Terminator surpuissant, piloté par un joueur, contre une meute de 4 Night Lords entraînés par apprentissage par renforcement (PPO multi-agents). Chaque Night Lord, seul, meurt en un coup : la meute ne gagne qu'en se coordonnant (appât, flanc, finition), à partir d'observations limitées (cône de vision, bruit, vox entre frères). Pas de triche : la meute et le Terminator suivent les mêmes règles de simulation.

Rendu Three.js (modèles riggés versionnés, capsules en repli), construit à partir du framework RL navigateur [IgnitionAI/ignition](https://github.com/IgnitionAI/ignition) (IgnitionRL).

> **Statut : prototype de recherche.** Tous les chiffres ci-dessous sont des **mesures de prototype** sur une seule machine (8 CPU, tfjs-node sur CPU). Le run b3 repose sur **une seule graine** (seed 3), sans barre d'erreur entre runs. L'expérience C utilise un **joueur synthétique** (une tactique scriptée), pas un humain. Les règles (armure, portées, vitesses) sont des valeurs de prototype, sans réglage ni référence.

*Projet de fan non officiel. Warhammer 40,000 et Night Lords sont des marques et propriétés de Games Workshop. Ce dépôt ne contient aucun asset de Games Workshop.*

## English summary

A prototype where one overpowered, player-controlled Terminator faces a pack of four Night Lords trained with multi-agent PPO (TensorFlow.js, headless Node). The pack only sees what its rules allow (vision cone, noise, explicit vox relay). The b3 run (2,000 updates, 1,967 s of compute, single seed) beats the training tactics 111–196/200 and unseen tactics 57–127/200; games last a median 17–28 s. Neither goal is met yet (85 % wins everywhere, 30–90 s games). Mechanism C (fine-tuning against a "ghost" cloned from the player between rounds) currently *hurts*: −0.225 win rate versus a no-ghost control, measured on 3 seeds against a synthetic player. All numbers are prototype measurements.

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

## La pile

| quoi | outil | sortie |
|---|---|---|
| la page et le rendu (navigateur) | **Vite 7** | `web/dist/index.html` + `web/dist/main.js` |
| la simulation, l'entraînement, le serveur | esbuild → **Bun** | `dist/*.mjs` |
| installation, scripts, tests | **Bun** (`bun install`, `bun run`, `bun test`) | `bun.lock` |

Deux outils, une raison : Vite est fait pour un graphe de modules navigateur (HMR, TypeScript, minification), esbuild pour six bundles Node en ESM avec `@tensorflow/tfjs-node` en externe et un polyfill `util` pour Node 24. Mettre Node dans Vite n'apporterait rien et casserait les bundles ; mettre le navigateur dans esbuild privait du serveur de développement.

Trois contraintes ont guidé la migration, et chacune est vérifiée :

1. **Les URL ne bougent pas.** `main.js` est émis sans hash, et `src/server.ts` sert `/web/dist/index.html` — exactement les chemins d'avant. Tout le harnais de capture (`?shot=N`, `?seed=`) continue de fonctionner sans une ligne de changement.
2. **L'image ne bouge pas.** Même tick, même graine, build Vite contre build esbuild : **0,0 % des blocs au-dessus du seuil de 8/255** (moyenne −0,07/255 à t235 et +0,01/255 à t55). Le serveur de développement contre le build : **0,0 %** aussi, une fois `/policy/*` relayé vers `policies/*` (sans ce relais, la page de dev joue sans politique chargée et l'image change).
3. **Le poids ne bouge pas.** 643 623 octets pour esbuild minifié, 647 925 pour Vite (+0,7 %) — la différence de 1 159 737 à 647 925 octets venait de la minification, que la configuration esbuild ne faisait pas, pas du bundler.

**Bun, mesuré et non supposé.** `bun install` : 139 paquets en 2,63 s (le postinstall de `core-js` est bloqué par défaut, sans conséquence). `bun test` : 50/50, sans `tsx` ni shim `util` (props #51 et locomotion #53 inclus via `bun test test/`). `@tensorflow/tfjs-node` se charge sous Bun et calcule sur le backend natif (`tensorflow`, vérifié par une somme de tenseur). `bun run build` : Vite émet `web/dist/index.html` + `web/dist/main.js` (655 860 octets, sans hash). `bun dist/server.mjs` sert `/` → `/web/dist/index.html`. L'image Bun vs Node (0,0 % des blocs > 8/255 à t235 et t55) a été mesurée sur #48 avant le merge de `feat/vite` ; elle n'est pas rejouée ici.

Ce qui n'a **pas** pu être mesuré : l'entraînement comparé sous les deux runtimes. `src/guard.ts` met la machine en pause (« tests=true ») et refuse de démarrer sur cette machine, quel que soit le runtime — c'est un garde-fou de charge, pas une propriété de Bun. Une chose à savoir au passage : ce garde reconnaît un test en cours en cherchant `vitest` ou `bun test` **dans la ligne de commande de n'importe quel process**, donc une commande qui contient ces mots (un `grep`, une revue de logs) suffit à bloquer un entraînement.

**R3F n'est pas dans cette PR.** La scène reste impérative : cinq acteurs, des uniformes créés avant compilation, des impulsions en forme fermée au tick. Le passage à React Three Fiber est un chantier à part, avec la même exigence de preuve — image identique au seuil du grain, budget identique — et il commence par une question de game design : qui possède la boucle de rendu.

## Lancer

Bun 1.4, CPU suffisant.

```sh
bun install              # three, esbuild, vite, @tensorflow/tfjs-node 4.22 — 139 paquets
bun run build            # vite (navigateur -> web/dist/main.js) + esbuild (Node -> dist/*.mjs)
bun run dev              # serveur de développement Vite, HMR, http://127.0.0.1:18230/web/index.html
bun dist/train.mjs --updates 800 --envs 32 --out runs/base --seed 1      # PPO multi-agents headless
bun dist/eval.mjs --pack runs/base/actor.json --n 200                     # taux de victoire, seeds 900000+
scripts/mesures.sh                                                         # mesures du jalon 1
cp runs/base/actor.json policies/current.json && cp runs/base/full.json policies/current-full.json
bun dist/server.mjs      # http://127.0.0.1:18190/  (?debug=1  ?autoplay=march|turret|brawler|backpedal|wallHugger  ?seed=  ?shot=<ticks>  ?fog=linear  ?grid=1  ?pivot=0|0.3|0.5  ?tell=0  ?cam=couloir  ?impact=0  ?demo=reveal  ?alarme=0  ?tex=1024  ?env=0  ?lights=all  ?props=0  ?policy=b6p)
```

Node reste possible (`node dist/server.mjs` fonctionne) mais n'est plus la cible : `bun test` remplace `node --test`,
`bun build.mjs` remplace `node build.mjs`, et `tsx` n'est plus une dépendance — Bun lit le TypeScript nativement.

`?seed=N` joue **N** (les manches suivantes avancent d'un cran). Avant le 04/11/2026 la première manche
incrémentait la graine : les captures étiquetées par leur URL avant cette date sont décalées d'un cran.

`policies/` : `current.json` est **b5** (`runs/b5@2000`, défaut du jeu, sans paramètre d'URL). Candidat **b6** vis2 : `policies/candidates/b6/` (`?policy=b6`). Candidat **b6p** : `policies/candidates/b6p/` (`?policy=b6p`) — acteur original `runs/b6@1950` (#66), **pas** promu. Archives byte-identiques : `policies/b4/` (`runs/b4@800`, `?policy=b4`) et `policies/b3/` (`runs/b3@2000`, `?policy=b3`). Copies de travail : `policies/candidates/b5/`, `policies/candidates/b4/`. `src/guard.ts` met l'entraînement en pause si la machine est chargée (load, inodes, autres tests) ; `GUARD_FS` choisit le disque surveillé (par défaut `.`).

## Le Sas — vignette R3F + Rapier (IGN-116)

Une scène autonome, sans toucher à la simulation RL : sept caisses Genex dynamiques, une rafale qui
leur applique de vraies impulsions, et un Night Lord révélé derrière. React 19, React Three Fiber,
React Three Rapier, Vite ; caméra épaule, ACES, bloom borné et mode Éco pour petit viewport.

```bash
bun run dev                          # http://127.0.0.1:18230/web/sas.html?debug=1
bun run build && bun dist/server.mjs # http://127.0.0.1:18190/sas?debug=1
```

Espace ou **Rafale** tire, **R** ou **Recommencer** restaure les sept corps. Le mode mobile conserve
la physique, réduit DPR, ombres et post-traitement. `prefers-reduced-motion` réduit l'impulsion
verticale. Sans GLB, un repli procédural est affiché explicitement ; les assets Genex restent hors
dépôt. `?quality=low|high` force la qualité. Le diagnostic `window.__SAS` expose positions, compteurs
et frame times. Voir `docs/LE-SAS-CONTRAT-VISUEL.md` et `docs/LE-SAS-RECETTE.md`.

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

## Plancher de bruit : rejouer la décision

`npm run sweep:noise` rejoue la décision du plancher de bruit (reverté, PR #31) sur une liste de planchers (`--floors 18,25,30,35,40`), `--seeds` graines et `--ticks` : par plancher, la meute (`policies/current.json` lue en JSON, `--pack naive` pour le comportement de repli) est mesurée en graines OK (≥1 griffe et distance minimale < 14 m), événements, premier contact médian, distance minimale et ticks d'ouïe ; le joueur vient du pool (`--player`, défaut `brawler`, ou `idle`), `--out` archive le JSON, et le plancher est forcé au runtime — rien n'est réintroduit dans `src/sim.ts`.
Décision d'origine, reproductible : `npm run sweep:noise -- --player idle --seeds 1 --seed-base 3 --ticks 400 --out mesures/sweep-noise.json` → 18 m = 0 événement, 25 m = 310, 30 m = 443 (premier contact au tick 67, 0,48 m) et 35-40 m identiques : un plancher **< 25 m ne réveille pas la meute**, 30 m **sature**.

## Fichiers

- `src/sim.ts` : simulation à pas fixe (100 ms), observations, récompenses
- `src/tactics.ts` : Terminators scriptés et fantôme ; `src/recorder.ts`, `src/bc.ts`, `src/tobs.ts` : enregistrement et clonage de comportement
- `src/ppo.ts`, `src/train.ts` : PPO multi-agents ; `src/eval.ts`, `src/evallib.ts` : évaluation
- `docs/PROTOCOLE-MESURE-NN.md`, `scripts/nn-harness.ts` : protocole auditable et smoke de mesure (n'écrase pas b3)
- `src/server.ts` : serveur local et ré-entraînement entre manches ; `src/experiment-c.ts` : expérience C
- `web/` : rendu Three.js et vue de contrôle (touche V)
- Caméra de combat (défaut) : cadre le Terminator et le Night Lord vivant le plus menaçant (griffes armées) ou le plus proche. Recul / zoom doux, orbite limitée, évitement des piliers, lissage. Marqueur hors écran, lueur d'yeux / réacteur sans fog, traçant de bolt jusqu'à l'impact. `?cam=epaule` et `?cam=troisquarts` restent.
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
- Télégraphe : un Night Lord dont la griffe est **armée** (`armTicks > 0`, 2 ticks décidés par la
  simulation) voit son liseré de silhouette passer au rouge ardent pendant 200 ms ; deux autres assaillants
  au contact, griffes en recharge, ne disent rien. Une griffe simplement prête et proche donne un rideau à
  45 %, qui ne crie pas. `?tell=0` coupe tout. Le signal se lit sur le **liseré**, pas sur les yeux : un
  assaillant qui vient dans le dos n'a pas d'yeux visibles. Le build jouable n'est plus comparable aux
  mesures b3 (voir `web/models/MANIFESTE.md`).
- Alarme de servo : quand l'armure encaisse, la simulation pose `servoAlarm` (10 ticks, 1 s) et le rendu fait
  **battre le rouge dans les plaques** du Terminator à 2,5 Hz pendant que le HUD écrit « ALARME SERVO ». Aucun
  draw call, aucun triangle, aucune lumière de plus : c'est l'émissif du matériau de l'armure. `?alarme=0`
  coupe l'effet et sa ligne de HUD (mesure avant/après). Sous 25 % d'armure, une seule fois par manche, le HUD
  passe à « servos critiques ».
- Le décor est un **pont de vaisseau construit** (tôle rivetée, membrures, poutres, coque à nervures), pas le
  grey-box d'origine : `web/DECOR.md` donne la liste, le budget (29 appels, 64 798 triangles) et ce qu'il n'est
  pas. Tout ce qui se répète est instancié, et les sept lampes rouges des pilastres sont devenues des bandeaux
  émissifs : **quatre lumières en moins** sur cinq maillages skinnés. `?env=0` rend l'ancien grey-box tick pour
  tick, `?lights=all` rend les sept lampes.
- Six **props sculptés** Genex (débris, caisse, tuyauterie, chaînes, reliquaire, serviteur mort) sont posés en
  22 instances contre les piliers et les parois, **six appels de rendu** pour les vingt-deux : une
  `InstancedMesh` par type. Coût mesuré au même tick (t235, graine 18) : **53 → 59 appels, 65 490 → 141 573
  triangles, aucune lumière de plus**. Les versions optimisées des personnages, animations et props sont
  versionnées dans `web/models/` ; si un fichier est absent, le rendu garde son repli. `?props=0` rend la
  scène sans props tick pour tick (voir `web/PROPS.md`).
- `?debug=1` publie les compteurs de rendu dans `window.__SC()` — appels, triangles, lumières, textures, et le
  détail des props. C'est la seule mesure de coût de rendu qu'on puisse prendre sans GPU, et la passe plein écran
  ne l'écrase pas : le compte est relevé avant elle.
- Textures : les modèles sont chargés en **512²** quand la variante `<modèle>-512.glb` est présente, ce qui divise
  la VRAM de textures par quatre (80 → 20 Mio) sans écart mesurable au seuil du grain (0,0 % des blocs > 8/255).
  `?tex=1024` force la pleine résolution. La géométrie n'est pas dégradée : elle est bloquée à 8 665 triangles
  côté outil (voir `web/models/MANIFESTE.md`).
- Le pas de la caméra vient de l'**événement de simulation** (`step`, avec son intensité et son pied), plus
  d'un compteur de mètres parcourus : la cadence suit la vitesse par construction, le pied alterne, et le
  pas d'arrêt — le plus lourd — pousse plus fort.
- Mode démo (`?demo=reveal`) : **mise en scène**, pas une manche jouée. Il place les cinq acteurs et leur donne
  un script d'actions — quatre ticks de marche, l'armement d'une griffe et une rafale au tick 13 — pour obtenir
  un plan que la simulation ne produit pas : la salle éclairée par le flash pendant qu'une griffe est armée à
  1,4 m. Le pas de simulation reste le vrai (`step()` calcule les dégâts, les événements, le bruit) et le HUD
  affiche « MISE EN SCÈNE » dans l'image. **Aucune capture de ce mode ne se présente comme du jeu joué** ; une
  démo ne remplace jamais une mesure de graine, elle montre une intention (voir `web/models/MANIFESTE.md`).
- `shots/` : captures 16:9 et 9:16 (prototype du jalon 1)
- `mesures/`, `jalon1/mesures/`, `runs/*metrics.jsonl` : mesures brutes citées dans les rapports

## Provenance

Code de départ : [IgnitionAI/ignition@52974ec](https://github.com/IgnitionAI/ignition/tree/52974ec) (`packages/demo-cage-duel/src`, `packages/backend-tfjs/src`, `packages/core/src`). Il n'est pas recopié ici ; `src/ppo.ts` est une adaptation du PPO de `backend-tfjs` (déclaré MIT).

## Licence

MIT, © 2026 IgnitionAI. Voir `LICENSE`.
