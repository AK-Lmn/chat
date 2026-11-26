// Plugin studio.sign-pdf: sign PDFs directly in the browser without uploading them.
// Supports classic xref tables and PDF 1.5+ cross-reference/object streams via incremental updates.

const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_SIGN = /\b(?:write|build|website|app|code|script|tutorial|guide|essay|story|sign\s+in|sign\s+up|zodiac|stop\s+sign|neon\s+sign|road\s+sign|street\s+sign|traffic\s+sign)\b/;

export function parseSignPdfCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80 || QUESTION.test(t) || NON_SIGN.test(t)) return null;
  if (
    /^(?:please\s+|can you\s+|could you\s+|would you\s+)?sign\s+(?:this|it|(?:this|the|my|a)\s+(?:pdf|doc|document|file))(?:\s+(?:for me|now|please))?$/.test(t)
    || /^(?:please\s+|can you\s+|could you\s+|would you\s+)?(?:add|put|place|insert|stamp)\s+(?:my\s+|a\s+)?signature(?:\s+(?:on|to|in)\s+(?:this|it|(?:this|the|my)\s+(?:pdf|doc|document|file)))?$/.test(t)
    || /^sign\s+a\s+pdf$/.test(t)
  ) {
    return {cmd: 'signPdf'};
  }
  return null;
}

export async function readPdfBytes(source) {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (source && typeof source.arrayBuffer === 'function') return new Uint8Array(await source.arrayBuffer());
  if (source && typeof source.content === 'string') {
    if (source.b64) {
      const bin = atob(source.content);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(source.content);
  }
  throw new Error('Choose a PDF file first.');
}

// Crops transparent margins from a canvas ImageData buffer; returns null if blank.
export function trimSignatureRgba(rgba, width, height, pad = 4) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(width - 1, maxX + pad);
  const y1 = Math.min(height - 1, maxY + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcOff = ((y0 + row) * width + x0) * 4;
    out.set(rgba.subarray(srcOff, srcOff + w * 4), row * w * 4);
  }
  return {width: w, height: h, rgba: out};
}

const enc = new TextEncoder();
const dec = new TextDecoder('latin1');

const isWs = (b) => b === 0 || b === 9 || b === 10 || b === 12 || b === 13 || b === 32;
const isDelim = (b) => b === 40 || b === 41 || b === 60 || b === 62 || b === 91 || b === 93 || b === 123 || b === 125 || b === 47 || b === 37;

function skipWs(bytes, i, end = bytes.length) {
  while (i < end) {
    const b = bytes[i];
    if (isWs(b)) { i++; continue; }
    if (b === 37) {
      while (i < end && bytes[i] !== 10 && bytes[i] !== 13) i++;
      continue;
    }
    break;
  }
  return i;
}

function readTokenEnd(bytes, i, end = bytes.length) {
  if (i >= end) return i;
  const b = bytes[i];
  if (b === 40) { // (...) literal string
    let depth = 1;
    i++;
    while (i < end && depth > 0) {
      if (bytes[i] === 92) { i += 2; continue; }
      if (bytes[i] === 40) depth++;
      else if (bytes[i] === 41) depth--;
      i++;
    }
    return i;
  }
  if (b === 60 && bytes[i + 1] === 60) { // <<...>> dict
    i += 2;
    while (i < end) {
      i = skipWs(bytes, i, end);
      if (i + 1 < end && bytes[i] === 62 && bytes[i + 1] === 62) return i + 2;
      const next = readTokenEnd(bytes, i, end);
      if (next <= i) break;
      i = next;
    }
    return i;
  }
  if (b === 60) { // <...> hex string
    i++;
    while (i < end && bytes[i] !== 62) i++;
    return i < end ? i + 1 : i;
  }
  if (b === 91) { // [...] array
    i++;
    while (i < end) {
      i = skipWs(bytes, i, end);
      if (i < end && bytes[i] === 93) return i + 1;
      const next = readTokenEnd(bytes, i, end);
      if (next <= i) break;
      i = next;
    }
    return i;
  }
  if (b === 47) { // /Name
    i++;
    while (i < end && !isWs(bytes[i]) && !isDelim(bytes[i])) i++;
    return i;
  }
  while (i < end && !isWs(bytes[i]) && !isDelim(bytes[i])) i++;
  return i;
}

