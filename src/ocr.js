// OCR plugin (studio.ocr): parses "read the text" requests and extracts embedded text from PDFs in pure JS.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_OCR = /\b(?:write|build|create|code|script|program|app|application|website|clone|guide|tutorial|library|package|api|how to)\b/;
const TARGET = /(?:this|the|my|that|a)?\s*(?:photo|photograph|picture|pic|image|screenshot|pdf|document|doc|page|file|scan|receipt|note|letter|card|slide)/;

export function parseOcrCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80 || QUESTION.test(t) || NON_OCR.test(t)) return null;
  if (
    new RegExp(`^(?:please\\s+|can you\\s+|could you\\s+|would you\\s+)?(?:read|extract|pull|get|copy|grab|scan|transcribe)\\s+(?:all\\s+)?(?:the\\s+|this\\s+)?text(?:\\s+(?:from|in|of|off|on)\\s+(?:this|it|that|${TARGET.source}))?$`).test(t)
    || new RegExp(`^(?:please\\s+|can you\\s+|could you\\s+)?(?:read|extract|pull|get|copy|grab|scan|transcribe)\\s+(?:the\\s+)?words\\s+(?:from|in|of|on)\\s+(?:this|it|${TARGET.source})$`).test(t)
    || new RegExp(`^(?:please\\s+|can you\\s+|could you\\s+)?(?:run\\s+)?ocr(?:\\s+(?:on|for)\\s+(?:this|it|${TARGET.source})|\\s+(?:this|it|${TARGET.source}))?$`).test(t)
    || new RegExp(`^(?:please\\s+|can you\\s+|could you\\s+)?(?:convert|turn)\\s+(?:this|it|${TARGET.source})\\s+(?:to|into)\\s+text$`).test(t)
    || new RegExp(`^text\\s+from\\s+(?:this|a|the)?\\s*${TARGET.source}$`).test(t)
  ) {
    return {cmd: 'ocr'};
  }
  return null;
}

export const isPdfFile = (f) => f?.type === 'application/pdf' || /\.pdf$/i.test(f?.name || f?.path || '');
export const isPhotoFile = (f) => !!f?.image || /^image\/(png|jpeg|jpg|webp|gif)$/i.test(String(f?.type || '')) || /\.(png|jpe?g|webp|gif)$/i.test(f?.name || f?.path || '');

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof input !== 'string' || !input) return new Uint8Array(0);
  try {
    const bin = atob(input.replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

function decodeLatin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return s;
}

async function inflateFlate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  for (const fmt of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(fmt);
      const w = ds.writable.getWriter();
      w.write(bytes).catch(() => {});
      w.close().catch(() => {});
      const buf = await new Response(ds.readable).arrayBuffer();
      return new Uint8Array(buf);
    } catch { /* try next format */ }
  }
  return null;
}

function unescapePdfLiteral(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '\\') { out += c; continue; }
    const n = raw[++i];
    if (n === undefined) break;
    if (n === 'n') out += '\n';
    else if (n === 'r') out += '\r';
    else if (n === 't') out += '\t';
    else if (n === 'b') out += '\b';
    else if (n === 'f') out += '\f';
    else if (n === '\r') { if (raw[i + 1] === '\n') i++; }
    else if (n === '\n') { /* line continuation */ }
    else if (/[0-7]/.test(n)) {
      let oct = n;
      for (let k = 0; k < 2 && /[0-7]/.test(raw[i + 1] || ''); k++) oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else {
      out += n;
    }
  }
  return out;
}

function decodePdfHex(hex) {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
  if (!clean) return '';
  const even = clean.length % 2 ? clean + '0' : clean;
  if (/^feff/i.test(even) && even.length >= 8) {
    let out = '';
    for (let i = 4; i + 3 < even.length; i += 4) out += String.fromCharCode(parseInt(even.slice(i, i + 4), 16));
    return out;
  }
  let out = '';
  for (let i = 0; i < even.length; i += 2) {
    const code = parseInt(even.slice(i, i + 2), 16);
    if (code >= 32 || code === 9 || code === 10 || code === 13) out += String.fromCharCode(code);
  }
  return out;
}

// Extracts readable text tokens from BT ... ET content stream blocks.
function textFromStream(content) {
  const lines = [];
  const blocks = content.match(/\bBT\b[\s\S]*?\bET\b/g) || [content];
  for (const blk of blocks) {
    if (!/\b(?:Tj|TJ|['"])\b|\)\s*['"]/.test(blk)) continue;
    let cur = '';
    for (let i = 0; i < blk.length; i++) {
      const ch = blk[i];
      if (ch === '(') {
        let depth = 1, raw = '';
        for (i++; i < blk.length && depth > 0; i++) {
          const c = blk[i];
          if (c === '\\') { raw += c + (blk[i + 1] || ''); i++; continue; }
          if (c === '(') depth++;
          else if (c === ')' && --depth === 0) break;
          raw += c;
        }
        cur += unescapePdfLiteral(raw);
      } else if (ch === '<' && blk[i + 1] !== '<') {
        const end = blk.indexOf('>', i + 1);
        if (end > i) {
          cur += decodePdfHex(blk.slice(i + 1, end));
          i = end;
        }
      } else if ((ch === 'T' && (blk[i + 1] === 'd' || blk[i + 1] === 'D' || blk[i + 1] === '*')) || (ch === '\n' && cur)) {
        if (cur.trim()) { lines.push(cur.trim()); cur = ''; }
      }
    }
    if (cur.trim()) lines.push(cur.trim());
  }
  return lines.join('\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractPdfText(input) {
  const bytes = toBytes(input);
  if (!bytes.length) return '';
  const raw = decodeLatin1(bytes);
  if (!raw.startsWith('%PDF-')) return '';
  const parts = [];
  const streamRe = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\n?endstream/g;
  let m;
  while ((m = streamRe.exec(raw)) !== null) {
    const dict = m[1];
    const body = m[2];
    const isFlate = /\/FlateDecode\b/.test(dict);
    let textStream = body;
    if (isFlate) {
      const startOffset = m.index + m[0].indexOf(body);
      const slice = bytes.subarray(startOffset, startOffset + body.length);
      const inflated = await inflateFlate(slice);
      if (!inflated) continue;
      textStream = decodeLatin1(inflated);
    }
    const extracted = textFromStream(textStream);
    if (extracted) parts.push(extracted);
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
