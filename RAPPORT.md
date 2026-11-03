> **Note (01/11/2026)** : ce rapport est l'état de travail du 31/10 à 22:25, publié tel quel. Les mesures finales de b3 et de l'expérience C sont dans `README.md` et `mesures/`.

> **Encadré (03/11/2026) — le build jouable n'est plus comparable aux mesures b3.**
> Les griffes s'arment désormais **2 ticks (0,2 s)** avant l'impact : le coup est annoncé (`clawArm`), les dégâts ne tombent qu'à l'impact, après **re-vérification de la portée et de la zone** (`whiff` si la cible s'est éloignée). Tout ce qui est mesuré dans `mesures/` — b3, expérience C, évaluations — a été produit **sans** armement. Ces chiffres restent une **référence d'entraînement**, mais **ils ne décrivent plus ce que le joueur affronte** dans le build `web/`.
> Toute évaluation future se fait avec `newWorld(seed, spawn?, { clawWindup: false })` — c'est déjà le cas dans `src/train.ts` et `src/evallib.ts`. Sans ce drapeau, on compare deux jeux différents et les écarts ne veulent rien dire.

> **Encadré (03/11/2026) — l'inertie du Terminator périme tous les chiffres publiés.**
> Le Terminator n'est plus déplacé par son entrée : la commande fixe une **consigne** que l'état de vitesse rejoint par rampe (accélération, décélération, montée en régime de la rotation). Le pas est désormais un **événement de simulation** (`{ type: 'step', x, y, foot, intensity }`), pas un détail de rendu. Valeurs retenues, réglables au ressenti et sans valeur de lore : `accel 3 m/s²`, `decel 5 m/s²`, `turnAccel 2 rad/s²`, `turnMax 1,6 rad/s` (plafond atteint en 0,8 s ; c'était la vitesse de rotation instantanée d'avant), `strafeAccel 0` (aucune translation latérale : `strafe` n'oriente plus qu'un axe de marche, il faut pivoter pour se décaler), foulée `|v| · 0,9 s`.
> **Conséquence directe : dès que l'inertie change les trajectoires, tous les chiffres publiés perdent leur sens descriptif** — b3, expérience C, évaluations, tableaux de ce rapport et du `README.md`. Ils restent une **référence d'entraînement** (mêmes règles de meute, mêmes récompenses, même arène, mêmes observations à 29 dimensions, espace d'action inchangé : les politiques restent chargeables, sans réentraînement), mais **ils ne décrivent plus le jeu joué**. Aucun de ces chiffres ne doit être cité comme une mesure du build actuel.
> **Un rejeu est nécessaire, et il est désormais possible** : la graine suffit à reproduire une manche (aucun `Math.random` hors graine), donc on peut rejouer exactement les mêmes seeds et lire les nouvelles trajectoires, durées et taux de victoire. Tant que ce rejeu n'est pas fait, on ne sait pas ce que vaut la meute contre un Terminator qui a de l'inertie. Un point de méthode : les tests d'armement des griffes ont dû être resserrés, car depuis l'arrêt deux ticks (0,2 s) ne couvrent plus que 0,09 m — une griffe télégraphiée attrape maintenant un Terminator immobile. C'est le game design voulu (« forteresse lente »), pas une régression.

> **Encadré (03/11/2026) — les armes introduisent de l'état : les chiffres publiés ne décrivent plus le jeu.**
> Le bolter lourd ne tire plus un coup instantané : une **rafale de 3 tirs, un par tick**, avec **30 munitions**, une **dispersion croissante** (`boltHalf · (1 + 0,25 · tirs déjà partis)` : le 3ᵉ tir part 50 % plus large que le 1ᵉʳ) et un **recul normalisé** (`recoil` 1/3, 2/3, 1) fourni au rendu. Chargeur vide ⇒ **rechargement automatique de 20 ticks (2 s)**, sans tir et **à vitesse réduite de moitié** (on recharge, on ne court pas). Le gantelet ne frappe plus à l'appui : il **charge 8 ticks (0,8 s)**, non annulable, à vitesse réduite et audible (`fistCharge` puis `fistReady`), puis l'impact tombe avec les règles de ciblage d'avant (`fistRange`, `fistHalf`, ligne de vue non requise) ; `fistCd` (12) ne part qu'à l'**impact**, jamais à l'entrée en charge.
> Ce lot ajoute une **règle de simulation nouvelle** : `stunTicks` (`fistStunTicks = 6`). Le choc du gantelet tue la cible au contact **et** étourdit les Night Lords encore debout : pendant `stunTicks`, le `cd` de griffe est **gelé** (la prochaine attaque est repoussée d'autant) et le déplacement est **réduit de moitié** (`stunSpeed 0,5`). C'est la seule règle qui rende de l'air au Terminator ; elle n'existe dans aucune des mesures publiées et doit être citée comme telle.
> **Conséquence : ces états changent les trajectoires et les durées** (vitesse bridée pendant 2 s de rechargement ou 0,8 s de charge, meute ralentie pendant 0,6 s). **Les chiffres publiés ne décrivent donc plus le jeu** — `mesures/`, les tableaux de ce rapport et du `README.md` restent une **référence d'entraînement** (mêmes observations à 29 dimensions, même espace d'action, mêmes récompenses), pas une description du build actuel. Les valeurs du lot sont réglables au ressenti (`T_CFG.boltAmmo`, `boltBurst`, `boltBurstGap`, `boltReload`, `boltSpreadStep`, `fistChargeTicks`, `fistStunTicks`, `slowScale`, `stunSpeed`) ; les valeurs de base du combat (`boltHalf`, `boltCd`, `fistCd`, `fistRange`, `fistHalf`) sont inchangées, seules les dérivées sont nouvelles.

> **Encadré (03/11/2026) — encaisser se sent, et cela annule des actions : les chiffres publiés ne décrivent pas ce jeu.**
> Un coup de griffe qui **inflige des dégâts** émet désormais, **en plus** du `claw` (vu de la meute), un événement `hit` côté Terminator : `{ dmg, zone, hpAfter, stagger, servoAlarm }`. Il pose `staggerTicks = 2` (0,2 s) : pendant ces deux ticks, **aucune action offensive n'est acceptée** (`bolt`, `fist` ignorés) et le déplacement est **réduit de moitié** — on encaisse, on ne s'arrête pas net. Une **alarme de servo** est posée à `max(servoAlarm, 10)` (1 s) et décroît d'un tick par pas ; quand l'armure passe **sous 25 %**, un `servoCritical` est émis **une seule fois** par manche.
> **Le stagger et l'interruption annulent des actions** : un **gantelet en charge est perdu** (`fistCharge = 0`, aucune munition consommée, aucun impact) et une **rafale en cours est coupée** (`burstLeft = 0`, les munitions déjà parties sont perdues). Ils changent donc les trajectoires **et les durées** : les chiffres publiés (`mesures/`, `README.md`, tableaux ci-dessous) **ne décrivent pas ce jeu** et restent une simple référence d'entraînement (observations à 29 dimensions et espace d'action inchangés, politiques chargeables sans réentraînement). Valeurs retenues, réglables au ressenti : `T_CFG.hitStaggerTicks = 2`, `staggerSpeed = 0,5`, `servoAlarmTicks = 10`, `servoCriticalFrac = 0,25` ; les valeurs de dégâts (`NL_CFG.dmgSide`, `dmgRear`) et de combat sont **inchangées** — c'est le retour du coup, pas un rééquilibrage.

# Jalon 1b : état au 31/10/2026, 22:25 (heure de Paris), EN COURS

Le rapport du jalon 1 est archivé dans `jalon1/RAPPORT-jalon1.md`, avec ses mesures et ses captures. Ses chiffres ne valent plus pour les règles actuelles.

## Ce qui est codé (fait)
- **Équité**
  - Le *shaping* de récompense passe par la distance à la **croyance** de chaque Night Lord, plus par la vraie position (`nlFrame(n).d` dans `src/sim.ts`). Le bonus d'appât d'Uzas exige qu'il se sache dans le cône avant, par la vue ou la vox.
  - Les frères ne connaissent la position des autres que par la vue (cône et ligne de vue), le son (rayon de bruit de 5 m quand le frère bouge, 7 m quand il frappe) ou la vox (portée de 14 m). Sinon, ils gardent la dernière position connue, qui vieillit. Le relais vox de la position du Terminator est soumis à la même portée.
  - **Connaissance publique documentée** : sans aucune information, un Night Lord se dirige vers la balise de téléportation. C'est l'objectif connu de tous ; c'est acceptable. Sont publiques aussi : l'armure entamée du Terminator et la progression de la téléportation (la balise s'illumine).
- **Règles allongées** : la téléportation demande 6 s dans la zone sans subir de coup. Le Terminator a 30 points d'armure ; une griffe dans le dos fait 2, de flanc 1, de face 0. Le storm bolter recharge en 1,2 s, les griffes en 0,8 s. Le temps maximum est de 120 s. La meute apparaît près de la balise (x de 26 à 38). Ce sont des valeurs de prototype, sans aucune référence.
- **Tactiques**
  - Entraînement : march, turret, brawler, backpedal, et `randomized`, une tactique paramétrée tirée au hasard à chaque partie, qui compte pour 50 % des parties.
  - **Jamais vues à l'entraînement** : wallHugger, kiter (nouvelle) et elite (nouvelle, « le meilleur scripté »).
  - Réserve : randomized couvre des comportements voisins de ceux de kiter et elite (pas chassés, recul, réaction aux coups).
- **Mécanisme C par imitation**
  - `src/tobs.ts` définit l'observation du Terminator (26 valeurs, uniquement ce qu'il perçoit) et ses actions discrétisées (27 déplacements × 3 attaques).
  - `src/bc.ts` fait le *behaviour cloning*. 20 % des frames sont tenues à part pour mesurer la fidélité, comparée à une imitation qui jouerait toujours l'action majoritaire.
  - Le fantôme `bcGhost` est dans `src/tactics.ts`. Le serveur apprend le fantôme sur les 3 dernières manches de la session.
  - `src/experiment-c.ts` joue 3 manches d'un joueur synthétique (elite, jamais vu) par graine, sur les graines 1, 2 et 3. Il ré-entraîne la meute contre le fantôme entre les manches (30 mises à jour). Il lance aussi un **contrôle** : les mêmes 3×30 mises à jour, sans fantôme.
- **Garde de charge** (`src/guard.ts`)
  - Pause tant qu'un script `ci-local`, `docker compose`, vitest ou `bun test` tourne, ou qu'une stack publiée sur un port de 18092 à 18099 est en ligne. Les ports 18095 et 18096 (stack démo permanente) sont exclus, comme 18082 et 18090-18091 : c'est une hypothèse documentée.
  - Reprise seulement avec load < 6, inodes < 85 % et 1 seul entraînement.

## Runs (tous détachés avec nohup, un à la fois)
| Run | PID | Log | État | Ce qui reste |
|---|---|---|---|---|
| b1, b2 | — | `runs/b1-abandon*`, `runs/b2-abandon*` | abandonnés : règles changées en cours de route (b2 : 107 MàJ, 0 % de victoires à l'entraînement avec 40 d'armure) | — |
| **b3** (base, 2000 MàJ, 32 environnements, seed 3) | 1548589 (dans `sh` 1548587) | `runs/b3.log`, `runs/b3/metrics.jsonl`, checkpoint toutes les 25 MàJ dans `runs/b3/` | **712/2000 MàJ à 22:20**, 634 s de calcul effectif. Il a été en pause plusieurs fois pendant d'autres tâches de la machine | environ 1 300 MàJ, puis l'éval automatique sur 200 parties par adversaire, écrite dans `mesures/eval-b3.json` |
| chaîne de nuit | 1012947 (`scripts/nuit-1b.sh`) | `runs/expC.log` | attend `mesures/eval-b3.json` | expérience C (3 graines × 3 manches + contrôle), écrite dans `mesures/experiment-c.json`, puis b3 devient la politique courante |

**Mesure intermédiaire réelle** : checkpoint b3 à 700 MàJ, **50 parties seulement** par adversaire, seeds 900000 à 900049 (`runs/eval-b3-snap700-n50.json`). Ce n'est pas la mesure finale.
| Adversaire | Meute | Durée médiane | Parties de 30 à 90 s |
|---|---|---|---|
| march | 45/50 | 19,4 s | 2 % |
| turret | 39/50 | 25,0 s | 18 % |
| brawler | 40/50 | 21,2 s | 8 % |
| backpedal | 50/50 | 21,6 s | 0 % |
| wallHugger (jamais vue) | 17/50 | 25,0 s | 20 % |
| kiter (jamais vue) | 17/50 | 21,0 s | 6 % |
| elite (jamais vue) | 32/50 | 20,6 s | 2 % |

À ce stade, **les deux objectifs ne sont pas atteints** : les parties durent environ 20 s au lieu de 30 à 90 s, et la meute n'atteint pas 85 % contre wallHugger et kiter. Si la mesure finale de b3 le confirme, l'étape suivante sera un run b4 avec des règles retouchées (des parties plus longues sans affaiblir la meute), à décider sur les chiffres de b3.

## Pas encore fait
Les captures 16:9 et 9:16 attendent la politique finale (celles du jalon 1 sont dans `jalon1/`). La mesure finale de b3 et l'expérience C tournent dans la chaîne.

---
Deviné / sauté : les chiffres de règles sont des valeurs de prototype. Les ports de stack exclus de la garde sont une hypothèse propre à la machine de dev. Le joueur de l'expérience C est synthétique. Les mesures b3 ci-dessus portent sur 50 parties à 700 MàJ : elles sont intermédiaires.

---

# Jalon 1 : prototype gris « Tactiques volées », rapport

Rédigé le 31/10/2026 vers 19:30, heure de Paris. Tout est en local. Je n'ai créé aucun dépôt, rien poussé, rien déployé, envoyé aucun message et dépensé aucun crédit Genex ni Higgsfield.
Le code de départ est une copie de `IgnitionAI/ignition@52974ec` (`demo-cage-duel/src`, `backend-tfjs/src`, `core/src`), placée dans `vendor/`. Le PPO est une adaptation du `ppo.ts` de backend-tfjs, en version multi-agents avec inférence par lots. La règle vient du Crucible : une sim à pas fixe de 100 ms qui fait foi à la fois pour le rendu et pour l'entraînement.

## Ce qui est livré

| Demande | Où | État |
|---|---|---|
| 1. Sim à pas fixe, Terminator au clavier (tue en 1 coup, armure de face, pivot lent, dos vulnérable), 4 Night Lords aux mêmes règles, observations limitées | `src/sim.ts` | Fait. Le storm bolter et le gantelet tuent en un coup. Une griffe de face fait 0 dégât, une de flanc 1, une de dos 3, sur 10 points d'armure. Le Terminator pivote à 1,6 rad/s. Un Night Lord ne connaît le Terminator que **s'il le voit** (cône de 63°, 12 m, ligne de vue coupée par les piliers), s'il **l'entend** (rayon de bruit de 3 à 18 m selon ce qu'il fait, position bruitée de σ 1,5 m) ou si **un frère le voit** (vox explicite). Sinon, il garde sa dernière croyance, qui vieillit. Le Terminator scripté n'utilise lui aussi que son cône de vision et son auspex de 4 m. |
| 2. PPO multi-agents headless (Node, tfjs) contre un Terminator scripté | `src/ppo.ts`, `src/train.ts`, `src/tactics.ts` | Fait. Une politique partagée par les 4 rôles (le rôle est en one-hot dans l'observation), une trajectoire par agent, GAE. Le pool de Terminators scriptés compte 4 tactiques : march, turret, brawler, backpedal. |
| 3. Mécanisme C : enregistreur, puis fine-tuning entre deux manches | `src/recorder.ts`, `ghost()` dans `src/tactics.ts`, `src/server.ts` | Fonctionne de bout en bout. Le gain n'est **pas démontré** (voir plus bas). |
| 4. Vue de contrôle | `web/main.ts` (touche V ou `?debug=1`) | Fait. Pour chaque frère : cône de vision, anneau à l'endroit où il croit le Terminator, avec une opacité qui baisse avec l'âge de l'info, et un trait vers cet anneau. S'y ajoutent l'anneau de bruit du Terminator et un tableau vu / entendu / vox / âge / action choisie (probabilité). |
| 5. Taux de victoire sur N parties tenues à part, et temps réel d'entraînement | `src/eval.ts`, `scripts/mesures.sh`, `mesures/*.json`, `runs/base/metrics.jsonl` | Fait. Seeds d'éval 900000 à 900199 ; les seeds d'entraînement sont toutes en dessous de 900000. |
| Captures | `shots/partie-16x9.png` (1920×1080), `shots/partie-9x16.png` (1080×1920) | Ce sont des captures de la même partie (seed 900020, tick 62), Terminator en autoplay `march`, vue de contrôle allumée. Le HUD affiche 3/4 Night Lords debout : Cyrion est déjà tombé. |

Pour lancer, voir `README.md`. Le serveur local est `node dist/server.mjs`, sur http://127.0.0.1:18190/. Je l'ai arrêté à la fin.

## Mesures réelles (box : 8 CPU, tfjs-node sur CPU)

**Entraînement de base** (`runs/base`, 32 environnements × 128 ticks par mise à jour) : 800 mises à jour, 10 692 252 transitions et 33 106 parties en **863,2 s (environ 14 min 23 s)**, soit 0,9 à 1,2 s par mise à jour. Pendant ce run, le load relevé est allé de 1,3 à 10,35 (une partie vient d'autres process de la box) et les inodes de 81,2 à 83 %.

**Taux de victoire de la meute**, sur 200 parties tenues à part par adversaire, avec des politiques figées en échantillonnage seedé (`mesures/eval-*.json`) :

| Adversaire | Meute entraînée (base, 800 MàJ) | Meute naïve (fonce et frappe) | Politique aléatoire |
|---|---|---|---|
| march (pool) | **174/200** (8,3 s en moyenne, 0,91 NL tué) | 0/200 | 0/200 |
| turret (pool) | **174/200** (9,7 s, 1,16 NL tué) | 0/200 | 0/200 |
| brawler (pool) | **125/200** (7,6 s, 2,34 NL tués) | 0/200 | 0/200 |
| backpedal (pool) | **199/200** (6,4 s) | 200/200 | 0/200 |
| wallHugger (**hors pool**, jamais vu à l'entraînement) | **94/200** (10,5 s, 2,68 NL tués) | 0/200 | 0/200 |

**Mécanisme C**, testé avec un *joueur synthétique* (la tactique wallHugger) et non avec un humain : une manche enregistrée de 134 ticks, puis un fantôme résumé, puis 30 mises à jour de fine-tuning (70 % contre le fantôme, 30 % contre le pool).
- Durée du fine-tuning : **16,9 s** en mesure directe (`mesures/finetune-time.json`). L'aller-retour par l'API `/api/round` du serveur a pris **16,6 s**. Une manche jouée dans le navigateur headless, pendant que le load était autour de 10, a déclenché un fine-tuning de **33,1 s**.
- Avant / après, sur 200 parties : contre le **fantôme**, 188 puis **194** ; contre la **vraie tactique wallHugger**, 94 puis **97** ; sur le pool après coup, march 178, turret 178, brawler 120 et backpedal 198. Le fine-tuning ne fait donc rien oublier de mesurable, mais **le gain contre la vraie tactique (+3/200) reste dans le bruit**.
- La cause est mesurée : la même meute bat le fantôme 188 fois sur 200, mais la vraie tactique seulement 94 fois. Le fantôme tiré d'**une seule manche**, qui démarre toujours au même point, imite mal le joueur.

## Ce qui marche
- La meute apprend une vraie coordination à partir d'observations limitées. Elle passe de 0/200 (naïve ou aléatoire) à 87 % contre march et turret, et ne fait jamais 0 contre un adversaire. Sur la vue de contrôle, on voit l'appât et les approches de flanc. C'est observé sur les captures, je ne l'ai pas quantifié rôle par rôle.
- La surpuissance est réelle face à une meute non coordonnée : un Terminator scripté tue les 4 Night Lords naïfs dans 200 parties sur 200 (march, turret, brawler).
- La boucle navigateur → enregistrement → fine-tuning local → nouvelle politique chargée à la manche suivante tourne. L'écran de fin de manche affiche ce que la meute a « lu » (par exemple « tu passes par le centre, tu préfères le storm bolter, tu engages vers 6.1 m »).
- Le rendu fonctionne en 16:9 et en 9:16 (la caméra recule en portrait). Le build est statique (esbuild), avec un bundle navigateur de 0,9 Mo.
- Les garde-fous sont dans `src/guard.ts` : load < 16, inodes ≤ 88 % et au plus 2 entraînements. Ils sont vérifiés au démarrage puis toutes les 10 mises à jour, et par le serveur avant chaque fine-tuning. Au plus 2 entraînements ont tourné en même temps.

## Ce qui ne marche pas, ou pas encore
- **Personne n'a joué.** Les contrôles clavier, le hitstop, le tremblement de caméra et les textes « ARMURE » ou « DOS » sont codés, mais je ne les ai pas essayés à la main : les captures viennent d'un navigateur headless en autoplay. Le ressenti de surpuissance reste à juger par un humain.
- **« Presque toujours » n'est pas atteint** : 62,5 % contre brawler et 47 % contre la tactique hors pool. Il faudra plus d'entraînement, plus de diversité dans le pool et un réglage des chiffres.
- **Les parties sont trop courtes** : de 6 à 10 s en moyenne contre la meute entraînée. Pour une démo, il faudra rallonger (plus d'armure, une meute plus prudente, une carte plus grande).
- **Le gain du mécanisme C n'est pas démontré.** Il faudra plusieurs manches, des départs variés et un fantôme appris par clonage de comportement plutôt que par résumé statistique.
- La tactique backpedal est triviale (99,5 %) : elle recule le dos tourné vers la meute qui l'attend à la balise. Elle sert à peine au curriculum.
- Les points d'équité à connaître pour la recette : (a) le *shaping* de récompense utilise la vraie distance au Terminator, **seulement à l'entraînement** (le critique et les observations n'y ont pas accès) ; (b) les frères connaissent toujours la position des autres frères ; (c) sans aucune info, un Night Lord se dirige vers la balise, un objectif public. Le joueur ne voit pas la vue de contrôle par défaut, il l'active avec V.
- Les détails techniques : tfjs-node 4.22 demande un polyfill `util.isNullOrUndefined` sous Node 24 (dans `build.mjs`). Le `google-chrome` de la box charge des extensions, donc les captures passent par le headless shell Playwright avec un profil jetable, supprimé après. Au premier lancement du run de base, le compteur de process de la garde ne voyait pas le process ; il est corrigé depuis, et la limite n'a pas été dépassée.

## Prochaines étapes proposées
Un premier essai humain, avec la vue de contrôle. Le réglage des chiffres pour allonger les parties. Un pool élargi, avec self-play du Terminator. Un fantôme appris sur plusieurs manches. Puis la recette du prototype gris avant l'habillage.

---
Deviné / sauté : tous les chiffres de règles (vitesses, portées, armure, bruit, récompenses) sont des valeurs de prototype, choisies sans réglage ni référence. Le joueur du test C est **synthétique**, pas humain. Je n'ai fait aucun essai manuel du clavier ni du ressenti. Je n'ai pas quantifié les rôles émergents. Chaque mesure vient d'un seul run d'entraînement (seed 1), sans répétition, donc sans barre d'erreur sur la variance entre runs. Je n'ai fait aucune mesure de performance du rendu sur mobile réel.