function parseDictEntries(bytes, start, end = bytes.length) {
  let i = skipWs(bytes, start, end);
  if (bytes[i] !== 60 || bytes[i + 1] !== 60) return null;
  i += 2;
  const entries = [];
  while (i < end) {
    i = skipWs(bytes, i, end);
    if (i + 1 < end && bytes[i] === 62 && bytes[i + 1] === 62) {
      return {entries, start, end: i + 2};
    }
    if (bytes[i] !== 47) break;
    const kEnd = readTokenEnd(bytes, i, end);
    const key = dec.decode(bytes.subarray(i + 1, kEnd));
    let vStart = skipWs(bytes, kEnd, end);
    let vEnd = readTokenEnd(bytes, vStart, end);
    // Check for indirect reference: "<num> <gen> R"
    if (vEnd > vStart && bytes[vStart] >= 48 && bytes[vStart] <= 57) {
      const gStart = skipWs(bytes, vEnd, end);
      const gEnd = readTokenEnd(bytes, gStart, end);
      const rStart = skipWs(bytes, gEnd, end);
      const rEnd = readTokenEnd(bytes, rStart, end);
      if (rEnd - rStart === 1 && bytes[rStart] === 82) {
        const gTxt = dec.decode(bytes.subarray(gStart, gEnd));
        if (/^\d+$/.test(gTxt)) vEnd = rEnd;
      }
    }
    entries.push({key, valStart: vStart, valEnd: vEnd, raw: dec.decode(bytes.subarray(vStart, vEnd))});
    i = vEnd;
  }
  return null;
}

function parseArrayItems(bytes, start, end = bytes.length) {
  let i = skipWs(bytes, start, end);
  if (bytes[i] !== 91) return null;
  i++;
  const items = [];
  while (i < end) {
    i = skipWs(bytes, i, end);
    if (i < end && bytes[i] === 93) return items;
    const tStart = i;
    let tEnd = readTokenEnd(bytes, tStart, end);
    if (tEnd <= tStart) break;
    if (bytes[tStart] >= 48 && bytes[tStart] <= 57) {
      const gStart = skipWs(bytes, tEnd, end);
      const gEnd = readTokenEnd(bytes, gStart, end);
      const rStart = skipWs(bytes, gEnd, end);
      const rEnd = readTokenEnd(bytes, rStart, end);
      if (rEnd - rStart === 1 && bytes[rStart] === 82 && /^\d+$/.test(dec.decode(bytes.subarray(gStart, gEnd)))) {
        tEnd = rEnd;
      }
    }
    items.push(dec.decode(bytes.subarray(tStart, tEnd)));
    i = tEnd;
  }
  return items;
}

const parseRef = (raw) => {
  const m = String(raw || '').trim().match(/^(\d+)\s+(\d+)\s+R$/);
  return m ? Number(m[1]) : null;
};

const parseNumArray = (bytes, s, e) => {
  const items = parseArrayItems(bytes, s, e);
  return items ? items.map(Number).filter((n) => Number.isFinite(n)) : null;
};

async function runStream(TransformCtor, bytes) {
  const tr = new TransformCtor('deflate');
  const w = tr.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(tr.readable).arrayBuffer());
}

async function inflateBytes(bytes) {
  if (typeof DecompressionStream !== 'undefined') return runStream(DecompressionStream, bytes);
  throw new Error('This browser cannot decompress compressed PDF streams.');
}

async function deflateBytes(bytes) {
  if (typeof CompressionStream !== 'undefined') {
    return {bytes: await runStream(CompressionStream, bytes), compressed: true};
  }
  return {bytes, compressed: false};
}

function unfilterPng(data, cols, predictor) {
  if (predictor < 10) return data;
  const stride = cols + 1;
  const rows = Math.floor(data.length / stride);
  const out = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const type = data[r * stride];
    const src = r * stride + 1;
    const dst = r * cols;
    for (let c = 0; c < cols; c++) {
      const raw = data[src + c];
      const up = r > 0 ? out[dst - cols + c] : 0;
      const left = c > 0 ? out[dst + c - 1] : 0;
      const ul = r > 0 && c > 0 ? out[dst - cols + c - 1] : 0;
      let v = raw;
      if (type === 1) v = (raw + left) & 0xff;
      else if (type === 2) v = (raw + up) & 0xff;
      else if (type === 3) v = (raw + ((left + up) >> 1)) & 0xff;
      else if (type === 4) {
        const p = left + up - ul;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        v = (raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul)) & 0xff;
      }
      out[dst + c] = v;
    }
  }
  return out;
}

