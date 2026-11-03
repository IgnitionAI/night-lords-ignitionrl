/**
 * nightlords-audio.js — API audio du prototype Night Lords (zéro dépendance).
 *
 * Règle de conception : **aucune fonction ne lève jamais d'exception**. Si la banque
 * est absente, si le navigateur refuse, si l'utilisateur est en `?audio=0`, tout
 * devient un no-op silencieux. Le jeu ne doit jamais casser à cause du son.
 *
 * Usage minimal :
 *   import { initAudio, audio } from './audio/nightlords-audio.js';
 *   await initAudio();                 // ne décode rien tout de suite
 *   audio.unlock();                    // à appeler depuis un vrai geste utilisateur
 *   audio.step({ pan: 0.2 });          // appui de pas, variante tournante
 *   audio.servo.start(); audio.servo.setLoad(0.8);
 */

const DEFAULTS = {
  base: '/audio/nightlords/',
  manifest: 'manifest.json',
  enabled: undefined, // par défaut : lu depuis ?audio=0
  // les six sons chauds sont décodés dès l'init : un premier pas muet s'entendrait
  preload: ['pas-tole-01', 'pas-tole-02', 'pas-tole-03', 'bolter-rafale', 'gantelet-impact', 'servo-lit'],
  autounlock: true,
  master: 0.9,
};

const MIN_INTERVAL_MS = 35; // anti-doublon par nom
const MAX_VOICES = 6;       // instances simultanées par nom

let cfg = { ...DEFAULTS };
let ctx = null;
let master = null;
let ready = false;
let enabled = true;
let armed = false;

const buffers = new Map();   // name -> AudioBuffer
const missing = new Set();   // noms introuvables / indécodables
const decoding = new Map();  // name -> Promise
const lastPlay = new Map();  // name -> ms
const voices = new Map();    // name -> compteur
let manifest = null;
let stepIndex = 0;
let servo = null;            // { src, gain, filter }
let lifecycleHandler = null;
let wasRunning = false;

const STEP_VARIANTS = ['pas-tole-01', 'pas-tole-02', 'pas-tole-03'];

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function audioParam(node, value, tc = 0.02) {
  if (!node) return;
  if (node.gain && typeof node.gain.setTargetAtTime === 'function') node.gain.setTargetAtTime(value, ctx.currentTime, tc);
  else if (node.gain) node.gain.value = value;
}

function url(file) {
  return cfg.base.replace(/\/$/, '') + '/' + file;
}

async function decodeName(name) {
  if (buffers.has(name) || missing.has(name)) return null;
  if (decoding.has(name)) return decoding.get(name);
  const entry = manifest && manifest.samples.find((s) => s.name === name);
  if (!entry) { missing.add(name); return null; }
  const p = (async () => {
    try {
      const res = await fetch(url(entry.file));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(data);
      buffers.set(name, buf);
      return buf;
    } catch (e) {
      missing.add(name);
      return null;
    } finally {
      decoding.delete(name);
    }
  })();
  decoding.set(name, p);
  return p;
}

function gate(name) {
  if (!enabled || !ready || !ctx) return false;
  const t = now();
  const prev = lastPlay.get(name) || 0;
  if (t - prev < MIN_INTERVAL_MS) return false;
  if ((voices.get(name) || 0) >= MAX_VOICES) return false;
  lastPlay.set(name, t);
  return true;
}

function play(name, opts = {}) {
  if (!gate(name)) return false;
  const buf = buffers.get(name);
  if (!buf) { void decodeName(name); return false; }
  if (ctx.state === 'suspended') void ctx.resume();

  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (opts.rate) src.playbackRate.value = opts.rate;

  const g = ctx.createGain();
  const entry = manifest.samples.find((s) => s.name === name);
  const baseGain = (opts.gain ?? 1) * (entry ? entry.gain : 0.7);
  g.gain.value = baseGain;

  let tail = g;
  if (ctx.createStereoPanner && typeof opts.pan === 'number') {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, opts.pan));
    g.connect(p); tail = p;
  }
  src.connect(g);
  tail.connect(master);

  const count = (voices.get(name) || 0) + 1;
  voices.set(name, count);
  src.onended = () => {
    voices.set(name, Math.max(0, (voices.get(name) || 1) - 1));
    try { src.disconnect(); g.disconnect(); if (tail !== g) tail.disconnect(); } catch { /* déjà libéré */ }
  };
  try { src.start(opts.when ?? 0); } catch { return false; }
  return true;
}

