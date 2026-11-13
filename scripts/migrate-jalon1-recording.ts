// Applique la migration 29D au recording jalon 1 (opt-in, hors validateRecording).
// Usage : bun scripts/migrate-jalon1-recording.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { migrateRecordingTo29D } from '../src/recording-migrate';

const src = 'jalon1/mesures/recording-synth.json';
const rec = migrateRecordingTo29D(JSON.parse(readFileSync(src, 'utf8')));
writeFileSync(src, JSON.stringify(rec));
console.log(`migré ${src} frames=${rec.frames.length} o=${rec.frames[0]?.o?.length} kind=${rec.provenance?.kind}`);
