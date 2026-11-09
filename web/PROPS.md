# Les props sculptés

Le décor de #44 est de la géométrie **construite** : il donne l'architecture — tôle, membrures, pilastres — et
s'arrête là où commence le travail d'un sculpteur : une épave, une tuyauterie enchevêtrée, un cadavre.
Ce fichier décrit les six modèles qui comblent ce trou, ce qu'ils coûtent, et ce qu'ils ne font pas.

`?props=0` rend la scène de #44 tick pour tick, pour les comparaisons. `?debug=1` publie les compteurs de
rendu dans `window.__SC()`.

## Ce qui est livré

Six modèles générés le 04/11/2026 par Genex (`kind: model`, prompt texte, texture PBR), **35 crédits pièce,
210 crédits le lot**. Les identifiants de génération sont dans `Shared/team/pipeline/demo-night-lords/assets/props/`.

| prop | rôle dans la scène | instances | triangles | sur disque |
|---|---|---:|---:|---:|
| `debris` | tas de tôle déchirée et de membrures tordues | 4 | 3 537 | 0,24 Mo |
| `crate` | caisse d'armement renforcée, peinture écaillée | 5 | 3 064 | 0,19 Mo |
| `pipes` | rameau de tuyauterie industrielle, vannes et manomètres | 3 | 4 271 | 0,24 Mo |
| `chains` | grappe de chaînes et de câbles arrachés, pendant du plafond | 4 | 3 547 | 0,26 Mo |
| `reliquary` | niche-reliquaire gothique, statue encapuchonnée | 3 | 2 998 | 0,20 Mo |
| `servitor` | serviteur mort effondré contre une cloison | 2 | 3 778 | 0,28 Mo |

Les six sont **un seul maillage, un seul matériau** chacun : c'est ce qui permet de les instancier. Une
`InstancedMesh` par type, donc **six appels de rendu** pour les 22 instances.

## La chaîne d'optimisation, mesurée

Les bruts Genex pèsent 14 à 16 Mo pièce (90 Mo au total) avec des textures **4096²** et 139 000 à 145 000
triangles — hors de question pour une scène qui en compte 65 000. Filtre appliqué, dans cet ordre :

```
gltf-transform weld                                     # soude les sommets (maillage facetté : ×2 inutile)
gltf-transform simplify --ratio ≈4000/tris --error 0.01 # cible 3000 à 4000 triangles
gltf-transform resize --width 512 --height 512          # textures 4096² -> 512²
gltf-transform webp                                     # 1,42 Mo au total sur disque
```

Résultat : **90 Mo → 1,42 Mo**, 24 Mio de VRAM (6 × 3 textures 512² avec mipmaps), et 3 000 à 5 700
triangles par modèle. `shots/props/compare-simplify.jpg` montre la version 4 % (15 000 à 26 000 tris) contre
la version livrée : à la taille où le jeu les montre, l'écart ne tient qu'au relief des textures normales.

## Ce que ça coûte au rendu

Compté par traversée de scène, même tick (t235, graine 18, `?autoplay=march`), `?props=0` en référence :

| | sans props | avec props |
|---|---:|---:|
| appels de rendu | 53 | **59** (+6) |
| triangles | 65 490 | **141 573** (×2,16) |
| textures | 29 | **47** (+18) |
| lumières | 12 | **12** |

Les triangles sont le prix : 76 083 de plus, parce qu'une instance redessine le maillage entier. C'est le
seul poste qui double. Aucune lumière, aucun triangle pour les chaînes suspendues au-delà de la brume : elles
sont dessinées comme le reste, c'est le brouillard qui les mange.

## Où ils sont posés, et pourquoi là

Trois familles de supports : les **piliers éclairés** (trois des sept portent une vraie lampe, `i % 3 === 0`),
les **piliers sombres**, et les **parois** mangées par la brume. Un prop est toujours **engagé dans son
support** : il ne dépasse que de ce qu'on voit, et la collision du pilier le rend infranchissable par
construction. Posé au milieu du couloir, on le traverserait — les props ne touchent pas à `src/sim.ts`.

Tout ce qui touche le sol reste à l'ouest de `x = 26`, sauf ce qui est engagé dans P7 : la meute apparaît
dans le rectangle `x 26-38` et un Night Lord matérialisé dans une caisse se verrait.

**Ce que ça ne garantit pas** : qu'un corps ne traverse jamais un tas de tôle. Un tas de débris de 1 m de
haut posé contre un pilier est dans le couloir ; si un Night Lord y passe, il le traversera. Le corriger
demande une collision par prop, donc une modification de la simulation — hors de ce dépôt-ci pour l'instant,
et à décider côté Khayon.

## Matières

Les textures Genex sont calibrées pour un studio : sous le projecteur du Terminator, une caisse devenait un
carton clair. Deux corrections, réglées à l'œil sur trois captures — l'albedo est assombri (`dim` 0,26 à 0,38
selon le prop) **et** refroidi (`0.74, 0.82, 0.96`), comme la coque qui les entoure. Métal plafonné à 0,35,
rugosité plancher à 0,70 : la lumière accroche les arêtes, pas les faces.

## Ce que ce n'est pas

- **Pas les sources brutes.** Les six versions optimisées sont versionnées dans `web/models/props/`, sur
  décision explicite de Salim. Les sources restent dans `Shared/team/pipeline/demo-night-lords/assets/props/`.
  Si un binaire est supprimé, `loadProps()` échoue proprement et la scène est exactement celle de #44.
- **Pas de la simulation.** Aucune collision, aucun rôle de jeu : ce sont des objets de décor.
- **Pas un asset Games Workshop.** Tout est généré, aucun élément extrait d'une publication.
