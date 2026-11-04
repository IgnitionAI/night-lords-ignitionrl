# Le décor

Jusqu'ici la scène était un plan, sept boîtes et une grille : le « grey-box ». Ce fichier décrit ce qui l'a
remplacé, ce que ça coûte, et ce que ce n'est **pas**.

`?env=0` rend l'ancien grey-box, tick pour tick, pour les comparaisons. La collision n'a pas bougé d'un
centimètre : c'est toujours `PILLARS` et `ARENA` de `src/sim.ts` qui décident où l'on passe.

## Ce qui est construit

| élément | géométrie | répétition |
|---|---|---|
| pont | un plan de 40 × 24 m, tôle rivetée | 1 appel |
| plaques de tôle | texture procédurale 512², rivets et joints de soudure, motif 6,6 × 6 m | — |
| membrures de pont | nervure tous les 3 m dans la largeur, deux lisses de rive | 1 appel (15 instances) |
| membrures de coque | nervures verticales tous les 2,5 m sur les quatre parois | dans le même appel |
| poutres de plafond | une tous les 4 m + deux lisses longitudinales, à 5,55 m | 1 appel (12 instances) |
| plafond | un plan à 5,75 m, mat et sombre | 1 appel |
| pilastres | socle, fût, chapiteau, huit nervures verticales par bloc | 4 appels (7 instances chacune) |
| bandeaux de secours | émissif ambré sous l'arête de chaque pilastre + veilleuses de 1,2 m | 1 appel |

Tout ce qui se répète passe par `InstancedMesh` sur une **boîte unitaire mise à l'échelle par instance** : la
coque entière coûte sept appels de rendu, quel que soit le nombre de nervures.

## Ce que ça coûte

Compté par traversée de scène au même tick (t235, graine 18, `?autoplay=march`) :

| | grey-box | décor |
|---|---:|---:|
| appels de rendu | 22 | **29** |
| triangles | 62 492 | **64 798** |
| lampes ponctuelles réelles | 7 | **3** |
| lumières au total | 16 | **12** |
| textures | 22 | **25** |

+7 appels, +2 306 triangles (+3,7 %), **et quatre lumières en moins**. Les sept lampes rouges des pilastres
coûtaient sept éclairages par pixel sur cinq maillages skinnés — la dépense la plus lourde de la scène. Elles
sont devenues des bandeaux émissifs : la lueur rouge est peinte, la lumière ne l'est plus. `?lights=all` rend
les sept lampes, pour comparer.

Les trois textures sont **générées en canvas au chargement** (tôle, rugosité, coque) : aucun fichier, aucune
requête, rien à télécharger, environ 0,4 Mio de VRAM au total.

## Ce que ce n'est pas

Ce n'est **pas** un asset sculpté. Ni un modèle acheté, ni une génération Genex : c'est de la géométrie
construite et des textures calculées, ce qui règle d'un coup la question de la licence et celle du crédit.
Ce que ça ne donne pas : les formes organiques qu'un sculpteur produit (tuyauteries enchevétrées, caisses
renversées, caillebotis déformé, cadavres). Un pont de vaisseau se prête bien à la boîte ; un décor
d'épave, non.

Si on veut ces formes-là, il faut un modèle — et donc un budget et une licence à trancher. Le décor actuel
est la version qui ne demande ni l'un ni l'autre.
