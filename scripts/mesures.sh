#!/usr/bin/env bash
# Mesures du jalon 1 : éval des politiques sur seeds tenues à part + test du mécanisme C avec un joueur synthétique.
# Respecte les garde-fous : load < 16, inodes <= 88 %, au plus 2 entraînements (vérifiés aussi dans train.mjs).
set -euo pipefail
cd "$(dirname "$0")/.."
N=${N:-200}; BASE=${BASE:-runs/base}; M=mesures; mkdir -p $M
guard() { node -e "const l=require('os').loadavg()[0]; const o=require('child_process').execSync('df -i .').toString().trim().split('\n').pop().split(/\s+/); const p=o[2]/o[1]*100; console.log('garde load='+l.toFixed(2)+' inodes='+p.toFixed(1)+'%'); if(l>=16||p>88) process.exit(3)"; }
guard
for P in naive random $BASE/actor.json; do
  tag=$(basename $(dirname $P 2>/dev/null) 2>/dev/null); [ "$P" = naive ] && tag=naive; [ "$P" = random ] && tag=random
  node dist/eval.mjs --pack $P --n $N --out $M/eval-$tag.json > /dev/null; echo "éval $tag ok"
done
# Mécanisme C : un « joueur » synthétique (tactique hors pool, wallHugger) joue une manche contre la meute de base
node dist/synth-player.mjs $BASE/actor.json $M/recording-synth.json 424242
node dist/eval.mjs --pack $BASE/actor.json --n $N --opps wallHugger,ghost=$M/recording-synth.json --out $M/eval-C-avant.json > /dev/null
guard
start=$(date +%s.%N)
node dist/train.mjs --init $BASE/full.json --ghost $M/recording-synth.json --ghostShare 0.7 --updates ${FT:-30} --envs 16 --out runs/ft-mesure --seed 8 2>&1 | grep -E "^\{|FIN|garde" | tail -3
end=$(date +%s.%N); echo "{\"fineTuneWallSeconds\": $(awk "BEGIN{print $end - $start}")}" > $M/finetune-time.json
node dist/eval.mjs --pack runs/ft-mesure/actor.json --n $N --opps wallHugger,ghost=$M/recording-synth.json,march,turret,brawler,backpedal --out $M/eval-C-apres.json > /dev/null
echo "mesures écrites dans $M/"
