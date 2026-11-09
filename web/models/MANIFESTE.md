# Intégration des modèles riggés — manifeste et budget

## Provenance

Cinq personnages (4 Night Lords + 1 Terminator) et 10 clips de marche/course, générés par Genex et
déjà payés. Source sur le disque partagé :
`Shared/team/pipeline/demo-night-lords/assets/rigged-opt/` et `.../anims/`.
Optimisation `gltf-transform 4.5.1` (quantize + textures WebP) : voir `MANIFESTE.md` du pipeline.

**Les versions optimisées sont versionnées dans le dépôt**, sur décision explicite de Salim : 5 personnages
en 1024² et 512², 10 clips et 6 props, soit 26 GLB pour 14,2 Mo. Les sources lourdes restent uniquement
dans le stockage partagé. Les sons demeurent hors du dépôt.

Le chargeur échoue toujours proprement si un fichier est supprimé : le rôle concerné garde sa capsule et
la console signale le modèle absent. Le prototype reste jouable.

## Checklist — avant de toucher au chargement

Quatre pièges, tous rencontrés en intégrant ces fichiers. Chacun coûte une heure s'il se découvre à
l'écran.

1. **`Box3.setFromObject` ment sur un maillage quantifié.** Symptôme : le modèle sort 100 fois trop
   grand, l'arène est mangée par des formes noires. Cause : `KHR_mesh_quantization` met l'échelle
   ×0,01 sur le nœud du maillage et les positions dans ±32767 ; `setFromObject` lit la géométrie
   brute. Correctif : `SkinnedMesh.computeBoundingBox()` (qui applique les os) puis
   `box.applyMatrix4(mesh.matrixWorld)`. Rend 1,70 m.
2. **Orientation : les modèles regardent +Z, la simulation regarde +X.** `rotation.y = -facing` seul
   fait marcher les personnages de travers. Correctif : `rotation.y = π/2` sur le modèle, le groupe
   garde `-facing`.
3. **L'échelle se cale sur le collider, pas au goût.** 2,0 m pour un NL (`radius` 0,45), 2,6 m pour
   le Terminator (`radius` 0,8). Plus grand, le visuel déborde de la boîte de collision, traverse
   les murs et se chevauche.
4. **`?shot=` ne reste déterministe que si les mixers avancent d'un `DT`.** Les avancer sur
   `performance.now()` casse toute comparaison avant/après. Corollaire : la graine de grain de la
   passe post dépend du temps réel — deux captures ne sont jamais identiques au pixel (l'écart *est*
   le grain), alors que la simulation l'est.
5. **Un Euler explicite explose sur un grand pas.** Symptôme : la caméra part à l'infini, la capture
   sort entièrement noire. Cause : la secousse du tir est un ressort raide (`ω ≈ 23 rad/s`) ; en
   intégration explicite il faut `ω·dt < 0,5`, or le pas de simulation vaut `dt = 0,1 s` → `ω·dt = 2,3`.
   Douze sous-pas de 8 ms « corrigent » le débordement mais coûtent une boucle de plus par tick.
6. **Un ressort intégré dans la boucle de simulation saccade à 10 Hz.** Symptôme : la caméra avance
   par paliers de 100 ms alors que l'image est interpolée à 60 fps — le mouvement est *plus* mauvais
   que sans effet. Cause : la position de caméra n'est calculée qu'à chaque tick, le rendu la relit
   telle quelle.

   **La règle qui règle les deux : tout effet de caméra s'évalue en forme fermée au moment du rendu,
   jamais par une intégration dans le pas de simulation.** Un ressort amorti a une solution exacte —
   `x(t) = (v₀/ω_d)·e^(−ζωt)·sin(ω_d t)` avec `ω_d = ω√(1−ζ²)` — qu'on évalue avec le temps *de
   rendu* (`simT − DT + α·DT`, α = fraction du tick en cours). Trois bénéfices mesurés : aucune
   instabilité quelle que soit la raideur, mouvement lisse à 60 fps, et `?shot=N` tombe exactement
   sur le tick N sans dépendre de l'historique d'intégration.

## Distribution — décision

