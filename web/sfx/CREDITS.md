# Banque sonore Night Lords — licences

Tous les fichiers sous `web/sfx/nightlords/` sont une **synthèse procédurale originale**
(`scripts/bake-sfx.py`), publiée en **CC0 1.0 Universal** (domaine public). Aucun
échantillon d'une personne réelle, aucun asset Games Workshop, aucun fichier Genex.

Encodage : OGG Vorbis (q3), 44,1 kHz. Poids total visé &lt; 8 Mo.

| fichier | rôle | licence | source |
|---|---|---|---|
| bolter-shot.ogg | tir de bolter lourd | CC0 | bake-sfx.py `bolter_shot` |
| bolter-echo.ogg | queue d'écho de couloir | CC0 | bake-sfx.py `bolter_echo` |
| bolter-casing.ogg | douilles sur la tôle | CC0 | bake-sfx.py `bolter_casing` |
| bolter-explode.ogg | explosion masse-réactive | CC0 | bake-sfx.py `bolter_explode` |
| claw-crackle.ogg | crépitement des griffes éclair | CC0 | bake-sfx.py `claw_crackle` |
| claw-swoosh.ogg | swoosh de lame | CC0 | bake-sfx.py `claw_swoosh` |
| claw-metal.ogg | impact métal / ceramite | CC0 | bake-sfx.py `claw_metal` |
| fist-impact.ogg | coup de poing Terminator | CC0 | bake-sfx.py `fist_impact` |
| term-step-01.ogg … 03 | pas lourds Cataphractii | CC0 | bake-sfx.py `term_step` |
| term-servo.ogg | servomoteurs | CC0 | bake-sfx.py `term_servo` |
| term-hydraulic.ogg | hydrauliques de l'armure | CC0 | bake-sfx.py `term_hydraulic` |
| nl-step-01.ogg … 03 | pas des Night Lords | CC0 | bake-sfx.py `nl_step` |
| nl-jump.ogg | saut / recul | CC0 | bake-sfx.py `nl_jump` |
| nl-vox-come-for-you.ogg | « We have come for you » | CC0 | formants synthétiques, **pas de voix enregistrée** |
| nl-scream.ogg | cri vox distordu | CC0 | formants synthétiques |
| nl-death.ogg | mort d'un frère | CC0 | bake-sfx.py `nl_death` |
| alarm-klaxon.ogg | alarme / klaxon de servo | CC0 | bake-sfx.py `alarm_klaxon` |
| amb-drone.ogg | drone de coque (boucle) | CC0 | bake-sfx.py `amb_drone` |
| amb-drip.ogg | goutte de condensat | CC0 | bake-sfx.py `amb_drip` |
| amb-duct.ogg | vent dans les conduits | CC0 | bake-sfx.py `amb_duct` |
| music-explore.ogg | couche exploration | CC0 | bake-sfx.py `music_layer(explore)` |
| music-tension.ogg | couche tension (meute proche) | CC0 | bake-sfx.py `music_layer(tension)` |
| music-combat.ogg | couche combat | CC0 | bake-sfx.py `music_layer(combat)` |
| stinger-victory.ogg | stinger victoire Terminator | CC0 | bake-sfx.py `stinger(True)` |
| stinger-defeat.ogg | stinger défaite / meute | CC0 | bake-sfx.py `stinger(False)` |
| manifest.json | index de la banque | MIT (code du dépôt) | ce dépôt |

Régénération :

```sh
python3 scripts/bake-sfx.py
```
