# Manifeste des modèles optimisés — LOD et instanciation

Écrit pour Khayon, sur **les fichiers réels** de `Shared/team/pipeline/demo-night-lords/assets/rigged-opt/`
(ceux que le rendu charge), pas sur une hypothèse de poids. Chaque chiffre est relevé par
`/data/work/tools-fg/glbinfo.mjs`, qui lit le GLB sans le charger : chunk JSON, accesseurs, en-têtes
d'image. Commande de reprise :

```
node glbinfo.mjs <assets>/rigged-opt/*.glb
```

## 1. Tailles — disque et VRAM

Format : **GLB + `KHR_mesh_quantization`**, textures **WebP** 1024², pas de Draco ni de meshopt (aucun
décodeur à embarquer). Chaque personnage : 1 primitive, 1 matériau, 1 skin de **24 os**, 26 nœuds.

| fichier | disque | triangles | sommets | géométrie GPU | textures | VRAM sans mipmaps | VRAM avec mipmaps |
|---|---:|---:|---:|---:|---:|---:|---:|
| `NL-1.glb` | 1,21 Mio | 10 266 | 20 560 | 4,29 Mio | 3 × 1024² | 16,29 Mio | **20,29 Mio** |
| `NL-2.glb` | 1,23 Mio | 10 369 | 20 183 | 4,22 Mio | 3 × 1024² | 16,22 Mio | **20,22 Mio** |
| `NL-3.glb` | 1,16 Mio | 10 360 | 19 273 | 4,03 Mio | 3 × 1024² | 16,03 Mio | **20,03 Mio** |
| `NL-4.glb` | 1,22 Mio | 10 186 | 20 350 | 4,25 Mio | 3 × 1024² | 16,25 Mio | **20,25 Mio** |
| `TERM.glb` | 1,70 Mio | 20 609 | 33 963 | 7,11 Mio | 3 × 1024² | 19,11 Mio | **23,11 Mio** |
| **total (5 persos)** | **6,52 Mio** | **51 790** | **114 329** | **23,90 Mio** | **15 × 1024²** | **83,90 Mio** | **103,90 Mio** |

**Correction de mon chiffre précédent.** J'ai écrit « 60 Mio de VRAM pour 15 textures ». C'est 60 Mio de
textures **sans mipmaps, et sans la géométrie**. three.js génère les mipmaps par défaut (×4/3) : le vrai
total est **104 Mio**, dont 80 de textures et 24 de géométrie. C'est ce chiffre-là que ton budget doit
encaisser, pas 60.

Clips d'animation : **10 fichiers `anims/*.glb`, 522 208 o au total, 0 triangle** (squelette seul, 26 nœuds).
Les 5 modèles ont **les mêmes 24 os et les mêmes noms de nœuds** (vérifié) : un clip peut donc piloter
n'importe lequel des cinq, et il n'y a qu'un jeu de 10 fichiers à charger.

## 2. LOD de géométrie — mesuré, et bloqué

J'ai essayé de produire des niveaux de détail réels avec `gltf-transform 4.5.1` (meshoptimizer), sur
`NL-1.glb` : déquantifier, souder, puis simplifier à 50 %, 25 % et 10 % de sommets, contrainte d'erreur
retirée (`--error 1`) ou à 1 %, arêtes libres.

| tentative | triangles obtenus |
|---|---|
| `simplify --ratio 0.5 --error 0.01` | 8 817 |
| `simplify --ratio 0.25 --error 0.01` | 8 817 |
| `simplify --ratio 0.10 --error 0.01` | 8 817 |
| `dequantize` + `weld` + `simplify --ratio 0.10 --error 1` | 8 665 |

**Le simplificateur s'arrête à 8 665 triangles (−16 %) quel que soit le ratio demandé.** La cause est dans
le maillage, pas dans l'outil : **2,0 sommets par triangle** (20 560 sommets pour 10 266 triangles, là où un
maillage soudé en aurait ~5 000). Genex produit du facetté, chaque face a ses propres normales, et les
coutures d'UV doublent encore les sommets ; meshoptimizer ne peut effondrer que les arêtes qui partagent
déjà leurs sommets. `weld` n'en récupère que 1 752.

**Conséquence, à dire clairement : je ne peux pas livrer de LOD de géométrie.** Pour l'obtenir il faudrait
régénérer des normales lissées (ou désouder/recoudre les UV), c'est-à-dire retoucher l'asset — un travail de
modélisation, pas un réglage de rendu. Si tu as besoin de moins de triangles, les deux seules issues sont :
une passe de lissage des normales sur les GLB (je peux la tenter, elle change le facetté en lisse — un choix
visuel, à valider), ou une nouvelle génération Meshy en plus basse densité (crédits, donc go de Salim).

## 3. LOD de texture — mesuré, gratuit, et c'est là qu'est l'argent

Puisque la géométrie pèse 24 Mio et les textures 80 Mio, **le seul levier réel sur la VRAM est la taille des
textures**. Mesuré sur `NL-1` et `TERM` réencodés par `gltf-transform resize` :

| niveau | disque (NL-1) | textures VRAM | total perso | **pack (5)** |
|---|---:|---:|---:|---:|
| 1024² (actuel) | 1,21 Mio | 16,00 Mio | 20,29 Mio | **103,90 Mio** |
| 512² | 0,93 Mio | 4,00 Mio | 8,29 Mio | **43,90 Mio** |
| 256² | 0,83 Mio | 1,00 Mio | 5,29 Mio | **28,90 Mio** |

