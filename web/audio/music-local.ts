import type { AudioManifest, ManifestSample, SampleName } from './types';

/** Les trois boucles qu'une banque locale (non versionnée) peut remplacer. Rien d'autre n'est touché. */
export const LOCAL_MUSIC_NAMES: readonly SampleName[] = ['music-explore', 'music-tension', 'music-combat'];

/** Dossier local à côté de la banque principale : `/web/sfx/nightlords/` → `/web/sfx/music-local/`. */
export function localMusicBase(base: string): string {
  const b = base.replace(/\/?$/, '/');
  return b.replace(/[^/]+\/$/, 'music-local/');
}

export interface LocalMusicMerge {
  manifest: AudioManifest;
  /** Entrées CC0 d'origine, pour revenir en arrière si un fichier local ne se décode pas. */
  originals: Map<string, ManifestSample>;
  replaced: string[];
}

function validEntry(e: unknown): e is { name: string; file: string; gain?: number; credit?: string; license?: string; source?: string } {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.file !== 'string' || !o.file) return false;
  if (o.file.includes('..') || /^[a-z]+:/i.test(o.file)) return false;
  if (o.gain !== undefined && !(typeof o.gain === 'number' && Number.isFinite(o.gain) && o.gain > 0 && o.gain <= 4)) return false;
  if (o.credit !== undefined && typeof o.credit !== 'string') return false;
  return true;
}

/**
 * Fusionne un manifeste local dans le manifeste principal. Seules les entrées `music-explore`,
 * `music-tension` et `music-combat` déjà présentes sont remplacées (fichier, gain, crédit, licence, source) ;
 * les autres échantillons restent tels quels. Retourne `null` si le manifeste local est invalide ou vide.
 */
export function mergeLocalMusic(main: AudioManifest, local: unknown, localBase: string): LocalMusicMerge | null {
  if (!local || typeof local !== 'object') return null;
  const samples = (local as { samples?: unknown }).samples;
  if (!Array.isArray(samples)) return null;
  const byName = new Map<string, ManifestSample>();
  for (const e of samples) {
    if (!validEntry(e) || !LOCAL_MUSIC_NAMES.includes(e.name as SampleName)) continue;
    byName.set(e.name, e as unknown as ManifestSample);
  }
  const originals = new Map<string, ManifestSample>();
  const replaced: string[] = [];
  const out = main.samples.map((s) => {
    const l = byName.get(s.name);
    if (!l) return s;
    originals.set(s.name, s);
    replaced.push(s.name);
    return {
      ...s,
      file: l.file,
      fallback: undefined,
      variants: undefined,
      gain: l.gain ?? s.gain,
      credit: typeof l.credit === 'string' && l.credit.trim() ? l.credit.trim() : undefined,
      license: typeof l.license === 'string' ? l.license : s.license,
      source: typeof l.source === 'string' ? l.source : s.source,
      base: localBase,
    } satisfies ManifestSample;
  });
  if (!replaced.length) return null;
  return { manifest: { ...main, samples: out }, originals, replaced };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Balise du crédit musical, vide tant que la musique locale n'est pas chargée. */
export function musicCreditMarkup(credit: string | null | undefined): string {
  if (!credit) return '';
  return `<div class="music-credit">${escapeHtml(credit)}</div>`;
}
