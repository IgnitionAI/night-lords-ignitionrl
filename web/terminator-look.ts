// Finish visuel du Terminator uniquement. Ne touche ni la sim, ni la foulée, ni les clips.
import * as THREE from 'three';
import { TERM_LOOK } from './atmosphere';

export { TERM_LOOK };

export function metallicRoughnessIsDummy(tex: THREE.Texture | null | undefined): boolean {
  if (!tex?.image) return true;
  const img = tex.image as { data?: ArrayLike<number>; width?: number; height?: number };
  if (!img.data || !img.width || !img.height) return false;
  const n = img.width * img.height;
  const stride = img.data.length / n;
  if (!(stride >= 3)) return true;
  let sg = 0, sb = 0;
  for (let i = 0; i < img.data.length; i += stride) {
    sg += img.data[i + 1];
    sb += img.data[i + 2];
  }
  return (sb / n) / 255 < TERM_LOOK.dummyMetalMax && (sg / n) / 255 > TERM_LOOK.dummyRoughMin;
}

function sourceSize(img: { width?: number; height?: number; videoWidth?: number; videoHeight?: number }): { w: number; h: number } {
  const w = img.width || img.videoWidth || 0;
  const h = img.height || img.videoHeight || 0;
  return { w, h };
}

function rebuildMetallicRoughness(albedo: THREE.Texture | null): THREE.CanvasTexture | null {
  if (typeof document === 'undefined' || !albedo?.image) return null;
  const { w, h } = sourceSize(albedo.image);
  if (!(w > 0 && h > 0)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(albedo.image as CanvasImageSource, 0, 0, w, h);
  const pix = ctx.getImageData(0, 0, w, h);
  const d = pix.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = max > 1e-5 ? 1 - min / max : 0;
    // ivoire / acier : lumineux, peu saturé → métal ; peinture rouge : satinée, métal plus bas.
    let metal = 0.28 + 0.62 * lum * (1 - 0.50 * sat) + (sat < 0.22 && lum > 0.42 ? 0.18 : 0);
    let rough = 0.60 - 0.34 * metal + 0.14 * sat;
    if (lum < 0.05) { metal = 0.48; rough = 0.70; }
    d[i] = 0;
    d[i + 1] = Math.round(Math.min(0.78, Math.max(0.26, rough)) * 255);
    d[i + 2] = Math.round(Math.min(0.92, Math.max(0.22, metal)) * 255);
  }
  ctx.putImageData(pix, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = albedo.flipY;
  tex.wrapS = albedo.wrapS;
  tex.wrapT = albedo.wrapT;
  tex.needsUpdate = true;
  return tex;
}

function injectTerminatorShader(mat: THREE.MeshStandardMaterial, tell: { value: number }): void {
  const visor = TERM_LOOK.visor;
  const rim = TERM_LOOK.rim;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTell = tell;
    sh.fragmentShader = 'uniform float uTell;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
       float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
       float visor = 1.0 - smoothstep(0.0008, ${visor.lumMax.toFixed(4)}, lum);
       totalEmissiveRadiance += vec3(${visor.r.toFixed(3)}, ${visor.g.toFixed(3)}, ${visor.b.toFixed(3)}) * visor * ${visor.gain.toFixed(3)};`)
      .replace('#include <fog_fragment>', `
       float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), ${rim.pow.toFixed(2)});
       vec3 rimCol = mix(vec3(${rim.r.toFixed(3)}, ${rim.g.toFixed(3)}, ${rim.b.toFixed(3)}), vec3(0.85, 0.12, 0.05), uTell);
       gl_FragColor.rgb += rimCol * fres * (${rim.amt.toFixed(3)} + 1.4 * uTell);
       #include <fog_fragment>`);
  };
}

export function applyTerminatorLook(mat: THREE.MeshStandardMaterial, tell: { value: number }): void {
  mat.side = THREE.FrontSide;
  mat.fog = true;
  mat.color.multiplyScalar(TERM_LOOK.albedoDim);
  mat.color.r *= TERM_LOOK.warmth.r;
  mat.color.g *= TERM_LOOK.warmth.g;
  mat.color.b *= TERM_LOOK.warmth.b;
  mat.metalness = TERM_LOOK.metalness;
  mat.roughness = TERM_LOOK.roughness;
  mat.envMapIntensity = 0.35;
  // Toujours jeter la MR dummy Genex. En navigateur l'image est un HTMLImageElement (pas de `.data`) :
  // on ne peut pas l'échantillonner ici ; la mesure hors-bandeau (B≈0,018) est dans le test.
  const rebuilt = rebuildMetallicRoughness(mat.map);
  mat.metalnessMap = rebuilt;
  mat.roughnessMap = rebuilt;
  mat.emissive.setRGB(0, 0, 0);
  mat.emissiveIntensity = 1;
  injectTerminatorShader(mat, tell);
  mat.needsUpdate = true;
  mat.userData.terminatorLook = true;
}
