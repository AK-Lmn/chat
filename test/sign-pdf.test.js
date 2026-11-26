import { describe, expect, test } from 'bun:test';
import { deflateSync } from 'node:zlib';
import {
  inspectPdf,
  parseSignPdfCommand,
  readPdfBytes,
  signPdf,
  trimSignatureRgba,
} from '../web/src/sign-pdf.js';
import { parseStudioCommand } from '../web/src/studio-commands.js';
import catalog from '../plugins/catalog.json';

const enc = new TextEncoder();
const dec = new TextDecoder('latin1');

function buildClassicPdf({ pages = 1, indirectResources = false, encrypted = false } = {}) {
  const objs = [];
  // 1: Catalog, 2: Pages
  const pageIds = [];
  let nextId = 3;
  const resId = indirectResources ? nextId++ : null;
  if (indirectResources) {
    objs.push({ id: resId, body: '<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>' });
  }
  for (let i = 0; i < pages; i++) {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);
    const stream = `BT /F1 12 Tf 72 720 Td (Page ${i + 1}) Tj ET`;
    objs.push({ id: contentId, body: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream` });
    const resField = indirectResources ? `/Resources ${resId} 0 R` : '/Resources << >>';
    objs.push({ id: pageId, body: `<< /Type /Page /Parent 2 0 R ${resField} /Contents ${contentId} 0 R >>` });
  }
  objs.unshift({ id: 2, body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} /MediaBox [0 0 612 792] >>` });
  objs.unshift({ id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });
  objs.sort((a, b) => a.id - b.id);

  let out = '%PDF-1.4\n';
  const offsets = new Map();
  for (const o of objs) {
    offsets.set(o.id, out.length);
    out += `${o.id} 0 obj\n${o.body}\nendobj\n`;
  }
  const xrefPos = out.length;
  const size = nextId;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++) {
    out += String(offsets.get(id)).padStart(10, '0') + ' 00000 n \n';
  }
  const encEntry = encrypted ? ' /Encrypt 99 0 R' : '';
  out += `trailer\n<< /Size ${size} /Root 1 0 R${encEntry} >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return enc.encode(out);
}

// Builds a PDF 1.5+ with /Type /ObjStm and /Type /XRef (FlateDecode + PNG Up predictor).
function buildXrefStreamPdf() {
  const inner = [
    { id: 1, text: '<< /Type /Catalog /Pages 2 0 R >>' },
    { id: 2, text: '<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 595 842] >>' },
    { id: 3, text: '<< /Type /Page /Parent 2 0 R /Resources << >> >>' },
  ];
  let header = '';
  let body = '';
  for (const item of inner) {
    header += `${item.id} ${body.length} `;
    body += item.text + '\n';
  }
  const stmRaw = enc.encode(header + '\n' + body);
  const first = header.length + 1;
  const stmComp = deflateSync(stmRaw);

  const obj4 = `4 0 obj\n<< /Type /ObjStm /N 3 /First ${first} /Filter /FlateDecode /Length ${stmComp.length} >>\nstream\n`;
  const obj4Tail = '\nendstream\nendobj\n';

  let prefix = '%PDF-1.5\n';
  const obj4Offset = prefix.length;
  const chunks = [enc.encode(prefix), enc.encode(obj4), stmComp, enc.encode(obj4Tail)];
  const xrefOffset = chunks.reduce((n, c) => n + c.length, 0);

  // Entries for objects 0..5 with W = [1 4 2] + PNG Up predictor (filter byte 2)
  const rows = [
    [0, 0, 65535],
    [2, 4, 0],
    [2, 4, 1],
    [2, 4, 2],
    [1, obj4Offset, 0],
    [1, xrefOffset, 0],
  ];
  const rawRows = new Uint8Array(rows.length * 7);
  const dv = new DataView(rawRows.buffer);
  rows.forEach(([t, f2, f3], idx) => {
    const p = idx * 7;
    rawRows[p] = t;
    dv.setUint32(p + 1, f2, false);
    dv.setUint16(p + 5, f3, false);
  });
  const filtered = new Uint8Array(rows.length * 8);
  for (let r = 0; r < rows.length; r++) {
    filtered[r * 8] = 2; // PNG Up predictor
    for (let c = 0; c < 7; c++) {
      const prev = r > 0 ? rawRows[(r - 1) * 7 + c] : 0;
      filtered[r * 8 + 1 + c] = (rawRows[r * 7 + c] - prev) & 0xff;
    }
  }
  const xrefComp = deflateSync(filtered);
  const xrefHead = `5 0 obj\n<< /Type /XRef /Size 6 /Root 1 0 R /W [1 4 2] /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> /Length ${xrefComp.length} >>\nstream\n`;
  const xrefTail = `\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(enc.encode(xrefHead), xrefComp, enc.encode(xrefTail));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

function makeSignature(w = 12, h = 6) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = (y * w + x) * 4;
      rgba[i] = 17;
      rgba[i + 1] = 24;
      rgba[i + 2] = 39;
      rgba[i + 3] = 255;
    }
  }
  return { width: w, height: h, rgba };
}

