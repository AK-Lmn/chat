import { describe, expect, test } from 'bun:test';
import {
  buildZip,
  clampQuality,
  convertToJpeg,
  formatBytes,
  isConvertibleFile,
  isHeicBytes,
  isHeicFile,
  jpegName,
  parseHeicCommand,
} from '../web/src/heic.js';
import { parseStudioCommand } from '../web/src/studio-commands.js';
import catalog from '../plugins/catalog.json';

describe('studio.heic catalog & wiring', () => {
  test('catalog marks studio.heic as ready with its voice phrase', () => {
    const p = catalog.plugins.find((x) => x.id === 'studio.heic');
    expect(p).toBeDefined();
    expect(p.title).toBe('Convert HEIC to JPEG');
    expect(p.group).toBe('Studio next');
    expect(p.status).toBe('ready');
    expect(p.owner).toBe('flisk');
    expect(p.voice).toContain('convert to jpeg');
    for (const v of p.voice) {
      expect(parseHeicCommand(v)).toEqual({ cmd: 'convertToJpeg' });
      expect(parseStudioCommand(v)).toEqual({ cmd: 'convertToJpeg' });
    }
  });

  test('the picker, typed, spoken and dialog paths all reach HeicDialog', async () => {
    const read = (name) => Bun.file(new URL('../web/src/' + name, import.meta.url)).text();
    const [plugins, app] = await Promise.all([read('Plugins.jsx'), read('App.jsx')]);
    const wanted = new Map([
      [plugins, ["p.id === 'studio.heic'", 'onHeic']],
      [app, ['<HeicDialog', 'toHeic(text, filesRef.current)', 'toHeic(task, files)']],
    ]);
    for (const [source, needles] of wanted) for (const needle of needles) expect(source.includes(needle)).toBe(true);
  });
});

describe('HEIC to JPEG voice and typed commands', () => {
  test.each([
    'convert to jpeg',
    'Convert to JPEG.',
    'please convert to jpg',
    'can you convert this to jpeg',
    'convert this photo to jpg',
    'convert heic to jpeg',
    'convert this heif to jpeg',
    'heic to jpeg',
    'heif to jpg',
    'turn this into a jpeg',
    'save as jpeg',
    'export as jpg',
    'make this a jpeg',
  ])('"%s" triggers convertToJpeg', (phrase) => {
    expect(parseHeicCommand(phrase)).toEqual({ cmd: 'convertToJpeg' });
    expect(parseStudioCommand(phrase)).toEqual({ cmd: 'convertToJpeg' });
  });

  test.each([
    'what is a heic file',
    'how do i convert heic to jpeg',
    'explain heic vs jpeg',
    'build me a heic to jpeg converter website',
    'write a python script to convert heic to jpeg',
    'convert to jpeg ' + 'word '.repeat(20),
    '',
    null,
  ])('%p is left to the chat', (phrase) => {
    expect(parseHeicCommand(phrase)).toBeNull();
  });
});

describe('HEIC file detection, naming, quality, and container parsing', () => {
  test('isHeicFile and isConvertibleFile handle MIME types and uppercase extensions', () => {
    expect(isHeicFile({ name: 'IMG_1024.HEIC', type: '' })).toBe(true);
    expect(isHeicFile({ name: 'photo.heif', type: 'image/heif' })).toBe(true);
    expect(isHeicFile({ name: 'clip.hif', type: '' })).toBe(true);
    expect(isHeicFile({ name: 'cat.png', type: 'image/png' })).toBe(false);
    expect(isConvertibleFile({ name: 'IMG_1024.HEIC', type: '' })).toBe(true);
    expect(isConvertibleFile({ name: 'cat.webp', type: 'image/webp' })).toBe(true);
    expect(isConvertibleFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false);
  });

  test('isHeicBytes detects ISOBMFF ftyp HEIC/HEIF brands', () => {
    const makeFtyp = (major, compat = []) => {
      const len = 16 + compat.length * 4;
      const buf = new Uint8Array(len);
      new DataView(buf.buffer).setUint32(0, len, false);
      const write4 = (off, s) => { for (let i = 0; i < 4; i++) buf[off + i] = s.charCodeAt(i); };
      write4(4, 'ftyp');
      write4(8, major);
      compat.forEach((b, i) => write4(16 + i * 4, b));
      return buf;
    };
    expect(isHeicBytes(makeFtyp('heic'))).toBe(true);
    expect(isHeicBytes(makeFtyp('heix'))).toBe(true);
    expect(isHeicBytes(makeFtyp('mif1', ['heic']))).toBe(true);
    expect(isHeicBytes(makeFtyp('isom', ['iso2', 'mp41']))).toBe(false);
    expect(isHeicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });

  test('jpegName, clampQuality, and formatBytes format cleanly', () => {
    expect(jpegName('IMG_1234.HEIC')).toBe('IMG_1234.jpg');
    expect(jpegName('shot.heif')).toBe('shot.jpg');
    expect(jpegName('photo.png')).toBe('photo.jpg');
    expect(jpegName('unnamed')).toBe('unnamed.jpg');
    expect(clampQuality('bad')).toBe(0.92);
    expect(clampQuality(2)).toBe(1);
    expect(clampQuality(0)).toBe(0.1);
    expect(clampQuality(0.85)).toBe(0.85);
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(4096)).toBe('4 KB');
    expect(formatBytes(2 * 1048576)).toBe('2.0 MB');
  });
});

describe('convertToJpeg pipeline & ZIP packaging', () => {
  test('convertToJpeg decodes source, encodes JPEG with clamped quality, and disposes resources', async () => {
    let closed = false;
    let revoked = '';
    let encodedQuality = null;
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const out = await convertToJpeg(
      { name: 'Vacation.HEIC', type: '', content: btoa('fake-heic'), b64: true },
      {
        quality: 0.9,
        decode: async (blob) => {
          expect(blob.type).toBe('image/heic');
          return { width: 1600, height: 1200, draw: () => {}, close: () => { closed = true; } };
        },
        encode: async (decoded, q) => {
          encodedQuality = q;
          return { blob: new Blob([jpegBytes], { type: 'image/jpeg' }), bytes: jpegBytes, width: decoded.width, height: decoded.height };
        },
        makeUrl: () => 'blob:test-jpeg-1',
        revokeUrl: (u) => { revoked = u; },
      },
    );
    expect(closed).toBe(true);
    expect(encodedQuality).toBe(0.9);
    expect(out.name).toBe('Vacation.jpg');
    expect(out.originalName).toBe('Vacation.HEIC');
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
    expect(out.bytes).toEqual(jpegBytes);
    expect(out.url).toBe('blob:test-jpeg-1');
    out.dispose();
    expect(revoked).toBe('blob:test-jpeg-1');
  });

  test('convertToJpeg still closes decoded frame if encoding fails', async () => {
    let closed = false;
    await expect(convertToJpeg(new Blob(['x'], { type: 'image/heic' }), {
      decode: async () => ({ width: 10, height: 10, draw: () => {}, close: () => { closed = true; } }),
      encode: async () => { throw new Error('encode boom'); },
    })).rejects.toThrow('encode boom');
    expect(closed).toBe(true);
  });

  test('buildZip packs multiple converted JPEGs into a valid STORE ZIP', () => {
    const zip = buildZip([
      { name: 'a.jpg', data: new Uint8Array([0xff, 0xd8, 0xff]) },
      { name: 'b.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
    ]);
    const dv = new DataView(zip.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const eocd = zip.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    expect(dv.getUint16(eocd + 8, true)).toBe(2);
    expect(dv.getUint16(eocd + 10, true)).toBe(2);
  });
});
