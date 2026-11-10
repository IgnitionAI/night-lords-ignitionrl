# Son — moteur WebAudio

Le module vit dans `web/audio/` (mixeur, pool de voix, directeur d'événements).
La banque CC0 / procédurale est versionnée dans `web/sfx/nightlords/` — voir
`web/sfx/CREDITS.md`. Plus de 404 sur `manifest.json`.

## Bus

`sfx` · `ambience` · `music` · `ui` → **master** (compresseur ratio 12 puis limiteur ratio 20).
La musique passe par un nœud de **ducking** : un gros impact (bolter, poing, griffe qui mord)
la baisse ~8 dB pendant ~220 ms.

Spatialisation : `PannerNode` HRTF, listener collé à la caméra. Pitch ±4 % et volume ±1,5 dB
par voix. Polyphonie 18, vol de la voix la plus basse priorité.

## Déclenchement

Les événements de `src/sim.ts` (lus seulement, jamais modifiés) plus quelques
signaux de présentation (pas NL, saut/recul, vox, stingers) :

| événement | sons |
|---|---|
| `step` | pas Terminator + hydraulique |
| `bolt` | tir + écho + douilles + explosion ; mort si `kill>=0` |
| `fistCharge` / `fistReady` / `fist` | servo, hydraulique, impact sourd |
| `clawArm` | crépitement + swoosh |
| `claw` | swoosh + métal (+ cri si dégâts) |
| `whiff` | swoosh |
| `hit` (servoAlarm) / `servoCritical` | klaxon |
| marche NL (rendu) | pas NL calés sur la foulée skinée |
| recul NL (`lastAction===2`) | saut |
| deux frères à &lt; 8 m | vox « We have come for you » (synthèse) |
| fin de manche | stinger victoire / défaite |
| fond | drone de vaisseau, conduits, gouttes ; musique explore → tension → combat |

## Gestes

L'`AudioContext` démarre au premier `pointerdown` / `keydown` / `touchstart`.
**M** coupe le son. `?mute=1` ou `?audio=0` démarre muet.

## Preuve

`bun test test/` couvre mixeur, manifeste, limite de voix.
`docs/videos/sound-match.mp4` : manche complète avec piste audio.