export async function initAudio(opts = {}) {
  cfg = { ...DEFAULTS, ...opts };
  enabled = cfg.enabled ?? !/[?&]audio=0(?:&|$)/.test(typeof location !== 'undefined' ? location.search : '');
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new Error('pas d’AudioContext');
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = cfg.master;
    master.connect(ctx.destination);
    const res = await fetch(url(cfg.manifest), { cache: 'no-cache' });
    if (!res.ok) throw new Error('manifest ' + res.status);
    manifest = await res.json();
    ready = true;
    if (cfg.autounlock) installUnlock();
    for (const n of cfg.preload) void decodeName(n);
    return { ok: true, samples: manifest.samples.length, missing: [...missing] };
  } catch (e) {
    ready = false;
    return { ok: false, reason: String(e && e.message || e), samples: 0, missing: [] };
  }
}

function installUnlock() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const on = () => audio.unlock();
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, on, { passive: true });
}

export function unlock() {
  if (!ctx) return false;
  if (ctx.state === 'suspended') { void ctx.resume(); return true; }
  return ctx.state === 'running';
}

export function setEnabled(v) {
  enabled = !!v;
  if (!enabled) {
    audio.servo.stop();
    if (master && ctx) audioParam(master, 0, 0.05);
  } else if (master && ctx) {
    audioParam(master, cfg.master, 0.05);
  }
  return enabled;
}

export function isEnabled() { return enabled; }

export const audio = {
  /** Appui de pas de tôle. `pan` -1..1, `intensity` 0..1 (par défaut 1). */
  step({ pan = 0, intensity = 1, gain = 1 } = {}) {
    const name = STEP_VARIANTS[stepIndex++ % STEP_VARIANTS.length];
    return play(name, { pan, gain: gain * (0.6 + 0.4 * intensity) });
  },

  /** Rafale de bolter lourd : trois départs + douilles + écho, déjà groupés dans le son. */
  bolt({ pan = 0, gain = 1 } = {}) { return play('bolter-rafale', { pan, gain }); },

  /** Impact du gantelet énergétique (et du poing). */
  fist({ pan = 0, gain = 1 } = {}) { return play('gantelet-impact', { pan, gain }); },

  /** Charge du gantelet : à appeler sur l'annonce d'armement. */
  gauntletCharge({ pan = 0, gain = 1 } = {}) { return play('gantelet-charge', { pan, gain }); },
  gauntletArc({ pan = 0, gain = 1 } = {}) { return play('gantelet-craquement', { pan, gain }); },

  /** Griffes de la meute : armement, frappe, coup dans le vide. */
  clawArm({ pan = 0, gain = 1 } = {}) { return play('griffe-armement', { pan, gain }); },
  claw({ pan = 0, gain = 1 } = {}) { return play('griffe-frappe', { pan, gain }); },
  whiff({ pan = 0, gain = 1 } = {}) { return play('griffe-rate', { pan, gain }); },

  servoCreak({ pan = 0 } = {}) {
    const name = Math.random() < 0.5 ? 'servo-craquement-01' : 'servo-craquement-02';
    return play(name, { pan, gain: 0.9 });
  },
  servoSurge({ pan = 0 } = {}) { return play('servo-charge', { pan }); },
  servoWhine({ pan = 0 } = {}) { return play('servo-sifflet-decel', { pan }); },

  /** Lit de servomoteurs en boucle. setLoad(0..1) module le régime et le niveau. */
  servo: {
    start({ pan = 0, load = 0.3 } = {}) {
      if (!enabled || !ready || servo) return false;
      const buf = buffers.get('servo-lit');
      if (!buf) { void decodeName('servo-lit'); return false; }
      if (ctx.state === 'suspended') void ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      let tail = gain;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        gain.connect(p); tail = p;
      }
      src.connect(filter); filter.connect(gain);
      gain.gain.value = 0.0001;
      audioParam(gain, 0.12 + 0.28 * Math.max(0, Math.min(1, load)), 0.25);
      tail.connect(master);
      src.start();
      servo = { src, gain, filter };
      return true;
    },
    /** load 0 = ralenti, 1 = charge. Adoucit et ralentit quand la charge baisse. */
    setLoad(load = 0.3) {
      if (!servo) return false;
      const x = Math.max(0, Math.min(1, load));
      audioParam(servo.gain, 0.12 + 0.28 * x, 0.2);
      if (servo.src.playbackRate) servo.src.playbackRate.setTargetAtTime(0.9 + 0.18 * x, ctx.currentTime, 0.2);
      return true;
    },
    stop({ fade = 0.35 } = {}) {
      if (!servo) return false;
      const s = servo; servo = null;
      audioParam(s.gain, 0.0001, fade / 3);
      try { s.src.stop(ctx.currentTime + fade); } catch { /* déjà arrêté */ }
      setTimeout(() => { try { s.gain.disconnect(); s.filter.disconnect(); } catch { /* */ } }, (fade + 0.4) * 1000);
      return true;
    },
    isRunning() { return !!servo; },
  },

  /** Suspend le contexte quand l'onglet passe en arrière-plan, reprend au retour. */
  attachLifecycle() {
    if (typeof document === 'undefined' || lifecycleHandler) return false;
    lifecycleHandler = () => {
      if (!ctx) return;
      if (document.hidden) { wasRunning = ctx.state === 'running'; if (wasRunning) void ctx.suspend(); }
      else if (wasRunning && enabled) { void ctx.resume(); wasRunning = false; }
    };
    document.addEventListener('visibilitychange', lifecycleHandler);
    return true;
  },
  detachLifecycle() {
    if (typeof document === 'undefined' || !lifecycleHandler) return false;
    document.removeEventListener('visibilitychange', lifecycleHandler);
    lifecycleHandler = null;
    return true;
  },
  unlock,
  mute(v = true) { return setEnabled(!v); },
  status() {
    return {
      ok: ready,
      enabled,
      state: ctx ? ctx.state : 'none',
      decoded: [...buffers.keys()],
      missing: [...missing],
      samples: manifest ? manifest.samples.length : 0,
      servo: !!servo,
    };
  },
  /** Décode à l'avance des sons précis (à appeler pendant un écran de chargement). */
  async preload(names = []) {
    if (!ready) return [];
    await Promise.all(names.map((n) => decodeName(n)));
    return [...buffers.keys()];
  },
};