Salim a explicitement demandé la publication des modèles optimisés dans le dépôt public. Cette décision
lève le repli précédent vers un stockage privé ; elle ne constitue pas une validation juridique des droits
de Games Workshop ni des conditions de redistribution de Genex.

Le dossier `Shared/team/pipeline/demo-night-lords/assets/rigged-opt/` reste la copie de travail des sources
optimisées. Les GLB bruts de 46 à 50 Mo ne sont pas copiés dans le dépôt. Le chargeur dégrade proprement
vers les capsules si un modèle est absent.

## Ce que le code fait

- `GLTFLoader` sur `<role>.glb` (pose + clip de repos) et `<role>-walk.glb` / `<role>-run.glb`.
- Un `AnimationMixer` par personnage, avancé d'un `DT` total dans `tick()` (pas du temps réel),
  découpé en sous-pas pour que le temps clip par évaluation reste ≤ 1/30 s. Une capture `?shot=N`
  donne la même pose finale qu'un seul `mixer.update(DT)` par tick.
- Passage marche/course selon la vitesse effective ; fondu de 0,15 s. Un NL étourdi (`stunSpeed`)
  tombe dans la bande marche ; le Terminator n'a pas de vitesse de course dans la sim.
- Échelle mesurée, pas devinée : les maillages sont quantifiés (`KHR_mesh_quantization`), et
  `Box3.setFromObject` rend 0,02 m au lieu de 1,70 m — c'est la boîte calculée par le skin
  (`SkinnedMesh.computeBoundingBox`) transformée par la matrice monde qui donne 1,70 m. Hauteur cible
  calée sur le collider : 2,0 m pour un NL (`NL_CFG.radius` 0,45), 2,6 m pour le Terminator (`T_CFG.radius` 0,8).
- Orientation : les modèles regardent **+Z**, la simulation regarde +X → `rotation.y = π/2` sur le
  modèle, le groupe garde `-facing`.
- Matières : albedo ×0,22 (NL) et ×0,40 (Terminator), métal ×0,3, rugosité ≥0,72, liseré de Fresnel
  de P2 conservé. Les textures Genex sont calibrées pour un studio, pas pour un couloir à 10 lux.

## Budget mesuré — avant / après

Méthode : `renderer.info` sur `?shot=115&seed=3&autoplay=march`, 1920×1080, Chromium headless +
SwiftShader. « Passe principale » = ombres désactivées le temps d'un rendu ; « toutes passes » = le
cadre réel, passe d'ombre du projecteur comprise. Base : `e17d511`.

| | avant | après | écart |
|---|---|---|---|
| draw calls, passe principale | 30 | 17 | −13 |
| triangles, passe principale | 3 594 | 62 016 | ×17,3 |
| draw calls, toutes passes | 36 | 21 | −15 |
| triangles, toutes passes | 3 666 | 82 661 | ×22,5 |
| textures | 0 | 15 (1024²) | +15 |
| VRAM textures, brute | 0 | 60 Mio (80 avec mips) | +60 Mio |
| programmes GL | 12 | 13 | +1 |
| géométries | 32 | 19 | −13 |
| maillages skinés / os | 0 / 0 | 5 / 120 | +5 / +120 |

Les draw calls **baissent** : 4 capsules et 8 sphères d'yeux (12 objets) sont remplacés par 5 modèles
d'un seul maillage chacun. Les triangles sont le vrai coût : 61 790 de modèles + 226 de décor, conformes
au chiffre attendu. Les 20 645 triangles de la passe d'ombre sont le Terminator, seul personnage dans le
cône du projecteur.

Textures : 15 WebP de 2 187 Kio sur disque, mais 15 × 1024² décompressés en VRAM, soit 60 Mio bruts —
c'est le chiffre qui compte, pas le poids des fichiers.

## Le flash de bouche peint la salle, pas la proie

