import { describe, expect, test } from 'bun:test';
import { deflateSync } from 'node:zlib';
import { extractPdfText, isPdfFile, isPhotoFile, parseOcrCommand } from '../src/ocr.js';
import { OCR_PROMPT, VISION_MODELS, ocrForFiles } from '../src/see.js';
import { cleanFiles, runTask } from '../src/loop.js';
import { makeSession } from '../src/session.js';
import { handle } from '../src/index.js';
import { parseStudioCommand } from '../web/src/studio-commands.js';
import catalog from '../plugins/catalog.json';

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const noComputer = { start: async () => { throw new Error('must not start computer'); } };

function makePdf(streamBody, { flate = false } = {}) {
  const payload = flate ? deflateSync(Buffer.from(streamBody, 'latin1')) : Buffer.from(streamBody, 'latin1');
  const dict = flate ? `<< /Length ${payload.length} /Filter /FlateDecode >>` : `<< /Length ${payload.length} >>`;
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n', 'latin1'),
    Buffer.from(`${dict}\nstream\n`, 'latin1'),
    payload,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
}

describe('studio.ocr catalog & command parsing', () => {
  test('catalog marks studio.ocr as ready with its voice phrase', () => {
    const p = catalog.plugins.find((x) => x.id === 'studio.ocr');
    expect(p).toBeDefined();
    expect(p.title).toBe('OCR: text from a photo or PDF');
    expect(p.group).toBe('Studio next');
    expect(p.status).toBe('ready');
    expect(p.owner).toBe('flisk');
    expect(p.voice).toContain('read the text');
    for (const v of p.voice) {
      expect(parseOcrCommand(v)).toEqual({ cmd: 'ocr' });
      expect(parseStudioCommand(v)).toEqual({ cmd: 'ocr' });
    }
  });

  test.each([
    'read the text',
    'Read the text.',
    'please read the text',
    'can you read the text?',
    'read the text from this photo',
    'read text from this pdf',
    'read the text in this image',
    'extract the text from this screenshot',
    'extract text',
    'ocr this pdf',
    'run ocr on this photo',
    'scan the text from this receipt',
    'convert this image to text',
    'text from this photo',
  ])('"%s" triggers ocr', (phrase) => {
    expect(parseOcrCommand(phrase)).toEqual({ cmd: 'ocr' });
    expect(parseStudioCommand(phrase)).toEqual({ cmd: 'ocr' });
  });

  test.each([
    'what is ocr',
    'how does ocr work',
    'read it to me',
    'read the result aloud',
    'read aloud',
    'describe this photo',
    'read package.json',
    'build me an ocr website',
    'write a python script to extract text from a pdf',
    'read the text from this ' + 'word '.repeat(20),
    '',
    null,
  ])('%p is left to the chat or other plugins', (phrase) => {
    expect(parseOcrCommand(phrase)).toBeNull();
    expect(parseStudioCommand(phrase)).toBeNull();
  });

  test('Plugins.jsx and App.jsx wire studio.ocr for Studio, typed, spoken, and picker flows', async () => {
    const pluginsSrc = await Bun.file(new URL('../web/src/Plugins.jsx', import.meta.url)).text();
    const appSrc = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
    expect(pluginsSrc).toContain("['ocr', DocumentTextIcon]");
    expect(appSrc).toContain('toOcr(text, filesRef.current)');
    expect(appSrc).toContain('toOcr(task, files)');
    expect(appSrc).toContain(`${catalog.plugins.length} plugins, ${catalog.plugins.filter((p) => p.status === 'ready').length} ready`);
  });
});

describe('PDF text extraction and ocrForFiles', () => {
  test('extractPdfText reads uncompressed literal strings, TJ arrays, and escaped parens', async () => {
    const pdf = makePdf('BT /F1 12 Tf 72 720 Td (Invoice #104 \\(Paid\\)) Tj 0 -14 Td [(Total: ) -10 ($42.00)] TJ ET');
    expect(await extractPdfText(pdf)).toBe('Invoice #104 (Paid)\nTotal: $42.00');
  });

  test('extractPdfText inflates FlateDecode streams and decodes UTF-16BE hex strings', async () => {
    const pdf = makePdf('BT (Flate line one) Tj T* <FEFF00480069> Tj ET', { flate: true });
    expect(await extractPdfText(pdf.toString('base64'))).toBe('Flate line one\nHi');
  });

  test('extractPdfText returns empty for non-PDF or image-only PDFs', async () => {
    expect(await extractPdfText('not a pdf')).toBe('');
    expect(await extractPdfText(makePdf('q 100 0 0 100 0 0 cm /Im0 Do Q'))).toBe('');
  });

  test('ocrForFiles reads photos via Workers AI vision and falls back across vision models', async () => {
    const calls = [];
    const env = {
      AI: {
        run: async (model, input) => {
          calls.push({ model, prompt: input.prompt, len: input.image.length });
          if (model === VISION_MODELS[0]) return { response: '' };
          return { description: 'OPEN 24 HOURS' };
        },
      },
    };
    const pdf = makePdf('BT (Receipt 99) Tj ET');
    const files = cleanFiles([
      { name: 'sign.png', type: 'image/png', content: PNG_1PX, b64: true },
      { name: 'bill.pdf', type: 'application/pdf', content: pdf.toString('base64'), b64: true },
    ]);
    expect(isPhotoFile(files[0])).toBe(true);
    expect(isPdfFile(files[1])).toBe(true);
    const out = await ocrForFiles(env, files);
    expect(calls.length).toBe(2);
    expect(calls[0].prompt).toBe(OCR_PROMPT);
    expect(out).toBe('**sign.png:**\n\nOPEN 24 HOURS\n\n**bill.pdf:**\n\nReceipt 99');
  });
});

