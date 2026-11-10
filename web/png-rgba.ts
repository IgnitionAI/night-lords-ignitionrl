// Décodeur PNG 8 bits RGBA (captures Playwright). Pas de dépendance.
import { inflateSync } from 'node:zlib';

export function decodePngRgba(buf: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const b = Buffer.from(buf);
  if (b.length < 8 || b.toString('ascii', 1, 4) !== 'PNG') throw new Error('pas un PNG');
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idats: Buffer[] = [];
  while (off + 12 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === 'IDAT') idats.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`PNG non RGB/RGBA8 (depth=${bitDepth} type=${colorType})`);
  }
  const raw = inflateSync(Buffer.concat(idats));
  const srcBpp = colorType === 6 ? 4 : 3;
  const srcStride = width * srcBpp;
  const decoded = new Uint8Array(height * srcStride);
  let src = 0;
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[src++]!;
    const row = decoded.subarray(y * srcStride, (y + 1) * srcStride);
    const prev = y > 0 ? decoded.subarray((y - 1) * srcStride, y * srcStride) : null;
    for (let x = 0; x < srcStride; x++) {
      const v = raw[src++]!;
      const a = x >= srcBpp ? row[x - srcBpp]! : 0;
      const bUp = prev ? prev[x]! : 0;
      const c = prev && x >= srcBpp ? prev[x - srcBpp]! : 0;
      let u = v;
      if (filter === 1) u = (v + a) & 255;
      else if (filter === 2) u = (v + bUp) & 255;
      else if (filter === 3) u = (v + ((a + bUp) >> 1)) & 255;
      else if (filter === 4) u = (v + paeth(a, bUp, c)) & 255;
      else if (filter !== 0) throw new Error(`filtre PNG ${filter}`);
      row[x] = u;
    }
  }
  if (colorType === 6) return { width, height, rgba: decoded };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, p = 0; i < decoded.length; i += 3, p += 4) {
    rgba[p] = decoded[i]!; rgba[p + 1] = decoded[i + 1]!; rgba[p + 2] = decoded[i + 2]!; rgba[p + 3] = 255;
  }
  return { width, height, rgba };
}
