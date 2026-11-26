import { describe, expect, test } from 'bun:test';
import {
  ICON_HTML,
  ICON_SIZES,
  buildIco,
  buildManifest,
  buildZip,
  crc32,
  parseIconCommand,
} from '../web/src/favicons.js';
import { parseStudioCommand } from '../web/src/studio-commands.js';
import catalog from '../plugins/catalog.json';

describe('studio.icons catalog & wiring', () => {
  test('catalog marks studio.icons as ready with its voice phrase', () => {
    const p = catalog.plugins.find((x) => x.id === 'studio.icons');
    expect(p).toBeDefined();
    expect(p.title).toBe('Favicon and app icon set');
    expect(p.group).toBe('Studio next');
    expect(p.status).toBe('ready');
    for (const v of p.voice) {
      expect(parseIconCommand(v)).toEqual({ cmd: 'makeIcons' });
      expect(parseStudioCommand(v)).toEqual({ cmd: 'makeIcons' });
    }
  });

  test('the picker, typed, spoken and dialog paths all reach FaviconsDialog', async () => {
    const read = (name) => Bun.file(new URL('../web/src/' + name, import.meta.url)).text();
    const [plugins, app] = await Promise.all([read('Plugins.jsx'), read('App.jsx')]);
    const wanted = new Map([
      [plugins, ["p.id === 'studio.icons'", 'onIcons']],
      [app, ['<FaviconsDialog', 'toIcons(text, filesRef.current)', 'toIcons(task, files)']],
    ]);
    for (const [source, needles] of wanted) for (const needle of needles) expect(source.includes(needle)).toBe(true);
  });
});

describe('icon set voice and typed commands', () => {
  test.each([
    'make icons from this',
    'Make icons from this.',
    'please make icons from this',
    'can you make a favicon from this',
    'create app icons from this photo',
    'generate a favicon and app icon set',
    'build an icon set from this logo',
    'turn this into app icons',
    'favicon and app icon set',
  ])('"%s" triggers makeIcons', (phrase) => {
    expect(parseIconCommand(phrase)).toEqual({ cmd: 'makeIcons' });
  });

  test.each([
    'what is a favicon',
    'how do app icons work',
    'build me a website with icons',
    'add icons to my navbar',
    'draw a cat',
    'make icons from this ' + 'word '.repeat(20),
    '',
    null,
  ])('%p is left to the chat', (phrase) => {
    expect(parseIconCommand(phrase)).toBeNull();
  });
});

describe('icon set builders (ICO, manifest, HTML, ZIP)', () => {
  test('ICON_SIZES covers classic favicon, Apple touch icon, and PWA sizes', () => {
    expect(ICON_SIZES.map((s) => s.size)).toEqual([16, 32, 48, 180, 192, 512]);
    expect(ICON_SIZES.filter((s) => s.ico).map((s) => s.size)).toEqual([16, 32, 48]);
  });

  test('buildIco packs multi-size PNG entries into a valid ICO container', () => {
    const p16 = new Uint8Array([137, 80, 78, 71, 1, 2]);
    const p32 = new Uint8Array([137, 80, 78, 71, 3, 4, 5]);
    const ico = buildIco([
      { size: 16, png: p16 },
      { size: 32, png: p32 },
    ]);
    const dv = new DataView(ico.buffer);
    expect(dv.getUint16(0, true)).toBe(0);
    expect(dv.getUint16(2, true)).toBe(1);
    expect(dv.getUint16(4, true)).toBe(2);
    // First entry: 16x16 at offset 6 + 32 = 38
    expect(ico[6]).toBe(16);
    expect(ico[7]).toBe(16);
    expect(dv.getUint16(6 + 4, true)).toBe(1);
    expect(dv.getUint16(6 + 6, true)).toBe(32);
    expect(dv.getUint32(6 + 8, true)).toBe(p16.length);
    expect(dv.getUint32(6 + 12, true)).toBe(38);
    expect(ico.slice(38, 38 + p16.length)).toEqual(p16);
    // Second entry: 32x32 at offset 38 + p16.length
    expect(ico[22]).toBe(32);
    expect(ico[23]).toBe(32);
    expect(dv.getUint32(22 + 8, true)).toBe(p32.length);
    expect(dv.getUint32(22 + 12, true)).toBe(38 + p16.length);
    expect(ico.slice(38 + p16.length)).toEqual(p32);
    expect(() => buildIco([])).toThrow();
  });

  test('buildManifest and ICON_HTML match the generated filenames', () => {
    const manifest = JSON.parse(buildManifest('Flisk'));
    expect(manifest.name).toBe('Flisk');
    expect(manifest.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ]);
    expect(ICON_HTML).toContain('/favicon.ico');
    expect(ICON_HTML).toContain('/favicon-32x32.png');
    expect(ICON_HTML).toContain('/favicon-16x16.png');
    expect(ICON_HTML).toContain('/apple-touch-icon.png');
    expect(ICON_HTML).toContain('/site.webmanifest');
  });

  test('crc32 and buildZip produce a valid STORE ZIP archive', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const zip = buildZip([
      { name: 'hello.txt', data: 'world' },
      { name: 'bin.dat', data: new Uint8Array([1, 2, 3, 4]) },
    ]);
    const dv = new DataView(zip.buffer);
    // Local file header signature
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    // End of central directory at tail (22 bytes)
    const eocd = zip.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    expect(dv.getUint16(eocd + 8, true)).toBe(2);
    expect(dv.getUint16(eocd + 10, true)).toBe(2);
    const cdOffset = dv.getUint32(eocd + 16, true);
    expect(dv.getUint32(cdOffset, true)).toBe(0x02014b50);
  });
});