Mesuré, pas supposé. Deux rafales trouvées par balayage (100 graines × 3 modes d'autoplay, 300
manches, événement `bolt` croisé avec la position des NL vivants et leur projection à l'écran) où une
proie vivante est dans le cadre à moins de 8 m au tick du tir. Différence de luminance en blocs de
8 px (le grain s'annule), même graine, même tick, `?impact=0` contre flash :

| région | gain moyen | blocs > +2/255 | max |
|---|---|---|---|
| sol devant | **+11,6/255** | 81 % | +61 |
| pilier droit | **+12,5/255** | 86 % | +46 |
| dos du Terminator | +8,9/255 | — | +230 (un éclat) |
| **Night Lord à 5,3 m** | **+1,8/255** | — | +124 |
| Night Lord collé à 1,5 m | +2,5/255 | — | +122 |
| total image | +5,9/255 | 54 % | +61 |

Verdict géométrique, pas un réglage : la lumière est à 1,9 m devant le Terminator, la caméra à 3,55 m
derrière lui. Ce qui est assez près pour encaisser le `1/r²` (2 à 3 m) est **derrière sa propre
silhouette** ; ce qui est visible est à 5–8 m, où l'intensité est tombée à 0,8 puis 0,3 fois la clé.
Aucune graine ne donne donc « le flash révèle une proie ». Le flash est un **révélateur de salle** —
et c'est la proie qui reste la forme noire *contre* la salle allumée. Pour obtenir l'image classique
(une proie déchirée par la lumière), il faut la placer à 2 ou 3 m **en travers du canon**, pas devant :
c'est un plan de démo, pas un réglage de la simulation.

Réglage retenu : `PointLight(0xffd8a8, 20 × muzzleT², 13 m, decay 2)` en `(1,9, 1,6, 0,6)` dans le
repère du Terminator, 75 ms, décroissance quadratique. Contre 12 / 11 m / 1,4 m avant : le total passe
de +2,54 à +5,90 sur les blocs, 30 % → 54 % des blocs au-dessus de +2.

## Lien avec la simulation — ce que le rendu ne décide pas

Le rendu ne touche jamais `src/sim.ts`. Deux points où il en dépendent quand même, à lire avant de
comparer une capture à une mesure.

**Armement de la griffe (décidé, pas encore dans le code).** La frappe tombe aujourd'hui dans le tick
où l'action 7 est choisie : aucune anticipation, donc un télégraphe qui ne peut annoncer que « griffe
prête » (`cd === 0`). La décision est d'ajouter **2 ticks de préparation** avant la frappe, dans
`src/sim.ts`, côté simulation — c'est la seule façon d'annoncer un coup qui arrive. Deux conséquences
à ne pas perdre :

- **Le build jouable n'est plus comparable aux mesures b3.** Elles ont été produites sans armement ;
  dès que le drapeau existe, leurs taux de victoire et leurs durées ne décrivent plus ce que le joueur
  affronte. Les chiffres de la meute restent valables pour l'entraînement, pas comme référence du jeu.
- **Le télégraphe a changé de source.** Il se branchait sur `cd === 0` ; il se branche désormais sur
  `armTicks` (`?claw-windup` actif par défaut), donc sur l'armement. 2 ticks font 200 ms, soit 12 images à 60 fps : assez pour être vu, trop
  court pour être lu deux fois. Le liseré devra tenir sa montée pendant tout l'armement, pas seulement
  l'allumer sur le dernier tick.

**Le pas de la caméra, et pourquoi il a changé.** Le poids du Terminator dans la caméra venait d'un
compteur de mètres parcourus qui déclenchait une impulsion tous les 1,55 m. Ce compteur ignorait la
vitesse réelle du tick, le pied qui se pose et les arrêts. Il vient maintenant de l'événement `step`
de la simulation, qui porte son intensité et le pied. Mesuré sur 115 ticks (graine 3, `brawler`) :

| | ancien compteur | événement `step` |
|---|---:|---:|
| course verticale de la caméra | 85,9 mm | **83,2 mm** |
| écart-type | 21,9 mm | **21,2 mm** |
| plus grand saut d'un tick à l'autre | 51,7 mm | **33,1 mm** |

Le débattement est le même — c'est la même masse. Ce qui change, c'est que l'à-coup le plus brutal
tombe quand le pied se pose au lieu de tomber quand le compteur déborde : **−18,6 mm sur le pire tick**.
Un compteur ne sait pas marcher.

## Mode démo — mise en scène, jamais présenté comme du jeu joué

`?demo=reveal` existe pour photographier un plan que la simulation ne produit pas, et pour le montrer **sans
dépendre d'une graine** : deux effets qui ne se rencontrent presque jamais en jeu, sur la même image.

Ce qui est fabriqué : les positions de départ et les actions scriptées. Ce qui ne l'est pas : le pas de
simulation, qui calcule dégâts, événements, bruit et armement comme d'habitude. `step()` ne sait pas qu'on
filme. Le HUD affiche « MISE EN SCÈNE » **dans l'image**, pour qu'une capture ne puisse pas être recyclée en
preuve de jeu joué après avoir perdu sa légende.

Script (`?demo=reveal&shot=14`) : le frère du flanc arme sa griffe au tick 13 (`armTicks = 2`, décidé par la
simulation) et la rafale part au même tick. À l'image, `armTicks = 1` et le flash est à 75 % de sa course.

| bloc de 8 px, image entière | flash seul | télégraphe seul | grain, même URL deux fois |
|---|---:|---:|---:|
| écart moyen | 1,90 /255 | 0,63 /255 | 0,00 /255 |
| écart maximal | +70,8 | +27,6 | +6,4 |
| blocs > 2/255 | 30,1 % | 12,5 % | 5,5 % |

**Pourquoi des blocs et pas des moyennes de région** : le grain d'une passe plein écran dépend de
`performance.now()`, et il déplace la moyenne d'une région de ±1,5/255 — soit l'ordre de grandeur du
télégraphe. Une moyenne de région prise sur deux captures est un chiffre de bruit déguisé en mesure. Le
plancher se mesure à côté, sinon il n'y a pas de mesure.

**Le tick, la graine et le mode sont brûlés dans l'image.** La dernière ligne du HUD écrit `t235 · graine 18 ·
autoplay march · cam epaule · shot=235`, et seulement les drapeaux qui s'écartent du défaut (`tell=0`,
`impact=0`, `demo`). Une capture se vérifie alors sans sa légende, ce qui est le minimum : une planche dont le
tick n'est pas lisible est une affirmation invérifiable, le même défaut qu'un chiffre sans SHA.

Ça a immédiatement servi. La planche du télégraphe annonçait « graine 17 » ; la graine réellement jouée
était **18**, parce que `startRound()` incrémente celle de l'URL. Personne ne l'avait vu en relisant le
document — le brûlage l'a montré du premier coup d'œil.

**Au-dessus de quel seuil une différence existe.** Le grain d'une passe plein écran fait bouger 5,9 à 6,1 %
des blocs de plus de 2/255, et son maximum atteint +14,1 à +15,5 : la colonne « max » ne sépare donc rien.
Ce qui sépare, c'est un seuil que le grain ne franchit jamais — **> 8/255** : 0,0 % des blocs pour le grain,
3,0 à 3,5 % pour le télégraphe, 7,4 % pour le flash. Un maximum isolé n'est pas une mesure ; un comptage de
blocs au-dessus d'un seuil que le bruit ne franchit pas en est une.

**Le LOD de texture est livré, et il est gratuit.** Les cinq modèles portent trois textures 1024² chacun : 80 Mio
de VRAM avec mipmaps, contre 20 Mio en 512² — soit **103,9 → 43,9 Mio** au total avec la géométrie. Les variantes
s'appellent `<modèle>-512.glb`, le chargeur les préfère par défaut et retombe sur l'original quand elles sont
absentes ; `?tex=1024` reprend les fichiers pleine résolution pour comparer.

| au seuil qui sépare du grain (> 8/255) | écart moyen | > 8 | > 2 |
|---|---:|---:|---:|
| 512 vs 1024, NL au contact (t225, graine 6) | −0,03 /255 | **0,0 %** | 6,5 % |
| 512 vs 1024, meute à 2 m (t235, graine 18) | −0,06 /255 | **0,0 %** | 7,0 % |
| plancher de grain, même URL deux fois | 0,00 /255 | 0,0 % | 5,4–6,1 % |

Autrement dit : au seuil où le grain ne passe jamais, le LOD de texture est indiscernable. La géométrie, elle,
n'est pas touchée — elle reste bloquée à 8 665 triangles côté outil, pour la raison déjà écrite (2,0 sommets par
triangle sur des maillages facettés).

**Une fréquence qui ne se lit pas scintille.** L'alarme de servo bat dans les plaques du Terminator. Réglée
d'abord à 8 Hz, elle ne dessinait aucun battement : la simulation avance par pas de 0,1 s, donc à 10 Hz, et une
intensité plus rapide que l'échantillonnage saute d'un tick à l'autre au lieu de pulser. À **2,5 Hz** (période
de 4 ticks), la courbe mesurée sur six ticks alterne franchement : +5,56, +1,50, +4,70, +0,47, +2,17, −0,82
d'écart à `?alarme=0` sur la luminance du corps. Le rouge décroît avec l'alarme, donc la dernière image est
presque éteinte — c'est le sens du signal, pas un défaut.

**`?seed=N` joue N, et ça n'a pas toujours été vrai.** `startRound()` incrémentait la graine dès la première
manche : `?seed=6` jouait la 7. Un paramètre qui ne fait pas ce qu'il dit est un piège pour celui qui n'a pas lu
le message — donc il est corrigé dans le code, pas seulement documenté : la manche 1 prend la graine de l'URL
telle quelle, les manches suivantes avancent d'un cran (pour qu'« Entrée » ne rejoue pas la même partie).

**Conséquence sur les documents antérieurs au 4 novembre 2026** : toute capture ou planche étiquetée par son
URL est décalée d'un cran. Les planches du télégraphe (#34, #37) annonçaient `?seed=17` pour une graine jouée de
**18** ; la planche de l'alarme (#38) annonçait `?seed=5` pour une graine de **6**. Les images restent valides —
seule l'étiquette d'URL était fausse — et elles ont été refaites avec l'URL corrigée. Le tick de la ligne brûlée
dans l'image, lui, n'a jamais menti : c'est ce qui a permis de le voir.

**Si un signal doit se lire plus fort, c'est en surface, pas en crête.** Mesuré au seuil que le grain ne
franchit jamais (> 8/255), sur l'image entière : le flash de bouche couvre **7,4 %** des blocs, le télégraphe
**3,0 %**, l'alarme de servo **4,0 %** — pour des crêtes comparables (+70,6 / +24,6 / +67,8). Autrement dit le
flash éclaire deux fois et demie plus large que le télégraphe ne signale. Le prochain qui voudra « un
télégraphe plus visible » aura le réflexe d'appuyer sur l'intensité : c'est le mauvais levier, la crête est
déjà à +24,6 sur une poignée de blocs. Ce qu'il faut étendre, c'est la **surface** — l'épaisseur du liseré, sa
durée, ou le nombre de fragments de silhouette qu'il touche.

**Graine et reproductibilité.** Les captures à `?shot=N` tombent sur le tick N, mais la graine de grain
de la passe plein écran dépend de `performance.now()` : deux captures du même tick ne sont jamais
identiques au pixel, l'écart est le grain. Comparer avec `pix.mjs` (histogramme) ou en blocs de 8 px,
jamais au pixel.

## Ce qui n'est pas mesuré ici

- **fps** et coût GPU du skinning : 5 squelettes de 24 os, 120 matrices mises à jour puis envoyées au
  GPU à chaque tick, plus les mêmes 120 matrices dans la passe d'ombre. Non mesurable dans cet
  environnement (pas de GPU, rendu logiciel à 6–10 fps non transposable). À relever sur une vraie
  machine ; si le cadre passe sous 60 fps, le plan B est un LOD de modèle, **pas** la suppression des
  ombres (elles portent la lecture des silhouettes).
- Synchronisation pied/sol : `timeScale = v · T / foulée` (foulée skinée au sol, même échelle que le
  chargeur). Le déplacement monde reste celui de la sim ; les clips n'ont pas de root motion horizontal.