describe('runTask and /api/run studio.ocr integration', () => {
  test('runTask handles studio.ocr without calling the text model or starting a computer', async () => {
    const events = [];
    let asked = 0;
    const files = cleanFiles([{ name: 'note.png', type: 'image/png', content: PNG_1PX, b64: true }]);
    const r = await runTask({
      task: 'read the text',
      plugin: 'studio.ocr',
      files,
      ocrText: async () => 'Meet at 5pm',
      model: async () => (asked++, { text: '{"say":"no"}' }),
      computer: noComputer,
      emit: (e) => events.push(e),
    });
    expect(asked).toBe(0);
    expect(r.error).toBeNull();
    expect(r.answer).toBe('Meet at 5pm');
    expect(events.find((e) => e.type === 'answer').text).toBe('Meet at 5pm');
  });

  test('runTask falls back to BYO vision model or returns a calm message when unavailable', async () => {
    const files = cleanFiles([{ name: 'note.png', type: 'image/png', content: PNG_1PX, b64: true }]);
    const seen = [];
    const r1 = await runTask({
      task: 'read the text',
      files,
      vision: true,
      ocrText: async () => '',
      model: async (msgs) => { seen.push(msgs); return { text: '{"say":"Line 1\\nLine 2"}' }; },
      computer: noComputer,
    });
    expect(r1.answer).toBe('Line 1\nLine 2');
    expect(JSON.stringify(seen[0])).toContain('Transcribe all readable text');

    const r2 = await runTask({
      task: 'read the text',
      plugin: 'studio.ocr',
      files,
      vision: false,
      ocrText: async () => '',
      model: async () => { throw new Error('text model must not run'); },
      computer: noComputer,
    });
    expect(r2.error).toBeNull();
    expect(r2.answer).toContain('could not read the text');
  });

  test('POST /api/run reads text from an attached photo via Workers AI when studio.ocr is called', async () => {
    const env = {
      SESSION_SECRET: 's'.repeat(32),
      AI: { run: async () => ({ response: 'HELLO WORLD' }) },
    };
    const cookie = (await makeSession(env, 'ada')).split(';')[0];
    const req = new Request('https://chat.flisk.si/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://chat.flisk.si', cookie },
      body: JSON.stringify({
        task: 'read the text',
        plugin: 'studio.ocr',
        files: [{ name: 'sign.png', type: 'image/png', content: PNG_1PX, b64: true }],
        ai: { ai: 'wolf' },
      }),
    });
    const res = await handle(req, env, {
      fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('HELLO WORLD');
  });
});

describe('POST /api/run reads a PDF the way the page sends it', () => {
  test('base64 PDF text comes back without a vision model or a computer', async () => {
    const env = { SESSION_SECRET: 's'.repeat(32) };
    const cookie = (await makeSession(env, 'ada')).split(';')[0];
    const pdf = '%PDF-1.4\n1 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 700 Td (Hello from a PDF) Tj ET\nendstream\nendobj\n%%EOF';
    const req = new Request('https://chat.flisk.si/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://chat.flisk.si', cookie },
      body: JSON.stringify({ task: 'read the text', plugin: 'studio.ocr', files: [{ name: 'my scan.pdf', type: 'application/pdf', content: btoa(pdf), b64: true }], ai: { ai: 'wolf' } }),
    });
    const res = await handle(req, env, { fetchImpl: async () => new Response('{}', { status: 200 }) });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Hello from a PDF');
  });
});

describe('studio.ocr runs in chat, not in the Studio editor (Studio has no OCR)', () => {
  test('the picker and the Studio command path both keep OCR in chat', async () => {
    const plugins = await Bun.file(new URL('../web/src/Plugins.jsx', import.meta.url)).text();
    const app = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
    expect(plugins).toContain("p.id !== 'studio.ocr'");
    expect(plugins).toContain('onOcr(p)');
    expect(app).toContain("c.cmd === 'ocr') return false;");
    expect(app).toContain('onOcr={');
  });
});