function findStreamBounds(bytes, dictEnd) {
  const tail = dec.decode(bytes.subarray(dictEnd, Math.min(bytes.length, dictEnd + 64)));
  const m = tail.match(/^\s*stream(?:\r\n|\n|\r)/);
  if (!m) return null;
  return dictEnd + m[0].length;
}

function entryOf(dict, key) {
  return dict?.entries.find((e) => e.key === key) || null;
}

function readUintBE(bytes, pos, len) {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + bytes[pos + i];
  return v;
}

function findStartXref(bytes) {
  const tailStart = Math.max(0, bytes.length - 4096);
  const tail = dec.decode(bytes.subarray(tailStart));
  const matches = [...tail.matchAll(/startxref\s+(\d+)/g)];
  if (!matches.length) return -1;
  return Number(matches[matches.length - 1][1]);
}

function parseClassicXref(bytes, offset) {
  const text = dec.decode(bytes.subarray(offset, Math.min(bytes.length, offset + 65536)));
  if (!/^xref\b/.test(text.trimStart())) return null;
  const trailerIdx = text.indexOf('trailer');
  if (trailerIdx < 0) return null;
  const map = new Map();
  const lines = text.slice(0, trailerIdx).split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim().startsWith('xref')) i++;
  i++;
  while (i < lines.length) {
    const l = lines[i].trim();
    if (!l) { i++; continue; }
    const sub = l.match(/^(\d+)\s+(\d+)$/);
    if (!sub) { i++; continue; }
    const startId = Number(sub[1]);
    const count = Number(sub[2]);
    i++;
    for (let k = 0; k < count && i < lines.length; k++, i++) {
      const m = lines[i].match(/^(\d{10})\s+(\d{5})\s+([nf])/);
      if (m && m[3] === 'n') map.set(startId + k, {type: 1, offset: Number(m[1])});
    }
  }
  const dict = parseDictEntries(bytes, offset + trailerIdx + 7);
  return {map, dict};
}

async function parseXrefStream(bytes, offset) {
  const head = dec.decode(bytes.subarray(offset, Math.min(bytes.length, offset + 64)));
  const m = head.match(/^\s*\d+\s+\d+\s+obj\b/);
  if (!m) return null;
  const dict = parseDictEntries(bytes, offset + m[0].length);
  if (!dict) return null;
  const typeE = entryOf(dict, 'Type');
  if (!typeE || typeE.raw.trim() !== '/XRef') return null;
  const wE = entryOf(dict, 'W');
  const lenE = entryOf(dict, 'Length');
  const sizeE = entryOf(dict, 'Size');
  if (!wE || !lenE || !sizeE) return null;
  const w = parseNumArray(bytes, wE.valStart, wE.valEnd);
  const length = Number(lenE.raw.trim());
  const size = Number(sizeE.raw.trim());
  const sStart = findStreamBounds(bytes, dict.end);
  if (sStart === null || !w || w.length !== 3) return null;
  let data = bytes.subarray(sStart, sStart + length);
  const filterE = entryOf(dict, 'Filter');
  if (filterE && filterE.raw.includes('/FlateDecode')) {
    data = await inflateBytes(data);
  }
  const dpE = entryOf(dict, 'DecodeParms');
  if (dpE) {
    const dp = parseDictEntries(bytes, dpE.valStart, dpE.valEnd);
    const pred = Number(entryOf(dp, 'Predictor')?.raw.trim() || 1);
    const cols = Number(entryOf(dp, 'Columns')?.raw.trim() || (w[0] + w[1] + w[2]));
    if (pred >= 10) data = unfilterPng(data, cols, pred);
  }
  const idxE = entryOf(dict, 'Index');
  const index = idxE ? parseNumArray(bytes, idxE.valStart, idxE.valEnd) : [0, size];
  const rowSize = w[0] + w[1] + w[2];
  const map = new Map();
  let pos = 0;
  for (let p = 0; p + 1 < index.length; p += 2) {
    const startId = index[p];
    const count = index[p + 1];
    for (let k = 0; k < count && pos + rowSize <= data.length; k++) {
      const type = w[0] === 0 ? 1 : readUintBE(data, pos, w[0]);
      const f2 = readUintBE(data, pos + w[0], w[1]);
      const f3 = readUintBE(data, pos + w[0] + w[1], w[2]);
      if (type === 1) map.set(startId + k, {type: 1, offset: f2});
      else if (type === 2) map.set(startId + k, {type: 2, stmId: f2, idx: f3});
      pos += rowSize;
    }
  }
  return {map, dict};
}

