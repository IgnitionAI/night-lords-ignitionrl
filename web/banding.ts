// Mesure de banding (paliers de luminance) sur un tampon RGBA8. Rien ici ne touche la sim.

export type Roi = { x: number; y: number; w: number; h: number };

export type BandingStats = {
  pixels: number;
  uniqueLuma: number;
  lumaMin: number;
  lumaMax: number;
  span: number;
  occupancy: number;
  maxRun: number;
  meanRun: number;
  stepsGe2: number;
};

export function luma8(r: number, g: number, b: number): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

export function bandingStats(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  roi: Roi,
): BandingStats {
  const x0 = Math.max(0, roi.x | 0);
  const y0 = Math.max(0, roi.y | 0);
  const x1 = Math.min(width, x0 + Math.max(0, roi.w | 0));
  const y1 = Math.min(height, y0 + Math.max(0, roi.h | 0));
  const levels = new Uint32Array(256);
  let pixels = 0;
  let maxRun = 1;
  let sumRun = 0;
  let nRuns = 0;
  let stepsGe2 = 0;
  for (let y = y0; y < y1; y++) {
    let prev = -1;
    let run = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const L = luma8(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
      levels[L]!++;
      pixels++;
      if (L === prev) run++;
      else {
        if (run > 0) {
          maxRun = Math.max(maxRun, run);
          sumRun += run;
          nRuns++;
        }
        if (prev >= 0 && Math.abs(L - prev) >= 2) stepsGe2++;
        run = 1;
        prev = L;
      }
    }
    if (run > 0) {
      maxRun = Math.max(maxRun, run);
      sumRun += run;
      nRuns++;
    }
  }
  let uniqueLuma = 0;
  let lumaMin = 255;
  let lumaMax = 0;
  for (let i = 0; i < 256; i++) {
    if (levels[i]!) {
      uniqueLuma++;
      lumaMin = Math.min(lumaMin, i);
      lumaMax = Math.max(lumaMax, i);
    }
  }
  const span = Math.max(0, lumaMax - lumaMin);
  return {
    pixels,
    uniqueLuma,
    lumaMin: pixels ? lumaMin : 0,
    lumaMax: pixels ? lumaMax : 0,
    span,
    occupancy: span + 1 > 0 ? uniqueLuma / (span + 1) : 0,
    maxRun,
    meanRun: nRuns ? sumRun / nRuns : 0,
    stepsGe2,
  };
}

/** Banding basse fréquence : moyennes 8×8, insensible au grain haute fréquence. */
export function blockBandingStats(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  roi: Roi,
  block = 8,
): BandingStats {
  const x0 = Math.max(0, roi.x | 0);
  const y0 = Math.max(0, roi.y | 0);
  const x1 = Math.min(width, x0 + Math.max(0, roi.w | 0));
  const y1 = Math.min(height, y0 + Math.max(0, roi.h | 0));
  const bw = Math.max(1, Math.floor((x1 - x0) / block));
  const bh = Math.max(1, Math.floor((y1 - y0) / block));
  const means: number[] = [];
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let s = 0;
      let n = 0;
      const xs = x0 + bx * block;
      const ys = y0 + by * block;
      for (let y = ys; y < ys + block; y++) {
        for (let x = xs; x < xs + block; x++) {
          const i = (y * width + x) * 4;
          s += luma8(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
          n++;
        }
      }
      means.push(Math.round(s / n));
    }
  }
  const levels = new Uint32Array(256);
  let maxRun = 1;
  let sumRun = 0;
  let nRuns = 0;
  let stepsGe2 = 0;
  for (let by = 0; by < bh; by++) {
    let prev = -1;
    let run = 0;
    for (let bx = 0; bx < bw; bx++) {
      const L = means[by * bw + bx]!;
      levels[L]!++;
      if (L === prev) run++;
      else {
        if (run > 0) {
          maxRun = Math.max(maxRun, run);
          sumRun += run;
          nRuns++;
        }
        if (prev >= 0 && Math.abs(L - prev) >= 2) stepsGe2++;
        run = 1;
        prev = L;
      }
    }
    if (run > 0) {
      maxRun = Math.max(maxRun, run);
      sumRun += run;
      nRuns++;
    }
  }
  let uniqueLuma = 0;
  let lumaMin = 255;
  let lumaMax = 0;
  for (let i = 0; i < 256; i++) {
    if (levels[i]!) {
      uniqueLuma++;
      lumaMin = Math.min(lumaMin, i);
      lumaMax = Math.max(lumaMax, i);
    }
  }
  const span = Math.max(0, lumaMax - lumaMin);
  return {
    pixels: means.length,
    uniqueLuma,
    lumaMin: means.length ? lumaMin : 0,
    lumaMax: means.length ? lumaMax : 0,
    span,
    occupancy: span + 1 > 0 ? uniqueLuma / (span + 1) : 0,
    maxRun,
    meanRun: nRuns ? sumRun / nRuns : 0,
    stepsGe2,
  };
}

export function meanLuma(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, roi: Roi): number {
  const x0 = Math.max(0, roi.x | 0);
  const y0 = Math.max(0, roi.y | 0);
  const x1 = Math.min(width, x0 + Math.max(0, roi.w | 0));
  const y1 = Math.min(height, y0 + Math.max(0, roi.h | 0));
  let s = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      s += luma8(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
      n++;
    }
  }
  return n ? s / n : 0;
}
