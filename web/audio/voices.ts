import { DEFAULT_POLYPHONY, type BusName, type VoiceRecord } from './types';

export interface AcquireOpts {
  name: string;
  priority: number;
  bus: BusName;
  now?: number;
}

/**
 * Pool de voix à priorité : au-delà de `max`, on vole la voix de plus basse
 * priorité (à égalité, la plus ancienne). Le graphe WebAudio est branché
 * ailleurs ; ici on ne compte que l'occupation.
 */
export class VoicePool {
  readonly max: number;
  private nextId = 1;
  private readonly active = new Map<number, VoiceRecord>();

  constructor(max = DEFAULT_POLYPHONY) {
    this.max = Math.max(1, max);
  }

  get size(): number {
    return this.active.size;
  }

  list(): VoiceRecord[] {
    return [...this.active.values()];
  }

  acquire(opts: AcquireOpts): { id: number; stolen: VoiceRecord | null } {
    let stolen: VoiceRecord | null = null;
    if (this.active.size >= this.max) {
      stolen = this.lowest();
      if (stolen) this.active.delete(stolen.id);
    }
    const rec: VoiceRecord = {
      id: this.nextId++,
      name: opts.name,
      priority: opts.priority,
      bus: opts.bus,
      startedAt: opts.now ?? 0,
      playing: true,
    };
    this.active.set(rec.id, rec);
    return { id: rec.id, stolen };
  }

  release(id: number): boolean {
    return this.active.delete(id);
  }

  releaseAll(): VoiceRecord[] {
    const all = this.list();
    this.active.clear();
    return all;
  }

  private lowest(): VoiceRecord | null {
    let worst: VoiceRecord | null = null;
    for (const v of this.active.values()) {
      if (!worst) { worst = v; continue; }
      if (v.priority < worst.priority) { worst = v; continue; }
      if (v.priority === worst.priority && v.startedAt < worst.startedAt) worst = v;
    }
    return worst;
  }
}
