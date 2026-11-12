# RL3 — imitation BC + DAgger (IGN-172)

Prototype local. **Aucune convergence ni ressemblance humaine n’est affirmée.** Les chiffres ci-dessous viennent des JSON de run. Les données d’oracle / autoplay sont étiquetées `provenance.kind = synthetic`.

Base `dev` SHA `26535ca8505fae31d5f1cc2ba15e40811dc6af64`.

## Schéma

`Recording` : `source`, `provenance` (`human` | `synthetic` | `mixed`), `frames[]` avec `a`, `o` (29D), `move`, `atk`. Rejet : vide, corrompu, observation absente ou mauvaise dimension. Corps POST `/api/rl3/record` plafonné à 5 Mo (413). `jalon1/mesures/recording-synth.json` est synthétique **et incompatible** (pas d’`o`).

Split BC : 1 bloc de 10 frames sur 5 (`floor(i/10) % 5 === 2` = val). DAgger agrège des labels oracle sur les états visités par π ; les indices val restent ceux de D0.

## Commandes exécutées

Graine BC/DAgger `1`. Budget BC CLI : 5 epochs, hidden 64, patience 30. DAgger : 2 iters, 2 epochs, budget 40 frames/ticks, pack `naive`, expert `wallHugger` (synthétique). Éval : n=5, seedBase 900000, pack `naive`, ghost figé temp=0.

```
bun install --frozen-lockfile          # exit 0
bun test test/                         # exit 0  (217 pass, 1 skip sas-e2e)
bun run build                          # exit 0
node dist/bc.mjs --out /tmp/rl3-ghost.json --epochs 5 --seed 1 jalon1/mesures/recording-synth.json
                                       # exit 1  RecordingSchemaError: frame 0 sans observation 29D
node dist/bc.mjs --out /tmp/rl3-ghost.json --run-json mesures/rl3/bc-run.json --epochs 5 --seed 1 test/fixtures/rl3/recording-synth.json
                                       # exit 0  voir bc-run.json
# DAgger relancé via bibliothèque (src/dagger.ts) seed 1, 2 iters, budget 40 :
# checkGuard CLI en pause si `bun test` apparaît encore au ps (tests=true).
# exit 0 bibliothèque ; dagger.json : aggregatedFrames=367 = framesSeenByCheckpoint=367
# ghost-iter-2.json meta.frames=367, val=60 (D0)
node dist/eval-imitation.mjs --ghost /tmp/rl3-ghost.json --n 5 --seedBase 900000 --out mesures/rl3/eval.json
                                       # exit 0
bun run dev -- --host 127.0.0.1        # lancé par scripts/capture-rl3.ts (Vite 7.3.7, port 18230) ; SIGTERM 143 en fin de capture
bun scripts/capture-rl3.ts             # exit 0  Chromium + SwiftShader
```

## Chiffres (JSON, pas d’interprétation humaine)

BC 5 epochs, fixture synthétique 287 frames (oracle wallHugger) : `accVal.joint = 0.067` **inférieur** à `majorityVal.joint = 0.217`. `valLoss = 2.4187`. Ce n’est pas une preuve d’imitation.

DAgger (relance) : D0=287, agrégé 367, `framesSeenByCheckpoint=367` = `ghost-iter-2.json` `meta.frames`. val=60 (préfixe D0, valIndexMax=286). 80 frames oracle. Le checkpoint final est entraîné sur D0+agrégat.

Éval n=5 vs meute naïve : packWins 0/5, toutes les parties `temps écoulé` 120 s. Le fantôme n’a pas engagé. **Pas une métrique de style humain.**

## Démo locale

`http://127.0.0.1:18230/web/index.html?rl3=1&autoplay=wallHugger&seed=1`  
Panneau : envoyer l’enregistrement → entraîner BC → rejouer checkpoint. Erreurs JSON si données/checkpoint absents. Replay : `temp=0`, pas d’entraînement concurrent. `/api/round` (PPO, mécanisme C) n’est pas appelé en `?rl3=1`.

Captures SwiftShader : `docs/captures/rl3/` (`01-play` … `04-replay`, `console.json`, `network.json`, `playwright.json`). GPU : `ANGLE ... SwiftShader`. Rendu CPU, pas un GPU desktop.

## Limites

- Verrou `/api/rl3/train` : pid + `process.kill(pid, 0)` ; un pid mort ne bloque pas.
- 5 epochs, 1 graine, CPU tfjs-node. Pas d’arrêt sur un plateau réel de fidélité.
- Fixture et autoplay = oracle scripté, pas un joueur humain.
- `jalon1/mesures/recording-synth.json` ne peut pas entraîner (pas d’observations).
- Hors périmètre : PPO/self-play/ELO, publication, main, GitHub Actions.
