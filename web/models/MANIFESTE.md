# Intégration des modèles riggés — manifeste et budget

## Provenance

Cinq personnages (4 Night Lords + 1 Terminator) et 10 clips de marche/course, générés par Genex et
déjà payés. Source sur le disque partagé :
`Shared/team/pipeline/demo-night-lords/assets/rigged-opt/` et `.../anims/`.
Optimisation `gltf-transform 4.5.1` (quantize + textures WebP) : voir `MANIFESTE.md` du pipeline.

**Ces fichiers ne sont pas dans le dépôt.** Les termes de redistribution des sorties Genex n'ont pas
été vérifiés, et le dépôt est public. `web/models/` est donc ignoré par git ; pour lancer la démo avec
les modèles, copier les 15 fichiers dans `web/models/` :

    cp -r <assets>/rigged-opt/NL-{1,2,3,4}.glb <assets>/rigged-opt/TERM.glb web/models/
    for f in <assets>/anims/*.glb; do cp "$f" "web/models/$(basename "$f" .glb | sed 's/_walk$/-walk/;s/_run$/-run/').glb"; done

Le chargeur échoue proprement : sans ces fichiers, chaque rôle garde sa capsule et la console signale
le modèle absent. Le prototype reste jouable.

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

## Distribution — décision

Les GLB ne rentrent pas dans le dépôt public. Honsou vérifie les termes Genex/Meshy, **Abaddon
tranche** : un `git add` sur un dépôt public est une décision de conformité, pas de plomberie. Le
chargeur dégrade proprement vers les capsules, vérifié sur `main` propre.

## Ce que le code fait

- `GLTFLoader` sur `<role>.glb` (pose + clip de repos) et `<role>-walk.glb` / `<role>-run.glb`.
- Un `AnimationMixer` par personnage, avancé de `DT` dans `tick()` — pas du temps réel, donc une
  capture `?shot=N` donne la même pose à chaque fois.
- Passage marche/course selon le déplacement réel du personnage ; fondu de 0,15 s. Le Terminator suit
  `t.moving`, les Night Lords leur delta de position.
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

## Ce qui n'est pas mesuré ici

- **fps** et coût GPU du skinning : 5 squelettes de 24 os, 120 matrices mises à jour puis envoyées au
  GPU à chaque tick, plus les mêmes 120 matrices dans la passe d'ombre. Non mesurable dans cet
  environnement (pas de GPU, rendu logiciel à 6–10 fps non transposable). À relever sur une vraie
  machine ; si le cadre passe sous 60 fps, le plan B est un LOD de modèle, **pas** la suppression des
  ombres (elles portent la lecture des silhouettes).
- Synchronisation pied/sol : les clips sont joués à `timeScale = 1` (course 0,67 s, marche 1,07 s) sans
  recalage sur la vitesse réelle (6 m/s et 2,5 m/s). Un glissement est visible de près.
