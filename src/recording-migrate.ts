// Migration jalon-1 → schéma BC 29D. Opt-in : validateRecording reste strict (pas d'`o` = rejet).
// Les observations reconstruites posent le Terminator enregistré dans un monde seedé ;
// les Night Lords ne sont pas ceux de la manche d'origine (absents du JSON jalon 1).
// Toujours étiqueté synthetic — ce n'est pas une perception humaine.
import { newWorld } from './sim';
import { encodeAction, tObserve, TOBS_DIM } from './tobs';
import type { Frame, Recording } from './recorder';
import { inferProvenance, RecordingSchemaError, validateRecording } from './recording-schema';

export const MIGRATE_WORLD_SEED = 1;
export const MIGRATE_DISCLAIMER =
  'fixture synthétique migrée 29D — observations reconstruites, pas une partie humaine';

function isAction(a: unknown): a is Frame['a'] {
  if (!a || typeof a !== 'object') return false;
  const o = a as Frame['a'];
  return typeof o.fwd === 'number' && typeof o.strafe === 'number' && typeof o.turn === 'number'
    && typeof o.bolt === 'boolean' && typeof o.fist === 'boolean';
}

export function needsObsMigration(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const rec = raw as Recording;
  if (!Array.isArray(rec.frames) || rec.frames.length === 0) return false;
  return rec.frames.some(fr => !Array.isArray(fr.o) || fr.o.length !== TOBS_DIM);
}

/** Pose T (x, y, facing, tick) dans un monde déterministe et appelle tObserve. */
export function reconstructObs29D(frame: Pick<Frame, 'tick' | 'x' | 'y' | 'facing'>, seed = MIGRATE_WORLD_SEED): number[] {
  const w = newWorld(seed, { x: frame.x, y: frame.y, facing: frame.facing });
  w.tick = frame.tick;
  return tObserve(w).map(v => +v.toFixed(4));
}

export function migrateRecordingTo29D(raw: unknown, seed = MIGRATE_WORLD_SEED): Recording {
  if (!needsObsMigration(raw)) return validateRecording(raw);
  if (!raw || typeof raw !== 'object') {
    throw new RecordingSchemaError('enregistrement corrompu : pas un objet');
  }
  const rec = raw as Recording;
  if (!Array.isArray(rec.frames) || rec.frames.length === 0) {
    throw new RecordingSchemaError(rec.frames?.length === 0 ? 'enregistrement vide' : 'enregistrement incompatible : frames absentes');
  }
  const frames: Frame[] = rec.frames.map((fr, i) => {
    if (!fr || typeof fr !== 'object' || !isAction(fr.a)) {
      throw new RecordingSchemaError(`enregistrement incompatible : frame ${i} sans action`);
    }
    const o = Array.isArray(fr.o) && fr.o.length === TOBS_DIM && fr.o.every(v => typeof v === 'number')
      ? fr.o
      : reconstructObs29D(fr, seed);
    const heads = encodeAction(fr.a);
    return {
      ...fr,
      o,
      move: fr.move ?? heads.move,
      atk: fr.atk ?? heads.atk,
    };
  });
  const provenance = rec.provenance ?? inferProvenance(rec.source);
  let kind: typeof provenance.kind;
  switch (provenance.kind) {
    case 'human':
      kind = 'synthetic';
      break;
    case 'synthetic':
      kind = 'synthetic';
      break;
    case 'mixed':
      kind = 'mixed';
      break;
    default: {
      const _n: never = provenance.kind;
      throw new RecordingSchemaError(`provenance inconnue : ${_n}`);
    }
  }
  const migrated: Recording = {
    createdAt: rec.createdAt ?? '',
    source: rec.source ?? provenance.label,
    provenance: {
      kind,
      label: `${provenance.label} — ${MIGRATE_DISCLAIMER}`,
      oracle: provenance.oracle ?? 'wallHugger',
    },
    frames,
    result: rec.result ? `${rec.result} — ${MIGRATE_DISCLAIMER}` : MIGRATE_DISCLAIMER,
  };
  return validateRecording(migrated);
}
