# Clips d’animation de combat

Les GLB personnages (`web/models/NL-*.glb`, `TERM.glb`) et leurs walk/run/idle viennent de **Genex**
(`character animate` / extras `genex: meshy-animation`). Pose : `clip0` (figé). Loco : `walking_man`,
`running`, **`Idle_3`**. Les clips de combat (mort, coup, esquive, griffes / poing, tir) arrivent à
part ; sans eux le rendu reste sur le procédural `#59`. Pas de touche à `src/sim.ts`, `NL_CFG.speed`,
`T_CFG.fwd`, ni aux fichiers walk/run (foulée gelée).

**Statut :**

- **Idle Genex livré** (`Idle_3`, 9,97 s, 30 fps, 72 pistes, in-place) : `web/models/<role>-idle.glb`.
- **Combat Genex** : compte en attente de vérif e-mail. Pas de clips combat versionnés.
- **Combat procédural polish** (`proc-*`, option a) : poses clés (anticipation / impact / récupération),
  courbes d’easing, poids (hanches + jambes), recul du torse, chute + rebond pour la mort.
  Griffes NL 0,46 s ; poing TERM 0,80 s (durée de charge). `?proc=legacy` rejoue les clips `#59`
  pour les planches avant/après. Captures : `docs/captures/combat-polish/`, vidéo
  `docs/videos/combat-polish.mp4`.
- Repli CC0 (Quaternius UAL) **écarté** : le retarget Mixamo→Genex (Spine vs Spine02) et les poses
  de repos `Hips` distinctes par perso casseraient la silhouette ; les durées one-shot (0,28–0,80 s)
  ne matchent pas les clips packs. Mixamo (Adobe) interdit si licence incompatible MIT. Aucun GLB
  combat n’est ingéré (`SHIPPED_EXTRA_ANIMS` = idle seulement).

## Fichiers attendus (chargés au runtime)

Même convention que walk/run : un GLB d’armature + clip, **sans** re-skin du personnage.

| rôle (fichier) | lore (Genex) | fichiers idle | fichiers combat (à venir) |
|---|---|---|---|
| NL-1 | Talos | `NL-1-idle.glb` (`Idle_3`) | `-attack` `-hit` `-dodge` `-death` |
| NL-2 | Uzas | `NL-2-idle.glb` | idem |
| NL-3 | Cyrion | `NL-3-idle.glb` | idem |
| NL-4 | Xarl | `NL-4-idle.glb` | idem |
| TERM | Terminator | `TERM-idle.glb` | `-attack` `-shoot` `-hit` `-dodge` |

Le chargeur runtime attache `NL-${i+1}` à `ROLES[i]` (`Talos`, `Uzas`, `Xarl`, `Cyrion`) : l’index 2
(Xarl) porte encore `NL-3.glb`. Ce n’est pas retouché ici (pas `src/sim.ts`).

Hashes `asset.extras.rig` (walk = idle = même perso) :

| fichier | rig |
|---|---|
| NL-1 | `e82397855ac7275e2904f00e86d92aba08962d0b3d3ccd1e70b8c8f01b11f61a` |
| NL-2 | `cc9775dfa331d50f8da5e77f0c46e2d587d1859db2939adf1f53ee907b8a5535` |
| NL-3 | `313240117126b94b7e681ad71e4833e0b198ec44d7a96bdcc102ea3e574dfaa5` |
| NL-4 | `469b17eeb80811cc9d5385e77726947e46bdc45786ed194a6d352b4f03f971cf` |
| TERM | `3e37e914c87e81ce473bf7dfed4a682d578dccb1e47eb70b3b477244b73e9521` |

Ne pas modifier `NL-*-walk.glb`, `NL-*-run.glb`, `TERM-walk.glb`, `TERM-run.glb`.

Ingestion : `bun scripts/ingest-combat-clips.ts --in clip.glb --role NL-1 --kind attack`.

## Noms de clips (`pickNamedClip`, sous-chaîne, casse ignorée)

Recommandé, comme les extras Genex existants : `Armature|<kind>|baselayer`.