**Et c'est visuellement gratuit dans cette direction artistique**, mesuré et non supposé : même tick, même
graine, textures 1024 contre 512, différence de luminance sur blocs de 8 px (blocs de 8 px pour annuler la
graine de grain) :

| comparaison | tick | delta moyen | bloc max |
|---|---|---:|---:|
| 1024 vs 512 | t221, graine 19 (Night Lord à 3 m) | **−0,04/255** | +8,2 |
| 1024 vs 512 | t100, graine 3 (Night Lords à 20 m) | **−0,01/255** | +6,2 |
| 1024 vs 256 | t221, graine 19 (Night Lord à 3 m) | **−0,09/255** | +14,2 |

Le grain du post-traitement produit à lui seul 7 à 8 % de blocs au-dessus de 2/255 ; ces trois écarts sont
**en dessous de son plancher**. La raison est simple : un Night Lord est une forme à 30/255, on lit son
liseré, pas sa couture.

**Ce que je recommande** (à toi de trancher, c'est ton budget) :

| qui | textures | VRAM |
|---|---|---:|
| le chasseur le plus proche (0–8 m) | 1024² | 20,3 Mio |
| les trois autres, dès 8 m | 512² | 3 × 8,3 = 24,9 Mio |
| le Terminator (toujours au premier plan) | 1024² | 23,1 Mio |
| **total scène** | | **≈ 68 Mio** au lieu de 104 |

Ou, si tu veux la marge maximale : **512² partout, 43,9 Mio**, sans différence visible mesurable. Les
fichiers 512² sont produits et vérifiés : `/data/work/lod/out/{NL-1,TERM}-tex512.glb` (les autres se
régénèrent à l'identique en une commande).

## 4. Instanciation — ce qui partage quoi

**Les quatre chasseurs ne partagent rien.** Ce ne sont pas quatre copies d'un même modèle : quatre maillages
distincts (10 186 à 10 369 triangles, 19 273 à 20 560 sommets), quatre jeux de trois textures, quatre
matériaux. Rien à mutualiser entre eux, ni géométrie ni texture.

Ce qui est partagé aujourd'hui, et qui marche : **les clips d'animation**. Les cinq modèles ont les mêmes
24 os et les mêmes noms de nœuds ; un `walk` peut être joué par n'importe lequel des cinq. C'est déjà ce que
fait le rendu : un jeu de 10 clips, cinq mixers.

**Ce qui ne s'instancie pas : l'animation.** `InstancedMesh` de three.js partage une matrice de modèle et
une pose ; le skinning calcule les matrices d'os **par instance dans le shader**, ce qui n'existe pas dans
le matériau standard. Quatre chasseurs qui *partagent un squelette* au sens du fichier ne peuvent pas
partager une pose : ils ont chacun la leur. Donc :

- **4 SkinnedMesh + 1 pour le Terminator = 5 draw calls**, quoi qu'on fasse, tant qu'ils bougent
  indépendamment ;
- **5 mixers**, 5 squelettes de 24 os, 5 hiérarchies de nœuds ;
- **114 329 sommets skinnés par image** (4 influences chacun) — c'est le chiffre à mettre dans ton budget
  GPU, et il ne baisse pas avec l'instanciation.

Ce qui *est* possible si un jour il faut 20 Night Lords identiques : une seule géométrie et un seul jeu de
textures, mais toujours un draw call par personnage, sauf à écrire un shader de skinning instancié (texture
d'os par instance). **Avec quatre chasseurs, ça ne vaut pas une ligne de code** : on économiserait de la
mémoire qui est déjà payée, pas des draw calls.

## 5. Ce que ce manifeste ne dit pas

- **Les fps et le coût GPU réel** (skinning, 5 squelettes, ombres) : pas de GPU sur cette machine, le rendu
  logiciel (SwiftShader, 6–10 fps) n'est pas transposable. La VRAM ci-dessus est calculée à partir des
  en-têtes, elle est exacte ; le temps de frame, non.
- **Le coût CPU des 5 mixers** n'est pas mesuré non plus.
- La ligne « 2,0 sommets par triangle » explique le blocage du simplificateur, elle ne prouve pas qu'un
  lissage des normales suffirait — il faudrait l'essayer sur un fichier pour le dire.

## 6. Le test de graine pour le flash — répondu, et non

Abaddon demandait de chercher une graine où la rafale du bolter tombe avec un prédateur à moins de 6 m dans
le cône de bouche. **Fait, et la réponse est non — par géométrie, pas par malchance.**

300 manches balayées (100 graines × 3 modes) puis 50 manches sur 360 ticks : 47 rafales ont un Night Lord
vivant dans le cadre à moins de 9 m, **la meilleure à 6,25 m**. Mesure sur celle-là, même tick, `?impact=0`
contre flash, blocs de 8 px : image entière **+4,9/255**, sol devant **+10,6**, mur de droite **+11,0**,
**le prédateur +1,6**.

La raison est arithmétique : la lumière est 1,9 m devant le Terminator, à 6 m il ne reste que 1/r², et son
liseré était déjà à 122/255 par la lumière froide. Un Night Lord ne s'éclairerait qu'à 2–3 m **à travers** la
gueule du bolter, et là il n'y a plus de plan, juste un mur de tôle. Chercher d'autres graines ne peut pas
contredire ça. **D'accord pour le provoquer en mode démo** : un `?demo=` qui place la meute à 3 m dans l'axe
au moment de la rafale, clairement étiqueté comme mise en scène — jamais présenté comme une capture de
simulation.