/* ------------------------------------------------------------------------- *
 * Façade événementielle — les noms convenus avec le rendu.
 * Un événement de simulation appelle UNE fonction. Toutes renvoient un booléen
 * (true = un son est parti) et aucune ne lève.
 * ------------------------------------------------------------------------- */

/** Appui de pas. `intensity` 0..1 module le niveau, `pan` -1..1 la place. */
export function onStep(intensity = 1, pan = 0) {
  return audio.step({ pan, intensity });
}

/** Montée en charge des servomoteurs au démarrage (5 s, volume croissant). */
export function onServoCharge(pan = 0) {
  return audio.servoSurge({ pan });
}

/** Rafale de bolter lourd : trois départs, douilles sur la tôle, écho. */
export function onBolterBurst(pan = 0) {
  return audio.bolt({ pan });
}

/** Charge du gantelet (2 s) — à appeler sur l'annonce, l'impact tombe après. */
export function onFistCharge(pan = 0) {
  return play('gantelet-charge', { pan });
}

/** Impact du gantelet : thud + queue de résonance. */
export function onFistImpact(pan = 0) {
  return play('gantelet-impact', { pan });
}

/**
 * Contact. `kind` : 'claw' (griffe qui mord), 'armor' (griffes sur l'armure,
 * pas d'entaille), 'miss' (coup dans le vide). Défaut : 'claw'.
 */
export function onHit(kind = 'claw', pan = 0) {
  if (kind === 'armor') return audio.gauntletArc({ pan });
  if (kind === 'miss') return audio.whiff({ pan });
  return audio.claw({ pan });
}

/**
 * Alarmes de servo : la charge saute d'un coup. Si le lit ne tourne pas, on le
 * démarre déjà chargé ; sinon on monte la charge et on ajoute un craquement.
 * Composite, donc — pas un fichier unique.
 */
export function onServoAlarm(pan = 0) {
  if (!audio.servo.isRunning()) return audio.servo.start({ pan, load: 1 });
  const ok = audio.servo.setLoad(1);
  audio.servoCreak({ pan });
  return ok;
}

/** Lit de servomoteurs : démarrer / régler la charge / arrêter. */
export const onServoLoop = {
  start: (opts) => audio.servo.start(opts),
  load: (x) => audio.servo.setLoad(x),
  stop: (opts) => audio.servo.stop(opts),
};

export { audio as default };