| kind | clés acceptées |
|---|---|
| idle | `idle` (matche `Idle_3`) |
| attaque mêlée | `attack`, `claw`, `slash`, `melee`, `punch`, `strike`, `fist` |
| tir TERM | `shoot`, `bolt`, `fire`, `aim`, `shot`, `gun` |
| coup reçu | `hit`, `hurt`, `flinch`, `impact`, `react`, `stagger` |
| esquive | `dodge`, `evade`, `roll`, `sidestep` |
| mort NL | `death`, `die`, `dead` |

## Os — identiques NL et TERM (24 joints)

Ordre `skins[0].joints` (mesuré sur `NL-1.glb` et `TERM.glb`) :

`Hips`, `Spine02`, `Spine01`, `Spine`, `neck`, `Head`, `head_end`, `headfront`,
`LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`,
`RightShoulder`, `RightArm`, `RightForeArm`, `RightHand`,
`LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`,
`RightUpLeg`, `RightLeg`, `RightFoot`, `RightToeBase`.

Hiérarchie (enfant de `Armature` ; `char1` = mesh, pas un os) :

```
Armature (scale 0,01)
  Hips
    Spine02          ← première vertèbre (près des hanches)
      Spine01
        Spine        ← ceinture scapulaire (parent des épaules et du cou)
          neck
            Head
              head_end
              headfront
          LeftShoulder → LeftArm → LeftForeArm → LeftHand
          RightShoulder → RightArm → RightForeArm → RightHand
    LeftUpLeg → LeftLeg → LeftFoot → LeftToeBase
    RightUpLeg → RightLeg → RightFoot → RightToeBase
```

Les clips walk/run animent **22 os** (pas `head_end` / `headfront`). C’est accepté pour le combat.

**Ne pas mélanger les clips entre personnages** : chaque idle/walk est calé sur la pose de repos
`Hips` de son GLB (NL-1 ≈ `(-3.24, 101.30, -20.52)`, TERM ≈ `(-1.83, 91.82, 6.24)`).

### Mixamo / Quaternius (repli CC0 seulement)

Le nom `Spine` Mixamo est la **première** vertèbre ; chez Genex c’est `Spine02`. Mapping automatique
si le nœud a le préfixe `mixamorig` :

| source Mixamo | Genex |
|---|---|
| Hips | Hips |
| Spine | Spine02 |
| Spine1 | Spine01 |
| Spine2 | Spine |
| Neck | neck |
| Head / HeadTop_End | Head / head_end |
| Left/Right Toe_End | Left/Right ToeBase |

## Format Genex attendu

| | |
|---|---|
| Conteneur | **GLB** (FBX : convertir avant ingest) |
| FPS | **30** (walk = 32 clés / 1,067 s ; run = 20 clés / 0,667 s) |
| Durées one-shot (machine) | attack/shoot **0,46 s**, hit **0,28 s**, dodge **0,36 s**, death **0,80 s**. Un clip plus long est respecté (`tickMachine` lit `clip.duration`). |
| Orientation | modèle regarde **+Z**, Y-up. Le chargeur applique `rotation.y = π/2` pour aligner +X sim. |
| Échelle | nœud `Armature` (et mesh `char1`) **× 0,01**. Translations d’os en « centimètres » de rig, pas en mètres monde. |
| Root motion | **in-place** (`extras.inPlace: true` sur walk/run). Pas de translation XZ de `Hips` sur le cycle. |
| Pistes | translation + rotation + scale par os (66 canaux / 22 os sur walk). |
| Générateur actuel walk/run | `Khronos glTF Blender I/O v4.5.51`, extras `{ genex: "meshy-animation", rig, inPlace }` |

## Licence

| asset | source | licence |
|---|---|---|
| NL-1…4, TERM + walk/run | Genex, déjà dans le dépôt | voir `web/models/MANIFESTE.md` (décision Salim ; CGU Genex / IP GW non tranchées juridiquement) |
| idle Genex `Idle_3` | Genex, 2026-11-10, un clip par perso | même régime ; `*-idle.glb` ~124 Ko, animation seule |
| clips combat Genex | à recevoir (compte Genex, vérif e-mail) | même régime, à documenter à l’arrivée |
| procédural `proc-*` (polish) | ce dépôt (`web/proc-clips.ts`) | MIT |
| procédural `proc-*` legacy `#59` | ce dépôt, `?proc=legacy` | MIT |
| Quaternius UAL | non livré (écarté) | CC0 — mapping Mixamo documenté ci-dessus, pas utilisé |

Aucun clip Mixamo n’est versionné ici.
