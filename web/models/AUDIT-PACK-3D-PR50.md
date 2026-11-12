# Audit factuel du pack 3D versionné (PR #50)

Audit en lecture seule du commit `019122983d5c92806ff2a1ecffa7fb9fbbf60f5c`
(`Ajouter les modèles 3D optimisés au dépôt`, PR #50, fusionné dans `main`).
Aucun GLB, aucune politique, ni `src/sim.ts` / `web/main.ts` n’ont été
modifiés. Les collisions de props (#46) sont hors périmètre.

**Licence / droits — rappel, sans extension.** Le manifeste
(`web/models/MANIFESTE.md`) dit que Salim a demandé la publication des
modèles optimisés dans le dépôt public, et que cette décision **n’est pas**
une validation juridique des droits Games Workshop ni des conditions de
redistribution Genex. Ce rapport ne statue pas davantage.

## Méthode

Mesures prises le 2026-11-09 sur le checkout `0191229`, Node v22.23.4.

| outil | usage |
|---|---|
| `find` / `stat` / `du` / `sha256sum` / `git hash-object` | présence, octets, empreintes |
| chunk JSON du GLB (Python `struct`) | `asset.generator`, comptes, extensions |
| `@gltf-transform/core` 4.5.1 + `inspect` CLI | triangles, accesseurs, skins, clips, textures |
| `three@0.162.0` `GLTFLoader.parse` (Node, stub `Image`) | AABB skinée vs géométrie brute |
| lecture de `web/main.ts` | chargeur, mixers, `DT`, LOD, repli |

Le rendu navigateur n’a **pas** été lancé : pas de GPU utile ici, et les
textures WebP n’ont pas de décodeur DOM. Les AABB three.js sont donc
géométriques (les textures ont échoué à `blob:fake` ; ça n’affecte pas
positions / os / clips).

# 1. Inventaire

Attendu par le manifeste post-#50 : **26 fichiers, ~14,2 Mo** — 5 persos
1024², 5 persos 512², 10 clips, 6 props.

Mesuré :

```
find web/models -name '*.glb' | sort | wc -l     → 26
find web/models -name '*.glb' -print0 | du -bc --files0-from=- | tail -1
14222572 octets  (= 14,222 572 Mo décimaux ; 13,564 Mio)
```

Les 26 chemins attendus sont tous présents. Aucun GLB surnuméraire.

### 1.1 Table globale

Tailles = `stat -c%s`. SHA git = `git hash-object`. SHA-256 = `sha256sum`.
Triangles = indices/3 (gltf-transform). `gen` lu dans le chunk JSON.

| fichier | octets | SHA git | SHA-256 | tris | nœuds | mat. | tex (format) | ext. | skins | clips |
|---|---:|---|---|---:|---:|---:|---|---|---:|---:|
| `NL-1.glb` | 1 270 544 | `de14e32d8cae…` | `2de26112dc24…` | 10 266 | 26 | 1 | 3×1024² WebP VP8 | `EXT_texture_webp`, `KHR_mesh_quantization` | 1 | 1 |
| `NL-1-512.glb` | 980 268 | `fc9ae1136d96…` | `2044f860b499…` | 10 266 | 26 | 1 | 3×512² WebP VP8 | idem | 1 | 1 |
| `NL-1-walk.glb` | 57 748 | `3242c130985e…` | `1cf800298cf7…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `NL-1-run.glb` | 47 116 | `b37e4e985d35…` | `f6adb050f2be…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `NL-2.glb` | 1 291 784 | `f671e63d532e…` | `d94bb20cc4dd…` | 10 369 | 26 | 1 | 3×1024² WebP VP8 | quantize+webp | 1 | 1 |
| `NL-2-512.glb` | 979 448 | `8ab406cf11c4…` | `e60a1d376cfb…` | 10 369 | 26 | 1 | 3×512² WebP VP8 | idem | 1 | 1 |
| `NL-2-walk.glb` | 57 096 | `b85008848e53…` | `8e8cdb0702e5…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `NL-2-run.glb` | 46 456 | `6c6a1ed17659…` | `a21e86ae4772…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `NL-3.glb` | 1 217 256 | `0fbb7c3b18d7…` | `e749afb3a670…` | 10 360 | 26 | 1 | 3×1024² WebP VP8 | quantize+webp | 1 | 1 |
| `NL-3-512.glb` | 932 564 | `bb53a1d7b56f…` | `c344e2b4f710…` | 10 360 | 26 | 1 | 3×512² WebP VP8 | idem | 1 | 1 |
| `NL-3-walk.glb` | 57 788 | `c93e9b3ffba0…` | `5de9be10379f…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `NL-3-run.glb` | 47 176 | `97a9d1e1c63b…` | `cda6d5605f59…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `NL-4.glb` | 1 278 836 | `8981e634034e…` | `275ee58f7636…` | 10 186 | 26 | 1 | 3×1024² WebP VP8 | quantize+webp | 1 | 1 |
| `NL-4-512.glb` | 974 232 | `64330f856992…` | `b783aba0a6a5…` | 10 186 | 26 | 1 | 3×512² WebP VP8 | idem | 1 | 1 |
| `NL-4-walk.glb` | 57 200 | `634d46ae3dbd…` | `56d53cbe0cfc…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `NL-4-run.glb` | 46 576 | `ad2b3f353350…` | `b850c53bb879…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `TERM.glb` | 1 778 544 | `476f5388528f…` | `70ba8eb9e9e9…` | 20 609 | 26 | 1 | 3×1024² WebP VP8 | quantize+webp | 1 | 1 |
| `TERM-512.glb` | 1 510 824 | `63a570eb927c…` | `37c91656121a…` | 20 609 | 26 | 1 | 3×512² WebP VP8 | idem | 1 | 1 |
| `TERM-walk.glb` | 57 836 | `8e33d7c28df7…` | `aeb6aadf9e75…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `TERM-run.glb` | 47 216 | `c29094a59d66…` | `b67d2575f916…` | 0 | 26 | 0 | 0 | — | 0 | 1 |
| `props/chains.glb` | 275 700 | `9a1d263a0eda…` | `eda56b50ccbf…` | 3 547 | 1 | 1 | 3×512² WebP VP8 | `EXT_texture_webp` seul | 0 | 0 |
| `props/crate.glb` | 204 124 | `452b55b73259…` | `35250bcf0cb3…` | 3 064 | 1 | 1 | 3×512² WebP VP8 | webp | 0 | 0 |
| `props/debris.glb` | 254 180 | `1f2a1472973b…` | `9ee4c79a9a20…` | 3 537 | 1 | 1 | 3×512² WebP VP8 | webp | 0 | 0 |
| `props/pipes.glb` | 253 316 | `7e19f5e5c96b…` | `d3e40833b7a6…` | 4 271 | 1 | 1 | 3×512² WebP VP8 | webp | 0 | 0 |
| `props/reliquary.glb` | 208 436 | `e2b19c5256da…` | `0ac62128a761…` | 2 998 | 1 | 1 | 3×512² WebP VP8 | webp | 0 | 0 |
| `props/servitor.glb` | 290 308 | `1c2f540f487d…` | `03dd1f3e75e3…` | 3 778 | 1 | 1 | 3×512² WebP VP8 | webp | 0 | 0 |

SHA git et SHA-256 complets : section 7.

Sous-totaux mesurés :

| lot | octets | vs doc |
|---|---:|---|
| 5 poses 1024² | 6 836 964 (6,52 Mio) | `LOD-ET-INSTANCES.md` : **6,52 Mio** — OK |
| 5 poses 512² | 5 377 336 | non totalisé dans le manifeste |
| 10 clips | 522 208 (510,0 Kio) | LOD : **532 Kio** — écart de 10 Kio / ~2 % |
| 6 props | 1 486 064 (1,42 Mo) | `PROPS.md` : **1,42 Mo** — OK |
| **26 GLB** | **14 222 572** | manifeste / PR #50 : **14,2 Mo** — OK (Mo = 10⁶) |

`asset.generator` :

- poses et props : `glTF-Transform v4.5.1`
- clips walk/run : `Khronos glTF Blender I/O v4.5.51` (pas repassés dans
  gltf-transform ; pas de quantification)

Pas de Draco, pas de meshopt, pas de `KHR_materials_*` hors PBR standard.

# 2. Personnages — géométrie, squelette, textures

Tous les 10 GLB de pose (1024 et 512) :

- 1 primitive TRIANGLES, 1 matériau `BakedMaterial` (opaque, **doubleSided**),
  facteurs métal/rugosité = 1, albedo `[1,1,1,1]`
- cartes : `texture_0` (baseColor), `texture_0_metallic_roughness`, `normal`
  — pas d’émissif, pas d’occlusion dédiée
- 1 `SkinnedMesh` nœud `char1`, mesh `output_unwrapped`, scale nœud **×0,01**
- armature sœur (pas parente du mesh) : nœud `Armature` scale ×0,01 → enfant `Hips`
- 1 skin `Armature`, **24 os**, 24 inverse-bind matrices, `skeleton` glTF = null
- attributs : `POSITION:i16_norm`, `NORMAL:i16_norm`, `TANGENT:i16_norm`,
  `TEXCOORD_0:u16_norm`, `JOINTS_0:u8`, `WEIGHTS_0:u8_norm` ; indices u16
- 0 morph target

Sommets (POSITION count), identiques 1024/512 :

| rôle | sommets | tris | sommets/triangle |
|---|---:|---:|---:|
| NL-1 | 20 560 | 10 266 | 2,003 |
| NL-2 | 20 183 | 10 369 | 1,946 |
| NL-3 | 19 273 | 10 360 | 1,860 |
| NL-4 | 20 350 | 10 186 | 1,998 |
| TERM | 33 963 | 20 609 | 1,648 |
| **total** | **114 329** | **51 790** | |

Conforme à `LOD-ET-INSTANCES.md` (51 790 tris / 114 329 sommets). Le ratio
~2 sommets/triangle sur les NL est le facetté déjà documenté.

Noms d’os (ordre du skin, **identiques** sur les 5 rôles et leurs -512) :

```
Hips, Spine02, Spine01, Spine, neck, Head, head_end, headfront,
LeftShoulder, LeftArm, LeftForeArm, LeftHand,
RightShoulder, RightArm, RightForeArm, RightHand,
LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase,
RightUpLeg, RightLeg, RightFoot, RightToeBase
```

26 nœuds, mêmes noms et même ordre sur pose / 512 / walk / run / les 5 rôles.
Hiérarchie mesurée : `Armature → Hips → {Spine02, LeftUpLeg, RightUpLeg}` ;
tête `Head → {head_end, headfront}` ; `char1` est racine sœur de `Armature`.

Textures 1024 (exemple NL-1, octets image) : normal 216 640, albedo 127 046,
MR 102 810 — toutes 1024×1024 VP8. Variante 512 : 72 270 / 45 290 / 38 660
— 512×512 VP8. Géométrie 512 **identique** à 1024 (mêmes tris / sommets /
os / clip interné).

# 3. Dimensions (quantification)

Le manifeste : `Box3.setFromObject` lit la géométrie brute d’un mesh
quantifié (~0,02 m) ; la méthode correcte est
`SkinnedMesh.computeBoundingBox()` puis `box.applyMatrix4(mesh.matrixWorld)`
→ ~1,70 m. Cible runtime : NL 2,0 m (`NL_CFG.radius` 0,45), Terminator
2,6 m (`T_CFG.radius` 0,8).

Mesures three.js 0.162, pose au repos, **sans** le `scale` runtime :

| fichier | géométrie × matrixWorld (sans skin) | AABB skinée (méthode du manifeste) | `setFromObject` (cette version three) | facteur vers 2,0 m | vers 2,6 m |
|---|---:|---:|---:|---:|---:|
| NL-1 / NL-1-512 | 0,018 127 m (Y) ; boîte 0,02 × 0,018 × 0,014 | **1,699 976 m** ; min.y = +0,000 024 | 1,699 952 m | 1,176 49 | — |
| NL-2 / -512 | 0,020 000 m | **1,700 000 m** | 1,700 000 m | 1,176 47 | — |
| NL-3 / -512 | 0,020 000 m | **1,700 000 m** | 1,700 000 m | 1,176 47 | — |
| NL-4 / -512 | 0,020 000 m | **1,700 000 m** | 1,700 000 m | 1,176 47 | — |
| TERM / -512 | 0,020 000 m | **1,700 000 m** | 1,700 000 m | — | **1,529 41** |

`gltf-transform inspect` / `getBounds` restent à **±0,01 m** : ils ne
skinne pas. `dequantize` CLI laisse la même AABB 0,02 m (le ×0,01 du nœud
reste). C’est exactement le piège documenté.

Sur **three 0.162**, `setFromObject` a déjà rendu ~1,70 m (il passe par le
skin). Le 0,02 m se reproduit en lisant `geometry.boundingBox` ×
`matrixWorld` **sans** `computeBoundingBox` du `SkinnedMesh`. Le chargeur
(`measureHeight` dans `web/main.ts`) utilise la bonne méthode. Le repli
`h > 0.01 ? h : 1.7` est donc le filet anti-0,02 m.

Après échelle runtime (non appliquée ici, lue dans le code) : hauteur
visée 2,0 m / 2,6 m. NL-1 est 0,024 mm plus bas que 1,70 m avant échelle
— négligeable.

Hips monde (gltf-transform) : translation Y ≈ 1,013 m (NL-1), 0,918 m
(TERM) — le squelette est bien en mètres, pas le POSITION quantifié.

# 4. Animations

## 4.1 Clip interné dans la pose (idle)

Chaque pose 1024 et 512 contient **un** clip `Armature|clip0|baselayer` :

- 72 canaux = 24 os × (translation, rotation, scale)
- interpolation LINEAR
- **1 clé**, temps **0,033 333 s** (1/30 s) — durée nulle au sens « pas
  d’intervalle » (`t0 === t1`)
- `gltf-transform inspect` affiche `duration 0` (arrondi) / 72 keyframes
- cibles : les 24 os, **y compris** `head_end` et `headfront`
- pas de piste morph

Ce n’est pas un clip vide (les clés existent) ; c’est une pose figée d’une
frame. Le chargeur s’en sert comme `idle` (`model.animations[0]`).

Walk/run **ne sont pas** internés dans la pose : seulement `clip0`.

## 4.2 Fichiers dédiés walk / run

Tous les walk : nom `Armature|walking_man|baselayer`, 66 canaux, 32 clés,
LINEAR, première clé 0,033 333 s, dernière **1,066 667 s**.
Tous les run : nom `Armature|running|baselayer`, 66 canaux, 20 clés,
LINEAR, première 0,033 333 s, dernière **0,666 667 s**.

66 = 22 os × TRS. Os **non ciblés** (sur les 10 clips) : `head_end`,
`headfront`. Ils restent enfants de `Head` : pas un trou de retarget, les
feuilles suivent le parent. Aucune piste morph. Aucun canal à durée nulle
sur walk/run (toutes les 32/20 clés couvrent l’intervalle).

0 triangle, 0 mesh, 0 skin, 0 matériau : squelette + animation seulement.
Compatible avec `mixer.clipAction` sur la pose (ciblage par **nom** de
nœud). Les 26 noms de nœuds sont une bijection pose ↔ walk ↔ run.

Transforms de repos pose vs walk : 23 nœuds diffèrent à l’échelle
10⁻⁷–10⁻⁸ (bruit float Blender vs gltf-transform), pas une autre
hiérarchie.

Le LOD dit « un clip peut piloter n’importe lequel des cinq » : **noms
d’os identiques, oui**. Les 10 fichiers ne sont **pas** des copies
binaires (tailles et SHA distincts). Le chargeur charge
`/web/models/${name}-walk.glb` **par rôle**, pas un jeu unique partagé.

## 4.3 Locomotion dans les pistes

Translation des Hips (valeurs locales × 0,01 pour passer en mètres) :

| clip | ΔX m | ΔY m (bob) | ΔZ m | horizontal |
|---|---:|---:|---:|---|
| NL-1 walk | 0 | 0,072 | 0 | 0 |
| NL-1 run | 0 | 0,073 | 0 | 0 |
| TERM walk | 0 | 0,066 | 0 | 0 |
| TERM run | 0 | 0,067 | 0 | 0 |

`LeftFoot` / `RightFoot` / orteils : translation locale **constante**
(Δ < 10⁻¹⁵ m). Le cycle est entièrement dans les **rotations**. Pas de
root motion : le déplacement monde vient de la sim. Cohérent avec le
glissement documenté si `timeScale = 1` n’est pas recalé sur 6 m/s
(NL) / 2,5 m/s (Terminator).

Cycle × vitesse sim, **sans** mesure de longueur de pas au sol (il
faudrait skinning image par image) :

- NL au run : 6 m/s × 0,6667 s = **4,00 m** par cycle
- Terminator au walk : 2,5 m/s × 1,0667 s = **2,67 m** par cycle

Le glTF n’a pas de flag loop ; three.js `AnimationAction` boucle par
défaut (`LoopRepeat`). Le code ne touche ni `setLoop` ni `timeScale`.

Première clé à 1/30 s (pas à t = 0) sur tous les clips : à la boucle,
retour 1,0667 → 0 pendant 33 ms avant la première clé. Non visualisé ici.

# 5. Props

Contrat (`web/PROPS.md`) : un maillage, un matériau, instanciable ; pas
dans la sim.

| prop | tris (fichier = table PROPS) | nœuds / mesh / mat / skin / anim | AABB native (m) X×Y×Z | scale nœud | `PROP_KINDS` (axe, taille visée) | k = size/axe |
|---|---:|---|---|---|---|---:|
| chains | 3 547 | 1 / 1 / 1 / 0 / 0 | 0,177 × 0,862 × 0,996 | 1 | z, 2,6 m | 2,610 |
| crate | 3 064 | 1 / 1 / 1 / 0 / 0 | 0,759 × 0,480 × 0,999 | 1 | z, 1,15 m | 1,151 |
| debris | 3 537 | 1 / 1 / 1 / 0 / 0 | 0,910 × 0,464 × 0,987 | 1 | z, 1,8 m | 1,824 |
| pipes | 4 271 | 1 / 1 / 1 / 0 / 0 | 0,487 × 0,999 × 0,763 | 1 | y, 2,4 m | 2,404 |
| reliquary | 2 998 | 1 / 1 / 1 / 0 / 0 | 0,320 × 0,997 × 0,474 | 1 | y, 2,4 m | 2,407 |
| servitor | 3 778 | 1 / 1 / 1 / 0 / 0 | 0,580 × 0,717 × 0,973 | 1 | z, 1,5 m | 1,542 |

- pas de `KHR_mesh_quantization` ; POSITION f32 ; pas de TANGENT ni JOINTS
- 3 textures 512² WebP (albedo + MR + normal), matériau opaque **pas**
  doubleSided, métal 1
- noms `tripo_mesh_*` / `tripo_node_*` / `tripo_material_*` (pipeline Genex/Tripo)
- AABB native ~1 m sur l’axe dominant : ce n’est pas une échelle « cassée »,
  le chargeur renormalise (`size / max(axe, 1e-4)` + pose au sol/plafond)
- `loadProps` prend le **premier** `isMesh` : un seul mesh, donc OK

Instances dans `PROP_PLACES` (`web/main.ts`) : reliquary 3, pipes 3,
chains 4, **crate 6**, debris 4, servitor 2 → **22**. `PROPS.md` écrit
crate **5** et total 22, ce qui ferait 21. Le code et le total « 22 »
sont d’accord ; la colonne instances de crate dans la table est fausse.

# 6. Runtime (`web/main.ts`) vs manifeste vs fichiers

Lu, pas exécuté dans un navigateur.

| contrat | code | fichiers | verdict |
|---|---|---|---|
| `GLTFLoader` pose + walk/run | `loadModelGLB(name)` puis `loadGLB(…/${name}-walk\|run.glb)` | chemins exacts | OK |
| 512 par défaut, `?tex=1024` | `TEX = qs.get('tex') === '1024' ? 1024 : 512` ; 512 tente `-512.glb` puis pose 1024 | 5 variantes -512 présentes | OK |
| clips walk/run **sans** suffixe -512 | toujours `name-walk/run.glb` | pas de `*-walk-512` | OK (et cohérent : 0 texture) |
| mixer par perso, `DT` pas le temps réel | `new AnimationMixer(root)` ; `updateRigs(DT)` depuis `tick()` ; `playRig` → `mixer.update(dt)` ; `DT = 0.1` | — | OK |
| fondu 0,15 s marche/course | `fadeOut(0.15)` / `fadeIn(0.15)` | — | OK |
| `timeScale = 1` | jamais assigné (défaut three = 1) | durées 0,6667 / 1,0667 s | OK, glissement possible |
| orientation +Z vs sim +X | `root.rotation.y = π/2` ; le groupe garde `-facing` | — | OK |
| échelle collider via skin AABB | `measureHeight` = computeBoundingBox + matrixWorld | 1,70 m mesuré | OK |
| repli capsule si absent | `catch` → `console.warn` + capsule/cubes laissés visibles | — | OK (non exercé : fichiers présents) |
| props absents → scène #44 | `loadProps` catch par `kind`, `propStats.missing` | 6/6 présents | OK |
| « passage marche/course selon le déplacement » | NL : `moved ? 'run' : 'idle'` — **jamais `walk`** si run existe. TERM : `t.moving ? 'walk' : 'idle'` — **jamais `run`** | 10 clips chargés | **divergence** : walk NL et run TERM sont chargés et inutilisés (sauf repli si l’autre clip manque) |
| pick par nom | `clips.find(c => c.name.toLowerCase().includes('walk'\|'run'))` | `walking_man`, `running` | OK |
| idle = clip interné | `model.animations[0]` = `clip0` | 1 frame | OK ; idle n’est pas un cycle de marche |
| vitesses | `NL_CFG.speed = 6`, `T_CFG.fwd = 2.5` | run 0,67 s / walk 1,07 s | le mapping NL→run et TERM→walk **suit les vitesses de sim**, pas le texte « marche/course selon le déplacement réel » |

Autres écarts doc ↔ dépôt (pas des bugs fichier) :

- `LOD-ET-INSTANCES.md` décrit encore les fichiers du disque partagé comme
  source, et « 10 fichiers anims ». Les chiffres géométrie/VRAM 1024
  **recollent** aux GLB du dépôt ; le 532 Kio des clips est légèrement
  haut (522 208 o).
- `README.md` ouvre encore sur « prototype gris (cubes, pas d’habillage) »
  alors que plus bas il documente les GLB versionnés.
- Commentaire de tête de `web/main.ts` : « Prototype gris : cubes et
  capsules » — le chargeur riggé est en dessous.
- Budget « 15 textures 1024 » du manifeste d’intégration : vrai pour
  `?tex=1024` ; le défaut actuel est 15 × 512².

# 7. Empreintes complètes

```
# git hash-object + taille
    980268  fc9ae1136d96b2ccd75a532405b397458c0b9d08  web/models/NL-1-512.glb
   1270544  de14e32d8caef07f36ccbc97255d463ddbc3ed82  web/models/NL-1.glb
     47116  b37e4e985d35651deb0b4c434f03aabaa405dc0e  web/models/NL-1-run.glb
     57748  3242c130985ecfbda744dbb27f63995aa514033e  web/models/NL-1-walk.glb
    979448  8ab406cf11c492bb0c9754a2d9f9b85323778de6  web/models/NL-2-512.glb
   1291784  f671e63d532e44739a74bbb4320652aeb55a989a  web/models/NL-2.glb
     46456  6c6a1ed176597f4dd7c044122c975a08cb27bd1d  web/models/NL-2-run.glb
     57096  b85008848e5311e1139b80bdae3f3e4f7325fd38  web/models/NL-2-walk.glb
    932564  bb53a1d7b56fda6eaa538505c6e22c92d2825611  web/models/NL-3-512.glb
   1217256  0fbb7c3b18d7b75acafe893fa0aa404b1338e301  web/models/NL-3.glb
     47176  97a9d1e1c63b49d50ee5897ecef47af7f2ccccf0  web/models/NL-3-run.glb
     57788  c93e9b3ffba00f865ec6515355078fdf8a84e8cc  web/models/NL-3-walk.glb
    974232  64330f856992fbb217cad1441ed3b5d961206cfd  web/models/NL-4-512.glb
   1278836  8981e634034e66a8487717dfbbb6d8743de8f8a7  web/models/NL-4.glb
     46576  ad2b3f35335081cb7583df8af62601a42e54c29a  web/models/NL-4-run.glb
     57200  634d46ae3dbd27105c2ef738a021c7b45f998282  web/models/NL-4-walk.glb
   1510824  63a570eb927c052ab20d10e1c509fec38111f230  web/models/TERM-512.glb
   1778544  476f5388528f0b619da94a43d6dfea1f55cd21ad  web/models/TERM.glb
     47216  c29094a59d6669aa182aff3a01f3a11cdb170928  web/models/TERM-run.glb
     57836  8e33d7c28df7b9b00d1bde32c0da736c94c42393  web/models/TERM-walk.glb
    275700  9a1d263a0eda33af7df4fa81ee4a2b154e609e05  web/models/props/chains.glb
    204124  452b55b73259d1805104499648997e1534c1b8dc  web/models/props/crate.glb
    254180  1f2a1472973b97c4304a4b47fa135fe4fac01dd0  web/models/props/debris.glb
    253316  7e19f5e5c96b50eadd0c2678a11a2c3974c6122b  web/models/props/pipes.glb
    208436  e2b19c5256da62ecaafaff21d568bb90f2b66491  web/models/props/reliquary.glb
    290308  1c2f540f487d66da0acf85e0ccfa51b85e8694e0  web/models/props/servitor.glb

# sha256sum
2044f860b49996495f1f9dda5471db6b76a0a3bd45e02707988e65fb654fe520  web/models/NL-1-512.glb
2de26112dc243f541a5dbc8a5229ba3acee21ade88eb9d215dd56e963b2642f7  web/models/NL-1.glb
f6adb050f2be85abe16cdcb6c2454deb5b4a2509b218de50f7451c2d52a44997  web/models/NL-1-run.glb
1cf800298cf7be6e89e45b655b3b71019adf073e8126e93249043cc2c0d72eb0  web/models/NL-1-walk.glb
e60a1d376cfb38cfc323d9929004f50f9f4549cd9804b141a744ede58a4e1902  web/models/NL-2-512.glb
d94bb20cc4dd6d1709c6817223d9884e9556277e9cc81ee7bb00833b6b85383d  web/models/NL-2.glb
a21e86ae47722ea2f9ddaef3788b20ff04c963f75dcfda2a0000eea1d7fd2e16  web/models/NL-2-run.glb
8e8cdb0702e55cb9aeb50767ce3ff2a6a2a3acd7cf7c81fd9ae954dc51819a25  web/models/NL-2-walk.glb
c344e2b4f71011f61ec8741fc10c93b05759fd1a67927d374b6fbd5b763e0908  web/models/NL-3-512.glb
e749afb3a6700d379b2f96cb24665d965a048ed69ab3b59434c99da17d4f52a2  web/models/NL-3.glb
cda6d5605f5968cc48602400c4e2e9305730dff0cdf5da670a23510ac9e536b8  web/models/NL-3-run.glb
5de9be10379f2d83e5eceb7e5de67d4219cc09270adfc8ef8a98a5729da3306b  web/models/NL-3-walk.glb
b783aba0a6a5b253de0635357427505f9b19a675ae8d8f59a0e1c13b1dda43c0  web/models/NL-4-512.glb
275ee58f7636a2e207ee6b170bd38e0eedadc616f876ace41d25d91ecedb64f6  web/models/NL-4.glb
b850c53bb87975df1c9a951bae40b2cecfebd8332b5c7c1e693a8c30a9819cf3  web/models/NL-4-run.glb
56d53cbe0cfc3306594845e343f6cf12cb424c81b408277b5d1b663f000fb938  web/models/NL-4-walk.glb
37c91656121a9824a6dff71e1e9334983319601ac30862aa3a42cee9183fa2e8  web/models/TERM-512.glb
70ba8eb9e9e97ebd5fb89be657534fa830466195fbb34ef0432ccc438d70080d  web/models/TERM.glb
b67d2575f916bdc82d7b3921c102deae4a427b79739bbdddf52f0b22d136f4f1  web/models/TERM-run.glb
aeb6aadf9e7513162c4f68cd7278e940ceb3822cc5158c4e3b37d00749ea893e  web/models/TERM-walk.glb
eda56b50ccbfc1e61e6af1a34f27ee9c88cdf65a82624e00e1ddc5a6aa173296  web/models/props/chains.glb
35250bcf0cb3aa95ead1168781432d6b2cd3ad20bca124e1549829e7eec0c12f  web/models/props/crate.glb
9ee4c79a9a20f2ac0854ca8e80e6d91ebbfea71dad5024289235e6c70ed47179  web/models/props/debris.glb
d3e40833b7a6f79541f7bc78c8243ca354032a5bf4bb1351b900c38ecb6f0089  web/models/props/pipes.glb
0ac62128a7615518063dfb7b077558d5e1c039098a14056ca0a9f6b1c67fa511  web/models/props/reliquary.glb
03dd1f3e75e3bcae8d072bca19341617d69396ed824d0e81c393edeb51dc70e9  web/models/props/servitor.glb
```

# 8. Écarts, risques, limites

## Écarts (faits)

1. **Walk NL / run TERM jamais joués** tant que l’autre clip existe. Le
   manifeste parle d’un fondu marche/course selon le déplacement ; le code
   fait binaire run/idle (NL) et walk/idle (TERM), ce qui colle aux
   vitesses 6 m/s et 2,5 m/s mais pas au texte.
2. **Idle = 1 frame à 0,033 s**, pas un cycle. Un NL arrêté ou mort joue
   `clip0`, pas une pose marche.
3. **`head_end` / `headfront` absents des 66 pistes walk/run** (présents
   sur idle). Suivi parent, retarget pas cassé.
4. **Clips Blender bruts** vs poses gltf-transform quantifiées. Noms
   d’os alignés ; pas besoin de retarget.
5. **`PROPS.md` : 5 caisses** vs **6** dans `PROP_PLACES` (total 22 OK).
6. **532 Kio** de clips documentés vs **522 208 o** mesurés.
7. Doc d’intro README / commentaire `web/main.ts` encore « grey-box ».
8. Sur three 0.162, `setFromObject` n’est plus le mentir-0,02 m ; le
   mentir reste `geometry.boundingBox` sans skin.

## Risques (pas des défauts fichier)

- Glissement pied/sol : clips in-place, `timeScale = 1`, NL 4,00 m/cycle
  au run, TERM 2,67 m/cycle au walk — **non visualisé**.
- Première clé à 1/30 s : possible micro-saut en boucle.
- Mixer avancé par pas de 0,1 s : ~6–7 poses par cycle de run, ~10 par
  walk. Déterministe (`?shot=`), mais cadencé à 10 Hz côté animation.
- Props sans collision : déjà écrit dans `PROPS.md` ; hors #46.
- VRAM : non re-mesurée GPU. Calcul d’en-tête inchangé : 5×3×512²×4 ×4/3
  ≈ 20 Mio de textures avec mips au défaut ; ×4 en `?tex=1024`.

## Limites de mesure

- Pas de capture navigateur, pas de fps, pas de vérif visuelle du fondu
  ni du glissement.
- AABB three.js sans textures décodées (géométrie et os seulement).
- Longueur de pas au sol non reconstruite (il faudrait évaluer le skin
  à chaque clé).
- `gltf-transform inspect` arrondit les durées (`clip0` → 0 s, walk → 1 s) ;
  les durées ci-dessus viennent des accesseurs TIME (f64).
- Ce rapport n’est pas un avis de droits GW/Genex.

# 9. Commandes (extraits)

Inventaire :

```
find web/models -name '*.glb' | sort | wc -l
find web/models -name '*.glb' -print0 | du -bc --files0-from=- | tail -1
find web/models -name '*.glb' | sort | while read f; do
  printf '%10s  %s  %s\n' "$(stat -c%s "$f")" "$(git hash-object "$f")" "$f"
done
find web/models -name '*.glb' | sort | xargs sha256sum
```

Inspect CLI (exemples) :

```
npx @gltf-transform/cli@4.5.1 inspect web/models/NL-1.glb
npx @gltf-transform/cli@4.5.1 inspect web/models/NL-1-walk.glb
npx @gltf-transform/cli@4.5.1 inspect web/models/props/crate.glb
npx @gltf-transform/cli@4.5.1 dequantize web/models/NL-1.glb /tmp/NL-1-deq.glb
```

Sortie `inspect` NL-1 (tronquée) : version 2.0, generator glTF-Transform
v4.5.1, extensions `EXT_texture_webp, KHR_mesh_quantization` **required**,
bbox scène `[-0.01, -0.00906, -0.00693] … [0.01, 0.00906, 0.00693]`,
mesh `output_unwrapped` 10 266 tris / 20 560 verts, POSITION i16_norm,
3 WebP 1024², gpuSize 5,59 MB/texture.

Walk : generator Khronos glTF Blender I/O v4.5.51, 0 mesh, animation
66 canaux, bbox scène Infinity (pas de géométrie).

Crate : 3 064 tris, 3 314 verts, POSITION f32, 3 WebP 512², 0 animation.

Hauteurs three.js (Node, `GLTFLoader.parse`) : voir §3 — NL/TERM skin
**1,700 m** ; géométrie brute **0,018–0,020 m**.
