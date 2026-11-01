#!/bin/sh
# b4 : plusieurs graines d'entraînement depuis zéro (règles b4 de src/sim.ts, tirage priorisé du pool),
# puis éval sur 200 parties par adversaire (seeds 900000+, jamais utilisées à l'entraînement).
# Un seul entraînement à la fois ; la garde (src/guard.ts) met en pause si la machine est occupée.
# Usage : SEEDS="11 12 13" UPDATES=2000 TAG=b4 LOGDIR=./logs scripts/b4.sh
cd "$(dirname "$0")/.." || exit 1
U=${UPDATES:-2000}; TAG=${TAG:-b4}; L=${LOGDIR:-logs}; mkdir -p "$L" mesures/$TAG
for S in ${SEEDS:-11 12 13}; do
  echo "== $TAG seed $S début $(date '+%F %T')"
  nice -n 19 node dist/train.mjs --updates $U --envs 32 --out runs/$TAG-s$S --seed $S > "$L/$TAG-s$S-train.log" 2>&1
  rc=$?; echo "train seed $S exit=$rc $(date '+%F %T')"; [ $rc -ne 0 ] && { free -m; exit $rc; }
  nice -n 19 node dist/eval.mjs --pack runs/$TAG-s$S/actor.json --n 200 --out mesures/$TAG/eval-s$S.json > "$L/$TAG-s$S-eval.log" 2>&1
  echo "eval seed $S exit=$? $(date '+%F %T')"
done
echo "== $TAG fini $(date '+%F %T')"