describe('studio.sign-pdf catalog & wiring', () => {
  test('catalog marks studio.sign-pdf as ready with its voice phrase', () => {
    const p = catalog.plugins.find((x) => x.id === 'studio.sign-pdf');
    expect(p).toBeDefined();
    expect(p.title).toBe('Sign a PDF');
    expect(p.group).toBe('Studio next');
    expect(p.status).toBe('ready');
    expect(p.owner).toBe('flisk');
    for (const v of p.voice) {
      expect(parseSignPdfCommand(v)).toEqual({ cmd: 'signPdf' });
      expect(parseStudioCommand(v)).toEqual({ cmd: 'signPdf' });
    }
  });

  test('Plugins.jsx and App.jsx wire studio.sign-pdf for typed, spoken, and picker flows', async () => {
    const pluginsSrc = await Bun.file(new URL('../web/src/Plugins.jsx', import.meta.url)).text();
    const appSrc = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
    expect(pluginsSrc).toContain("p.id === 'studio.sign-pdf'");
    expect(pluginsSrc).toContain('onSignPdf');
    expect(appSrc).toContain('<SignPdfDialog');
    expect(appSrc).toContain('toSignPdf(text, filesRef.current)');
    expect(appSrc).toContain('toSignPdf(task, files)');
  });
});

describe('sign-pdf voice and typed commands', () => {
  test.each([
    'sign this',
    'Sign this.',
    'please sign this',
    'can you sign this?',
    'could you sign this pdf',
    'sign this pdf',
    'sign the pdf',
    'sign my document',
    'add my signature',
    'add a signature to this pdf',
    'put my signature on this',
    'sign a pdf',
  ])('"%s" triggers signPdf', (phrase) => {
    expect(parseSignPdfCommand(phrase)).toEqual({ cmd: 'signPdf' });
  });

  test.each([
    'what is a signed pdf',
    'how do I sign a pdf',
    'sign in with github',
    'sign up for an account',
    'write a contract to sign',
    'zodiac sign compatibility',
    'stop sign detection app',
    'sign this ' + 'extra '.repeat(20),
    '',
    null,
  ])('%p is left to the chat', (phrase) => {
    expect(parseSignPdfCommand(phrase)).toBeNull();
  });
});

describe('signature trimming & input decoding', () => {
  test('trimSignatureRgba crops transparent margins and returns null when blank', () => {
    const sig = makeSignature(12, 6);
    const trimmed = trimSignatureRgba(sig.rgba, sig.width, sig.height, 1);
    expect(trimmed.width).toBe(10);
    expect(trimmed.height).toBe(6);
    expect(trimSignatureRgba(new Uint8Array(12 * 6 * 4), 12, 6)).toBeNull();
  });

  test('readPdfBytes accepts base64 chat attachment objects', async () => {
    const raw = enc.encode('%PDF-1.4\n');
    const b64 = Buffer.from(raw).toString('base64');
    expect(await readPdfBytes({ name: 'a.pdf', b64: true, content: b64 })).toEqual(raw);
  });
});

describe('PDF inspection and signing', () => {
  test('inspects and signs a multi-page classic PDF with indirect resources and inherited MediaBox', async () => {
    const pdf = buildClassicPdf({ pages: 3, indirectResources: true });
    const info = await inspectPdf(pdf);
    expect(info.pageCount).toBe(3);
    expect(info.pages[1].mediaBox).toEqual([0, 0, 612, 792]);

    const sig = trimSignatureRgba(makeSignature(16, 8).rgba, 16, 8, 0);
    const signed = await signPdf(pdf, {
      signature: sig,
      page: 2,
      xPct: 0.75,
      yPct: 0.85,
      label: 'Signed by Ada',
    });

    const signedText = dec.decode(signed);
    expect(signedText).toContain('/FliskSig Do');
    expect(signedText).toContain('(Signed by Ada) Tj');
    expect(signedText).toContain('/SMask ');
    expect(signedText).toContain(`/Prev ${info.startXref}`);

    const re = await inspectPdf(signed);
    expect(re.pageCount).toBe(3);
    expect(re.size).toBeGreaterThan(info.size);
  });

  test('inspects and signs a PDF 1.5+ cross-reference stream and object stream PDF', async () => {
    const pdf = buildXrefStreamPdf();
    const info = await inspectPdf(pdf);
    expect(info.isXrefStream).toBe(true);
    expect(info.pageCount).toBe(1);
    expect(info.pages[0].mediaBox).toEqual([0, 0, 595, 842]);

    const sig = trimSignatureRgba(makeSignature(16, 8).rgba, 16, 8, 0);
    const signed = await signPdf(pdf, { signature: sig, page: 'last' });
    const signedText = dec.decode(signed);
    expect(signedText).toContain('/Type /XRef');
    expect(signedText).toContain('/FliskSig Do');

    const re = await inspectPdf(signed);
    expect(re.pageCount).toBe(1);
    expect(re.size).toBeGreaterThan(info.size);
  });

  test('rejects invalid, encrypted, or unsigned inputs cleanly', async () => {
    await expect(inspectPdf(enc.encode('not a pdf'))).rejects.toThrow('Not a valid PDF file.');
    await expect(inspectPdf(buildClassicPdf({ encrypted: true }))).rejects.toThrow('Encrypted');
    await expect(signPdf(buildClassicPdf(), {})).rejects.toThrow('signature');
  });
});