async function createObjectReader(bytes, xrefMap) {
  const objStmCache = new Map();

  async function readObjStm(stmId) {
    if (objStmCache.has(stmId)) return objStmCache.get(stmId);
    const loc = xrefMap.get(stmId);
    if (!loc || loc.type !== 1) return null;
    const head = dec.decode(bytes.subarray(loc.offset, Math.min(bytes.length, loc.offset + 64)));
    const m = head.match(/^\s*\d+\s+\d+\s+obj\b/);
    if (!m) return null;
    const dict = parseDictEntries(bytes, loc.offset + m[0].length);
    const len = Number(entryOf(dict, 'Length')?.raw.trim() || 0);
    const first = Number(entryOf(dict, 'First')?.raw.trim() || 0);
    const n = Number(entryOf(dict, 'N')?.raw.trim() || 0);
    const sStart = findStreamBounds(bytes, dict.end);
    if (sStart === null) return null;
    let raw = bytes.subarray(sStart, sStart + len);
    if (entryOf(dict, 'Filter')?.raw.includes('/FlateDecode')) raw = await inflateBytes(raw);
    const header = dec.decode(raw.subarray(0, first)).trim().split(/\s+/).map(Number);
    const offsets = [];
    for (let i = 0; i < n && i * 2 + 1 < header.length; i++) {
      offsets.push({id: header[i * 2], off: first + header[i * 2 + 1]});
    }
    const parsed = {raw, offsets};
    objStmCache.set(stmId, parsed);
    return parsed;
  }

  return async function readObjectDict(objNum) {
    const loc = xrefMap.get(objNum);
    if (!loc) return null;
    if (loc.type === 1) {
      const head = dec.decode(bytes.subarray(loc.offset, Math.min(bytes.length, loc.offset + 64)));
      const m = head.match(/^\s*\d+\s+\d+\s+obj\b/);
      if (!m) return null;
      const dict = parseDictEntries(bytes, loc.offset + m[0].length);
      return dict ? {dict, sourceBytes: bytes} : null;
    }
    const stm = await readObjStm(loc.stmId);
    if (!stm || !stm.offsets[loc.idx]) return null;
    const start = stm.offsets[loc.idx].off;
    const end = loc.idx + 1 < stm.offsets.length ? stm.offsets[loc.idx + 1].off : stm.raw.length;
    const dict = parseDictEntries(stm.raw, start, end);
    return dict ? {dict, sourceBytes: stm.raw} : null;
  };
}

