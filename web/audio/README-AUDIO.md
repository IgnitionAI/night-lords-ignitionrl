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

| événement de `src/sim.ts` | appel (façade de Honsou) |
|---|---|
| `step` | `onStep(intensity, 0)` |
| `bolt` | `onBolterBurst(0.05)` |
| `fistCharge` | `onFistCharge(0)` |
| `fist` | `onFistImpact(0)` |
| `clawArm` | `audio.clawArm({ pan })` |
| `claw` (`dmg > 0` / `dmg === 0`) | `onHit('claw', pan)` / `onHit('armor', pan)` |
| `whiff` | `onHit('miss', pan)` |
| `hit` (`servoAlarm > 0`) | `onServoAlarm(0)` |
| `servoCritical` | `onServoAlarm(0)` |
| marche continue | `onServoLoop.start({ load })` / `.load(vitesse / 2,5)` / `.stop()` en fin de manche |
| montée en charge | `onServoCharge(0)`, au démarrage seulement |

`pan` = position écran de la source, pas son angle au joueur : `panOf(x, y)` projette en NDC.

**Le son ne dépend pas de `?impact=0`** : le poids de la caméra et le son sont deux sensations séparées, on
veut pouvoir mesurer l'une en gardant l'autre.

## Le piège du contexte suspendu

Un navigateur refuse de démarrer l'`AudioContext` sans un geste : les appels renvoient `false` poliment et on
n'entend rien. `initAudio` installe `autounlock` (pointerdown/keydown/touchstart), et `audio.attachLifecycle()`
suspend le contexte quand l'onglet passe en arrière-plan puis le reprend au retour — seulement s'il tournait et
si le son n'est pas coupé. `audio.status()` dit où on en est (`state`, `ok`, `missing`).

## Ce qui est mesuré, et ce qui ne l'est pas

- 25 s de temps réel, `?autoplay=brawler`, graine 3, comptage **à l'extérieur du code du jeu** (instrumentation
  de `AudioContext.createBufferSource` injectée dans la page avant le module) : **34 sources réellement
  démarrées**, contexte `running`, 0 exception.
- `?audio=0` : **0 source**.
- Banque retirée du disque : **0 source**, aucune exception, `initAudio` renvoie `{ ok: false, reason:
  'manifest 404' }`.
- **Contrat vérifié, fonction par fonction** : les 7 fonctions de la façade existent, les 15 échantillons se
  décodent, et un appel à chacune produit **11 sources** (3 pas + charge + rafale + charge de gantelet + impact +
  entaille + armure + vide + alarme), sans exception. `onServoLoop.start` renvoyait `false` à ce moment-là
  parce que `onServoAlarm` venait de démarrer le lit : c'est le comportement documenté, pas un défaut.
- En mode capture (`?shot=N`), les 115 ticks s'exécutent en quelques centaines de millisecondes : l'anti-doublon
  de 35 ms refuse la plupart des pas. **On ne mesure pas le son en mode capture**, seulement en temps réel.
- **Non mesuré : le rendu sonore.** Cette machine n'a pas d'oreille. Ce qui est prouvé, c'est que les sources
  partent et que rien ne casse — pas que ça sonne juste. À écouter sur la machine de Salim.
- Pas de HRTF : un `pan` par source. Suffisant pour une scène frontale, à revoir en écoute casque.
