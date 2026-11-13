import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { playRecordedRound } from '../src/evallib';
import { wallHugger } from '../src/tactics';

const out = join('test/fixtures/rl3/recording-synth.json');
mkdirSync(join('test/fixtures/rl3'), { recursive: true });
const { rec } = playRecordedRound('naive', wallHugger(), 424242, 'oracle synthétique wallHugger (IGN-172, pas un humain)');
rec.provenance = { kind: 'synthetic', label: rec.source, oracle: 'wallHugger' };
rec.result = `${rec.result ?? ''} — fixture synthétique, pas une partie humaine`;
writeFileSync(out, JSON.stringify(rec));
console.log(`wrote ${out} frames=${rec.frames.length} provenance=${rec.provenance.kind}`);