export async function inspectPdf(input) {
  const bytes = await readPdfBytes(input);
  const head = dec.decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (!head.includes('%PDF-')) throw new Error('Not a valid PDF file.');
  const startXref = findStartXref(bytes);
  if (startXref < 0 || startXref >= bytes.length) throw new Error('Could not read the PDF structure.');

  const xrefMap = new Map();
  let newestTrailer = null;
  let isXrefStream = false;
  let cur = startXref;
  const seen = new Set();

  while (cur >= 0 && cur < bytes.length && !seen.has(cur)) {
    seen.add(cur);
    const classic = parseClassicXref(bytes, cur);
    const parsed = classic || await parseXrefStream(bytes, cur);
    if (!parsed || !parsed.dict) break;
    if (!classic && !newestTrailer) isXrefStream = true;
    if (!newestTrailer) newestTrailer = parsed.dict;
    for (const [id, loc] of parsed.map.entries()) {
      if (!xrefMap.has(id)) xrefMap.set(id, loc);
    }
    const prevE = entryOf(parsed.dict, 'Prev');
    cur = prevE ? Number(prevE.raw.trim()) : -1;
  }

  if (!newestTrailer) throw new Error('Could not read the PDF trailer.');
  if (entryOf(newestTrailer, 'Encrypt')) {
    throw new Error('Encrypted or password-protected PDFs cannot be signed in the browser.');
  }

  const size = Number(entryOf(newestTrailer, 'Size')?.raw.trim() || 0);
  const rootE = entryOf(newestTrailer, 'Root');
  const rootId = parseRef(rootE?.raw);
  if (!rootId || !size) throw new Error('PDF is missing its root catalog.');

  const readObjectDict = await createObjectReader(bytes, xrefMap);
  const rootObj = await readObjectDict(rootId);
  const pagesId = parseRef(entryOf(rootObj?.dict, 'Pages')?.raw);
  if (!pagesId) throw new Error('PDF is missing its pages tree.');

  const pages = [];
  async function walk(nodeId, inheritedBox, inheritedRes) {
    const obj = await readObjectDict(nodeId);
    if (!obj) return;
    const {dict, sourceBytes} = obj;
    const mbE = entryOf(dict, 'MediaBox');
    const cbE = entryOf(dict, 'CropBox');
    const resE = entryOf(dict, 'Resources');
    const mediaBox = mbE ? parseNumArray(sourceBytes, mbE.valStart, mbE.valEnd) : inheritedBox;
    const cropBox = cbE ? parseNumArray(sourceBytes, cbE.valStart, cbE.valEnd) : null;
    const resources = resE ? {entry: resE, sourceBytes} : inheritedRes;
    const type = entryOf(dict, 'Type')?.raw.trim();
    const kidsE = entryOf(dict, 'Kids');
    if (type === '/Pages' || kidsE) {
      const kids = kidsE ? parseArrayItems(sourceBytes, kidsE.valStart, kidsE.valEnd) : [];
      for (const k of kids || []) {
        const kidId = parseRef(k);
        if (kidId) await walk(kidId, mediaBox, resources);
      }
      return;
    }
    pages.push({
      objNum: nodeId,
      dict,
      sourceBytes,
      mediaBox: (mediaBox && mediaBox.length === 4 ? mediaBox : [0, 0, 612, 792]),
      cropBox: (cropBox && cropBox.length === 4 ? cropBox : null),
      inheritedResources: resources,
    });
  }

  await walk(pagesId, [0, 0, 612, 792], null);
  if (!pages.length) throw new Error('This PDF has no pages.');

  return {
    pageCount: pages.length,
    pages,
    size,
    rootRef: rootE.raw.trim(),
    startXref,
    isXrefStream,
    readObjectDict,
    rawBytes: bytes,
  };
}

function pdfLiteralString(s) {
  return '(' + String(s || '').replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1') + ')';
}

async function resolveSubDict(entry, sourceBytes, readObjectDict) {
  if (!entry) return [];
  const ref = parseRef(entry.raw);
  if (ref) {
    const obj = await readObjectDict(ref);
    return obj?.dict?.entries || [];
  }
  const d = parseDictEntries(sourceBytes, entry.valStart, entry.valEnd);
  return d?.entries || [];
}

function buildSubDictString(entries, extra) {
  const map = new Map();
  for (const e of entries) map.set(e.key, e.raw);
  for (const [k, v] of Object.entries(extra)) map.set(k, v);
  return '<< ' + [...map.entries()].map(([k, v]) => `/${k} ${v}`).join(' ') + ' >>';
}

function buildXrefStreamObj(objNum, totalSize, rootRef, prevXref, entries) {
  const minId = Math.min(...entries.map((e) => e.id));
  const maxId = Math.max(...entries.map((e) => e.id));
  // Build contiguous [id count] ranges for /Index
  const sorted = [...entries].sort((a, b) => a.id - b.id);
  const runs = [];
  for (const item of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.start + last.items.length === item.id) last.items.push(item);
    else runs.push({start: item.id, items: [item]});
  }
  const indexArr = runs.flatMap((r) => [r.start, r.items.length]).join(' ');
  const rowLen = 7; // W = [1 4 2]
  const data = new Uint8Array(sorted.length * rowLen);
  const dv = new DataView(data.buffer);
  sorted.forEach((item, idx) => {
    const p = idx * rowLen;
    data[p] = 1;
    dv.setUint32(p + 1, item.offset, false);
    dv.setUint16(p + 5, 0, false);
  });
  const head = enc.encode(
    `${objNum} 0 obj\n<< /Type /XRef /Size ${totalSize} /Root ${rootRef} /Prev ${prevXref} /W [1 4 2] /Index [${indexArr}] /Length ${data.length} >>\nstream\n`,
  );
  const tail = enc.encode(`\nendstream\nendobj\n`);
  const out = new Uint8Array(head.length + data.length + tail.length);
  out.set(head, 0);
  out.set(data, head.length);
  out.set(tail, head.length + data.length);
  return out;
}

