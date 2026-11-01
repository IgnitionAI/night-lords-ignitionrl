#!/usr/bin/env bash
# Enchaînement de nuit du jalon 1b, après l'entraînement de base B : expérience C puis captures.
# Chaque entraînement passe par la garde (src/guard.ts) : pause tant qu'une CI locale ou une autre stack tourne.
set -uo pipefail
cd "$(dirname "$0")/.."
B=${B:-runs/b3}
while [ ! -s mesures/eval-$(basename $B).json ]; do sleep 60; done
node dist/experiment-c.mjs --base $B --player ${PLAYER:-elite} --seeds 1,2,3 --rounds 3 --ft 30 --n 200 --out mesures/experiment-c.json > runs/expC.log 2>&1
cp $B/actor.json policies/current.json && cp $B/full.json policies/current-full.json
echo "nuit terminée $(date)" >> runs/expC.log
