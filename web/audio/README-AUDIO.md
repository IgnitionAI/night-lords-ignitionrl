# Son — contrat de branchement

Le module `nightlords-audio.js` et ses types sont de **Honsou** (banque Genex, 15 sons). Copiés ici sans
modification depuis `Shared/team/pipeline/demo-night-lords/audio-api/`.

## Où vit la banque

**Hors du dépôt.** Genex n'a pas confirmé que ses sorties audio sont redistribuables ; le dépôt est public.
`.gitignore` contient `web/sfx/*`. Pour faire du bruit en local :

```bash
mkdir -p web/sfx/nightlords
cp <audio-api>/manifest.json web/sfx/nightlords/
cp <audio-api>/../assets/sfx-terminator/bank/*.mp3 web/sfx/nightlords/
```

Le module est prévu pour ça : manifeste en 404 → `initAudio` renvoie `{ ok: false, reason: 'manifest 404' }`,
**chaque appel devient un no-op qui renvoie `false`**, le jeu tourne à l'identique. Vérifié dans un vrai
navigateur, banque retirée : aucune exception, aucun son.

## Branchement dans `web/main.ts`

```ts
await Promise.all([loadPolicy(), loadModels(), initAudio({ base: '/web/sfx/nightlords/', manifest: 'manifest.json' })]);
```

| événement de `src/sim.ts` | appel |
|---|---|
| `step` | `audio.step({ intensity })` |
| `bolt` | `audio.bolt({ pan: 0.05 })` |
| `fist` | `audio.fist({ pan: 0 })` |
| `clawArm` | `audio.clawArm({ pan })` |
| `claw` (`dmg > 0`) / (`dmg === 0`) | `audio.claw({ pan })` / `audio.gauntletArc({ pan })` |
| `whiff` | `audio.whiff({ pan })` |
| marche continue | `audio.servo.start()` / `setLoad(vitesse / 2,5)` / `stop()` en fin de manche |

`pan` = position écran de la source, pas son angle au joueur : `panOf(x, y)` projette en NDC.

**Le son ne dépend pas de `?impact=0`** : le poids de la caméra et le son sont deux sensations séparées, on
veut pouvoir mesurer l'une en gardant l'autre.

## Ce qui est mesuré, et ce qui ne l'est pas

- 40 s de temps réel, `?autoplay=brawler`, graine 3 : **91 appels aboutis**, 7 refusés par l'anti-doublon de
  35 ms, **0 exception**, contexte `running`, 6 sons chauds décodés à l'init et 4 autres au premier appel.
- `?audio=0` : **0 appel abouti** sur 90 tentatives, servo arrêté.
- En mode capture (`?shot=N`), les 115 ticks s'exécutent en quelques centaines de millisecondes : l'anti-doublon
  de 35 ms refuse la plupart des pas. **On ne mesure pas le son en mode capture**, seulement en temps réel.
- **Non mesuré : le rendu sonore.** Cette machine n'a pas d'oreille. Ce qui est prouvé, c'est que les sources
  partent et que rien ne casse — pas que ça sonne juste. À écouter sur la machine de Salim.
- Pas de HRTF : un `pan` par source. Suffisant pour une scène frontale, à revoir en écoute casque.