// Appends a signature image (and optional label) onto a PDF page via a standard incremental update.
export async function signPdf(input, {
  signature,
  page = 'last',
  xPct = 0.76,
  yPct = 0.85,
  widthPt = 140,
  label = '',
} = {}) {
  if (!signature || !signature.width || !signature.height || !signature.rgba) {
    throw new Error('Draw, type, or upload your signature first.');
  }
  const info = await inspectPdf(input);
  const idx = page === 'last'
    ? info.pageCount - 1
    : Math.max(0, Math.min(info.pageCount - 1, (Number(page) || 1) - 1));
  const target = info.pages[idx];
  const box = target.cropBox || target.mediaBox;
  const [mb0, mb1, mb2, mb3] = box;
  const pageW = Math.max(72, mb2 - mb0);
  const pageH = Math.max(72, mb3 - mb1);

  const cleanLabel = String(label || '').trim().slice(0, 80);
  const drawW = Math.max(36, Math.min(Number(widthPt) || 140, pageW * 0.65));
  const drawH = Math.max(12, drawW * (signature.height / signature.width));
  const cx = mb0 + Math.max(0, Math.min(1, Number(xPct))) * pageW;
  const cy = mb3 - Math.max(0, Math.min(1, Number(yPct))) * pageH;
  const drawX = Math.max(mb0 + 12, Math.min(mb2 - drawW - 12, cx - drawW / 2));
  const minY = mb1 + (cleanLabel ? 22 : 12);
  const drawY = Math.max(minY, Math.min(mb3 - drawH - 12, cy - drawH / 2));

  // Split RGBA into RGB + Alpha SMask for crisp transparent signature rendering.
  const pxCount = signature.width * signature.height;
  const rgbRaw = new Uint8Array(pxCount * 3);
  const alphaRaw = new Uint8Array(pxCount);
  for (let i = 0; i < pxCount; i++) {
    rgbRaw[i * 3] = signature.rgba[i * 4];
    rgbRaw[i * 3 + 1] = signature.rgba[i * 4 + 1];
    rgbRaw[i * 3 + 2] = signature.rgba[i * 4 + 2];
    alphaRaw[i] = signature.rgba[i * 4 + 3];
  }
  const rgbComp = await deflateBytes(rgbRaw);
  const alphaComp = await deflateBytes(alphaRaw);

  let nextId = info.size;
  const smaskId = nextId++;
  const imgId = nextId++;
  const contentId = nextId++;
  const fontId = cleanLabel ? nextId++ : null;

  const chunks = [];
  const orig = info.rawBytes;
  const needNl = orig.length > 0 && orig[orig.length - 1] !== 10 && orig[orig.length - 1] !== 13;
  let cursor = orig.length + (needNl ? 1 : 0);
  if (needNl) chunks.push(enc.encode('\n'));

  const newEntries = [];
  const pushObj = (id, bodyBytes) => {
    newEntries.push({id, offset: cursor});
    chunks.push(bodyBytes);
    cursor += bodyBytes.length;
  };
  const makeStreamObj = (id, dictHeader, dataBytes) => {
    const head = enc.encode(`${id} 0 obj\n${dictHeader}\nstream\n`);
    const tail = enc.encode(`\nendstream\nendobj\n`);
    const out = new Uint8Array(head.length + dataBytes.length + tail.length);
    out.set(head, 0);
    out.set(dataBytes, head.length);
    out.set(tail, head.length + dataBytes.length);
    return out;
  };

  const alphaFilter = alphaComp.compressed ? ' /Filter /FlateDecode' : '';
  pushObj(
    smaskId,
    makeStreamObj(
      smaskId,
      `<< /Type /XObject /Subtype /Image /Width ${signature.width} /Height ${signature.height} /ColorSpace /DeviceGray /BitsPerComponent 8${alphaFilter} /Length ${alphaComp.bytes.length} >>`,
      alphaComp.bytes,
    ),
  );

  const rgbFilter = rgbComp.compressed ? ' /Filter /FlateDecode' : '';
  pushObj(
    imgId,
    makeStreamObj(
      imgId,
      `<< /Type /XObject /Subtype /Image /Width ${signature.width} /Height ${signature.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${smaskId} 0 R${rgbFilter} /Length ${rgbComp.bytes.length} >>`,
      rgbComp.bytes,
    ),
  );

  const drawOps = [
    'q',
    `${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm`,
    '/FliskSig Do',
    'Q',
  ];
  if (cleanLabel) {
    drawOps.push(
      'q',
      'BT',
      '/Fsig 8 Tf',
      '0.22 0.24 0.28 rg',
      `${drawX.toFixed(2)} ${(drawY - 11).toFixed(2)} Td`,
      `${pdfLiteralString(cleanLabel)} Tj`,
      'ET',
      'Q',
    );
  }
  const contentBytes = enc.encode(drawOps.join('\n') + '\n');
  pushObj(contentId, makeStreamObj(contentId, `<< /Length ${contentBytes.length} >>`, contentBytes));

  if (fontId !== null) {
    pushObj(fontId, enc.encode(`${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`));
  }

  // Merge page /Resources and /Contents while preserving all other page keys.
  const resSource = entryOf(target.dict, 'Resources')
    ? {entry: entryOf(target.dict, 'Resources'), sourceBytes: target.sourceBytes}
    : target.inheritedResources;
  const resEntries = await resolveSubDict(resSource?.entry, resSource?.sourceBytes, info.readObjectDict);
  const existingXObj = await resolveSubDict(
    resEntries.find((e) => e.key === 'XObject'),
    resSource?.sourceBytes,
    info.readObjectDict,
  );
  const extraRes = {
    XObject: buildSubDictString(existingXObj, {FliskSig: `${imgId} 0 R`}),
  };
  if (fontId !== null) {
    const existingFont = await resolveSubDict(
      resEntries.find((e) => e.key === 'Font'),
      resSource?.sourceBytes,
      info.readObjectDict,
    );
    extraRes.Font = buildSubDictString(existingFont, {Fsig: `${fontId} 0 R`});
  }
  const newResourcesRaw = buildSubDictString(resEntries, extraRes);

  const contentsE = entryOf(target.dict, 'Contents');
  let newContentsRaw = `[${contentId} 0 R]`;
  if (contentsE) {
    const trimmed = contentsE.raw.trim();
    if (trimmed.startsWith('[')) {
      const items = parseArrayItems(target.sourceBytes, contentsE.valStart, contentsE.valEnd) || [];
      newContentsRaw = `[${[...items, `${contentId} 0 R`].join(' ')}]`;
    } else {
      newContentsRaw = `[${trimmed} ${contentId} 0 R]`;
    }
  }

  const pageMap = new Map();
  for (const e of target.dict.entries) pageMap.set(e.key, e.raw);
  pageMap.set('Resources', newResourcesRaw);
  pageMap.set('Contents', newContentsRaw);
  const pageBody = `${target.objNum} 0 obj\n<< ${[...pageMap.entries()].map(([k, v]) => `/${k} ${v}`).join(' ')} >>\nendobj\n`;
  pushObj(target.objNum, enc.encode(pageBody));

  if (info.isXrefStream) {
    const xrefId = nextId++;
    const totalSize = nextId;
    const xrefOffset = cursor;
    newEntries.push({id: xrefId, offset: xrefOffset});
    chunks.push(buildXrefStreamObj(xrefId, totalSize, info.rootRef, info.startXref, newEntries));
    chunks.push(enc.encode(`startxref\n${xrefOffset}\n%%EOF\n`));
  } else {
    const xrefOffset = cursor;
    const sorted = [...newEntries].sort((a, b) => a.id - b.id);
    const runs = [];
    for (const item of sorted) {
      const last = runs[runs.length - 1];
      if (last && last.start + last.items.length === item.id) last.items.push(item);
      else runs.push({start: item.id, items: [item]});
    }
    const xrefLines = ['xref'];
    for (const r of runs) {
      xrefLines.push(`${r.start} ${r.items.length}`);
      for (const it of r.items) {
        xrefLines.push(String(it.offset).padStart(10, '0') + ' 00000 n ');
      }
    }
    xrefLines.push(`trailer\n<< /Size ${nextId} /Root ${info.rootRef} /Prev ${info.startXref} >>`);
    xrefLines.push(`startxref\n${xrefOffset}\n%%EOF\n`);
    chunks.push(enc.encode(xrefLines.join('\n')));
  }

  const extraLen = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(orig.length + extraLen);
  out.set(orig, 0);
  let p = orig.length;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
