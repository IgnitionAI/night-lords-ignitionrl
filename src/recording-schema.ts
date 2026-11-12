import type { Recording, Frame } from './recorder';
import { encodeAction, TOBS_DIM } from './tobs';

export type ProvenanceKind = 'human' | 'synthetic';
export interface Provenance {
  kind: ProvenanceKind;
  label: string;
  oracle?: string;
}

export class RecordingSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingSchemaError';
  }
}

export function inferProvenance(source: string | undefined): Provenance {
  const s = source ?? '';
  if (/synth|oracle|autoplay|wallhugger|dagger|fixture|script/i.test(s)) {
    return { kind: 'synthetic', label: s || 'synthétique' };
  }
  return { kind: 'human', label: s || 'joueur' };
}

function isAction(a: unknown): a is Frame['a'] {
  if (!a || typeof a !== 'object') return false;
  const o = a as Frame['a'];
  return typeof o.fwd === 'number' && typeof o.strafe === 'number' && typeof o.turn === 'number'
    && typeof o.bolt === 'boolean' && typeof o.fist === 'boolean';
}

export function validateRecording(raw: unknown): Recording & { provenance: Provenance } {
  if (!raw || typeof raw !== 'object') {
    throw new RecordingSchemaError('enregistrement corrompu : pas un objet');
  }
  const rec = raw as Recording & { provenance?: Provenance };
  if (!Array.isArray(rec.frames)) {
    throw new RecordingSchemaError('enregistrement incompatible : frames absentes');
  }
  if (rec.frames.length === 0) {
    throw new RecordingSchemaError('enregistrement vide');
  }
  const provenance = rec.provenance?.kind ? rec.provenance : inferProvenance(rec.source);
  const frames: Frame[] = rec.frames.map((fr, i) => {
    if (!fr || typeof fr !== 'object' || !isAction(fr.a)) {
      throw new RecordingSchemaError(`enregistrement incompatible : frame ${i} sans action`);
    }
    if (!Array.isArray(fr.o) || fr.o.length !== TOBS_DIM || fr.o.some(v => typeof v !== 'number')) {
      throw new RecordingSchemaError(`enregistrement incompatible : frame ${i} sans observation ${TOBS_DIM}D`);
    }
    const heads = (fr.move === undefined || fr.atk === undefined) ? encodeAction(fr.a) : null;
    return {
      ...fr,
      move: fr.move ?? heads!.move,
      atk: fr.atk ?? heads!.atk,
    };
  });
  return {
    createdAt: rec.createdAt ?? '',
    source: rec.source ?? provenance.label,
    provenance,
    frames,
    result: rec.result,
  };
}
