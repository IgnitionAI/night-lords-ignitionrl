import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene, type SasDiagnostics } from './Scene';
import { qualityFor, type Quality } from './physics';

declare global { interface Window { __SAS?: SasDiagnostics } }

class WebGLBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() {
    if (this.state.failed) return <div className="error"><div><h1>Le Sas</h1><p>WebGL n’est pas disponible dans ce navigateur.<br />La démo nécessite un navigateur avec accélération graphique.</p></div></div>;
    return this.props.children;
  }
}

export function App() {
  const params = new URLSearchParams(location.search);
  const [ready, setReady] = useState(false);
  const [assetFallback, setAssetFallback] = useState(false);
  const [shots, setShots] = useState(0);
  const [cooldown, setCooldown] = useState(false);
  const [quality, setQuality] = useState<Quality>(() => qualityFor(innerWidth, params.get('quality')));
  const [failed, setFailed] = useState(false);
  const fireRef = useRef<() => void>(() => {});
  const resetRef = useRef<() => void>(() => {});
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fire = useCallback(() => { if (!cooldown && ready) fireRef.current(); }, [cooldown, ready]);
  const reset = useCallback(() => { resetRef.current(); setShots(0); setCooldown(false); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); fire(); }
      if (e.code === 'KeyR') reset();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [fire, reset]);

  return <main className="stage">
    <WebGLBoundary onFailure={() => setFailed(true)}>{!failed && <Canvas
      shadows={quality === 'high'}
      dpr={quality === 'high' ? Math.min(devicePixelRatio, 1.5) : 1}
      camera={{ position: [3.7, 3.15, 8.7], fov: innerWidth < 650 ? 66 : 53, near: 0.1, far: 80 }}
      gl={{ antialias: quality === 'high', powerPreference: 'high-performance', alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.92;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      onError={() => setFailed(true)}
    >
      <Suspense fallback={null}>
        <Scene quality={quality} reducedMotion={reduced} debug={params.get('debug') === '1'}
          onReady={(fallback) => { setReady(true); setAssetFallback(fallback); }}
          onFire={() => { setShots(v => v + 1); setCooldown(true); setTimeout(() => setCooldown(false), 850); }}
          fireRef={fireRef} resetRef={resetRef} />
      </Suspense>
    </Canvas>}</WebGLBoundary>
    <div className="hud" aria-hidden={failed}>
      <div className="top"><div><div className="eyebrow">IgnitionRL · Expérience 01</div><h1 className="title">Le Sas</h1><p className="subtitle">Une rafale. Sept caisses. Une présence.</p></div><div className="status"><i></i>{ready ? 'Système prêt' : 'Initialisation'}<br />R3F · Rapier</div></div>
      <div className="bottom"><div className="brief"><strong>Le métal ne ment pas.</strong><span>Chaque caisse est un corps physique. Ouvrez le passage. Regardez ce qu’il révèle.</span></div><div className="controls"><button className="quality" onClick={() => setQuality(q => q === 'high' ? 'low' : 'high')} aria-label="Changer la qualité">{quality === 'high' ? 'HQ' : 'Éco'}</button><button className="reset" onClick={reset} disabled={!ready}>Recommencer</button><button className="fire" onClick={fire} disabled={!ready || cooldown}>{cooldown ? 'Recharge' : shots ? 'Rafale ↗' : 'Rafale →'}</button></div></div>
    </div>
    <div className="footer">Espace pour tirer · R pour recommencer · vignette physique, pas une manche RL</div>
    {assetFallback && <div className="notice">Assets locaux absents · repli procédural actif</div>}
    {!ready && !failed && <div className="loading"><div><b>LE SAS</b><span>CHARGEMENT DE LA PHYSIQUE</span></div></div>}
  </main>;
}
