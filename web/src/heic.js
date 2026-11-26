// Convert HEIC to JPEG in the browser (plugin: studio.heic).
// Decodes HEIC/HEIF (and other browser-readable images) onto a canvas and exports JPEG without uploading files.

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_EDIT = /\b(?:website|web ?site|site|app|application|page|script|code|tutorial|guide|library|package|cli)\b/;

export function parseHeicCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80 || QUESTION.test(t) || NON_EDIT.test(t)) return null;
  if (
    /^(?:please\s+|can you\s+|could you\s+|would you\s+)?(?:convert|turn|change|save|export)\s+(?:(?:this|it|these|them|(?:this|the|my)\s+(?:heic|heif|photo|photos|image|images|picture|pictures|pic|pics|file|files))\s+)?(?:to|into|as)\s+(?:a\s+)?jpe?g(?:\s+(?:format|file|files|image|images|photo|photos))?$/.test(t)
    || /^(?:please\s+|can you\s+|could you\s+|would you\s+)?(?:convert|make)\s+(?:heic|heif)\s+(?:to|into)\s+jpe?g$/.test(t)
    || /^(?:heic|heif)\s+to\s+jpe?g$/.test(t)
    || /^(?:please\s+|can you\s+|could you\s+)?make\s+(?:this|it)\s+(?:a\s+)?jpe?g$/.test(t)
  ) {
    return {cmd: 'convertToJpeg'};
  }
  return null;
}

export function isHeicFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '');
  return /^image\/heic(?:-sequence)?$|^image\/heif(?:-sequence)?$/.test(type) || /\.(heic|heif|hif)$/i.test(name);
}

export function isConvertibleFile(file) {
  if (!file) return false;
  if (isHeicFile(file)) return true;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '');
  return /^image\//.test(type) || /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)$/i.test(name);
}

export function isHeicBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 16) return false;
  const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (ftyp !== 'ftyp') return false;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxSize = Math.min(bytes.length, dv.getUint32(0, false) || bytes.length);
  const brand = (offset) => String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  if (HEIC_BRANDS.has(brand(8))) return true;
  for (let i = 16; i + 4 <= boxSize; i += 4) {
    if (HEIC_BRANDS.has(brand(i))) return true;
  }
  return false;
}

export function jpegName(name) {
  const base = String(name || 'image').trim() || 'image';
  const stripped = base.replace(/\.(heic|heif|hif|png|webp|avif|gif|bmp|tiff?|jpe?g)$/i, '');
  return (stripped || 'image') + '.jpg';
}

export function clampQuality(quality) {
  const q = Number(quality);
  if (!Number.isFinite(q)) return 0.92;
  return Math.min(1, Math.max(0.1, q));
}

export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v >= 1048576) return (v / 1048576).toFixed(1) + ' MB';
  if (v >= 1024) return Math.round(v / 1024) + ' KB';
  return v + ' B';
}

function sourceToBlob(source) {
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    if (source.type) return source;
    const type = isHeicFile(source) ? 'image/heic' : 'image/png';
    return source.slice(0, source.size, type);
  }
  if (source && typeof source.content === 'string') {
    const bin = atob(source.content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const type = source.type || (isHeicFile(source) ? 'image/heic' : 'image/png');
    return new Blob([bytes], {type});
  }
  throw new Error('No image provided.');
}

async function decodeImage(blob, source) {
  const mime = blob.type || (isHeicFile(source) ? 'image/heic' : '');
  if (typeof ImageDecoder !== 'undefined' && mime) {
    try {
      if (await ImageDecoder.isTypeSupported(mime)) {
        const dec = new ImageDecoder({data: await blob.arrayBuffer(), type: mime});
        const {image} = await dec.decode();
        return {
          width: image.displayWidth || image.codedWidth,
          height: image.displayHeight || image.codedHeight,
          draw: (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h),
          close: () => { try { image.close(); dec.close(); } catch {} },
        };
      }
    } catch { /* fall through to createImageBitmap / Image */ }
  }
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      return {
        width: bmp.width,
        height: bmp.height,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
        close: () => { try { bmp.close(); } catch {} },
      };
    } catch { /* fall through to Image element */ }
  }
  if (typeof Image !== 'undefined') {
    return new Promise((resolve, reject) => {
      const im = new Image();
      const url = URL.createObjectURL(blob);
      const cleanup = () => URL.revokeObjectURL(url);
      im.onload = () => {
        cleanup();
        resolve({
          width: im.naturalWidth || im.width,
          height: im.naturalHeight || im.height,
          draw: (ctx, w, h) => ctx.drawImage(im, 0, 0, w, h),
          close: () => {},
        });
      };
      im.onerror = () => {
        cleanup();
        reject(new Error(isHeicFile(source)
          ? 'This browser cannot decode HEIC files directly. Try Safari on macOS/iOS or Edge with the Windows HEIF Image Extension.'
          : 'Could not read that image. Try a HEIC, PNG, WebP, or JPEG file.'));
      };
      im.src = url;
    });
  }
  throw new Error('This browser cannot decode that image.');
}

function encodeCanvasJpeg(decoded, quality) {
  return new Promise((resolve, reject) => {
    const w = decoded.width;
    const h = decoded.height;
    if (!w || !h) { reject(new Error('Image has zero dimensions.')); return; }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    decoded.draw(ctx, w, h);
    c.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Could not encode JPEG.')); return; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      resolve({blob, bytes, width: w, height: h});
    }, 'image/jpeg', quality);
  });
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c >>> 0;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const sum = crc32(data);

    const lh = new Uint8Array(30 + name.length);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint16(6, 0x0800, true);
    ldv.setUint16(8, 0, true);
    ldv.setUint16(10, 0, true);
    ldv.setUint16(12, 0x5421, true);
    ldv.setUint32(14, sum, true);
    ldv.setUint32(18, data.length, true);
    ldv.setUint32(22, data.length, true);
    ldv.setUint16(26, name.length, true);
    ldv.setUint16(28, 0, true);
    lh.set(name, 30);
    locals.push(lh, data);

    const ch = new Uint8Array(46 + name.length);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0x5421, true);
    cdv.setUint32(16, sum, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, name.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    ch.set(name, 46);
    centrals.push(ch);

    offset += lh.length + data.length;
  }

  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, offset, true);
  edv.setUint16(20, 0, true);

  const out = new Uint8Array(offset + cdSize + eocd.length);
  let p = 0;
  for (const part of locals) { out.set(part, p); p += part.length; }
  for (const part of centrals) { out.set(part, p); p += part.length; }
  out.set(eocd, p);
  return out;
}

export async function convertToJpeg(source, {
  quality = 0.92,
  decode = decodeImage,
  encode = encodeCanvasJpeg,
  makeUrl = (blob) => URL.createObjectURL(blob),
  revokeUrl = (url) => URL.revokeObjectURL(url),
} = {}) {
  const blob = sourceToBlob(source);
  const q = clampQuality(quality);
  const decoded = await decode(blob, source);
  let out;
  try {
    out = await encode(decoded, q);
  } finally {
    decoded?.close?.();
  }
  const url = makeUrl(out.blob || new Blob([out.bytes], {type: 'image/jpeg'}));
  const originalName = (source && source.name) || 'image.heic';
  const name = jpegName(originalName);
  const size = out.bytes ? out.bytes.length : (out.blob?.size || 0);
  return {
    name,
    originalName,
    originalSize: blob.size,
    size,
    width: out.width,
    height: out.height,
    quality: q,
    bytes: out.bytes,
    url,
    dispose: () => revokeUrl(url),
  };
}
