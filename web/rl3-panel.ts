import type { ActorJSON } from '../src/policy';
import type { Recording } from '../src/recorder';

export function missingDataError(kind: 'recording' | 'checkpoint'): string {
  return kind === 'recording'
    ? 'données absentes : envoie d’abord une manche enregistrée'
    : 'checkpoint absent : entraîne avant de rejouer';
}

export function formatRunLog(run: Record<string, unknown>): string {
  if (run.error) return String(run.error);
  return JSON.stringify(run, null, 1);
}

export function mountRl3(opts: {
  enabled: boolean;
  getRecording: () => Recording;
  onReplay: (actor: ActorJSON) => void;
  frozen: () => boolean;
}): { setLog: (s: string) => void } {
  const box = document.getElementById('rl3');
  if (!box || !opts.enabled) return { setLog: () => undefined };
  document.body.classList.add('rl3');
  const log = box.querySelector('#rl3-log') as HTMLElement;
  const setLog = (s: string) => { log.textContent = s; };
  let training = false;

  const send = async () => {
    const rec = opts.getRecording();
    if (!rec.frames?.length) { setLog(missingDataError('recording')); return; }
    const r = await fetch('/api/rl3/record', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec) });
    const j = await r.json();
    setLog(formatRunLog(j));
    (window as unknown as { __RL3?: Record<string, unknown> }).__RL3 = { ...(window as unknown as { __RL3?: object }).__RL3, lastRecord: j };
  };

  const train = async (dagger: boolean) => {
    if (training || opts.frozen()) { setLog(training ? 'entraînement déjà en cours' : 'replay figé : pas d’entraînement'); return; }
    training = true;
    setLog('entraînement… (logs JSON à l’arrivée)');
    try {
      const r = await fetch('/api/rl3/train', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seed: 1, epochs: 5, dagger }) });
      const j = await r.json();
      if (!r.ok) { setLog(j.error ?? JSON.stringify(j)); return; }
      const st = await fetch('/api/rl3/status').then(x => x.ok ? x.json() : j);
      setLog(formatRunLog(st));
      (window as unknown as { __RL3?: Record<string, unknown> }).__RL3 = { ...(window as unknown as { __RL3?: object }).__RL3, lastTrain: j, lastRun: st };
    } catch (e) {
      setLog(String(e));
    } finally {
      training = false;
    }
  };

  const replay = async () => {
    const r = await fetch('/api/rl3/ghost');
    const j = await r.json();
    if (!r.ok) { setLog(j.error ?? missingDataError('checkpoint')); return; }
    opts.onReplay(j as ActorJSON);
    setLog('replay figé (temp=0) — checkpoint chargé, inférence sans tirage');
  };

  box.querySelector('#rl3-send')?.addEventListener('click', () => { void send(); });
  box.querySelector('#rl3-train')?.addEventListener('click', () => { void train(false); });
  box.querySelector('#rl3-dagger')?.addEventListener('click', () => { void train(true); });
  box.querySelector('#rl3-replay')?.addEventListener('click', () => { void replay(); });
  return { setLog };
}
