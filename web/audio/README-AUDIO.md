# Son — moteur WebAudio

Le module vit dans `web/audio/` (mixeur, pool de voix, directeur d'événements,
convolution, occlusion). La banque **CC0 enregistrée** (Freesound, mixages
couches) est versionnée dans `web/sfx/nightlords/` — voir `web/sfx/CREDITS.md`.

Sonniss GDC n'est pas utilisé : sa licence interdit de redistribuer les fichiers
dans un dépôt. Kenney.nl a répondu 403 depuis cet environnement.

## Bus

`sfx` · `voice` · `ambience` · `music` · `ui` → **master** (compresseur ratio 12
puis limiteur ratio 20, seuil −1 dB). La musique **et** l'ambiance passent par
un ducking : un gros impact (bolter, poing, griffe) baisse la musique ~8 dB
pendant ~220 ms.

Réverbération de couloir : `ConvolverNode` (IR `ir-corridor.ogg`, métal).
Spatialisation : `PannerNode` HRTF, listener collé à la **caméra existante**.
Occlusion : si un pilier coupe l'écouteur de la source, passe-bas ~620 Hz.
Pitch ±4 % et volume ±1,5 dB par voix. Variations ≥ 3 fichiers pour bolter,
poing, griffes, douilles. Polyphonie 18.

## Déclenchement

Les événements de `src/sim.ts` (lus seulement, jamais modifiés) plus les cues
d'anim `#72` (`anticipation` / `impact` / `fire` / `land`) :

| événement | sons |
|---|---|
| `step` | pas Terminator + hydraulique + servo |
| `bolt` (cue `fire`) | transient + corps + écho de couloir + douilles + impact céramite |
| `fistCharge` / `fistReady` | champ de force (`fist-hum`) + servo / hydraulique |
| `fist` (cue `impact`) | crush + sub + ducking |
| `clawArm` (cue `anticipation`) | crépitement + swoosh |
| `claw` (cue `impact`) | lame + métal + arc |
| `whiff` | swoosh |
| `land` (saut NL) | jump-pack à la réception |
| `hit` / `servoCritical` | klaxon |
| marche NL | pas calés sur la foulée `1.333…` / `1.100…` |
| recul NL | jump-pack |
| deux frères à &lt; 8 m | vox chuchoté / radio (enregistrements CC0) |
| fond | drone, conduits, gouttes ; musique explore → tension → combat |
| chasse (`?cam=shoulder`) | `setHuntTension` gonfle `amb-drone` + `music-tension` (buses existants) |

## Gestes

L'`AudioContext` démarre au premier `pointerdown` / `keydown` / `touchstart`.
**M** coupe le son. `?mute=1` ou `?audio=0` démarre muet.

## Preuve

`bun test test/` — mixeur, manifeste, polyphonie, occlusion, cue `land`.
`docs/videos/sound-redesign.mp4` : manche complète, H.264 + AAC 48 kHz stéréo.
