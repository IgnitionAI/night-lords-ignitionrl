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
