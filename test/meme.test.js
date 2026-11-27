import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { parseStudioCommand } from '../web/src/studio-commands.js';
import catalog from '../plugins/catalog.json';

// The JSX files are read as text: CI installs only the root dependencies, so importing them (React, Astryx) cannot resolve there.
const studioSrc = readFileSync(new URL('../web/src/Studio.jsx', import.meta.url), 'utf8');
const pluginsSrc = readFileSync(new URL('../web/src/Plugins.jsx', import.meta.url), 'utf8');

describe('Meme and caption maker plugin (studio.meme)', () => {
  test('catalog lists studio.meme as ready with expected metadata and voice phrase', () => {
    const p = catalog.plugins.find((x) => x.id === 'studio.meme');
    expect(p).toBeDefined();
    expect(p.title).toBe('Meme and caption maker');
    expect(p.group).toBe('Studio next');
    expect(p.status).toBe('ready');
    expect(p.owner).toBe('flisk');
    expect(p.voice).toContain('make a meme');
    expect(pluginsSrc).toContain("export const opensStudio = (p) => p.status === 'ready' && p.id.startsWith('studio.') && p.id !== 'studio.icons';");
    for (const v of p.voice) expect(parseStudioCommand(v)).toEqual({ cmd: 'meme', top: null, bottom: null });
  });

  test.each([
    'make a meme',
    'Make a meme.',
    'please make a meme',
    'make me a meme',
    'make this a meme',
    'turn this into a meme',
    'create a meme',
    'meme this',
    'add a meme caption',
    'add a caption',
    'caption this',
    'caption this photo',
  ])('"%s" triggers meme command', (t) => {
    expect(parseStudioCommand(t)).toEqual({ cmd: 'meme', top: null, bottom: null });
  });

  test('parses optional top and bottom captions while preserving case', () => {
    expect(parseStudioCommand('make a meme saying Monday mood')).toEqual({
      cmd: 'meme',
      top: 'Monday mood',
      bottom: null,
    });
    expect(parseStudioCommand('make a meme with top text When tests pass and bottom text Ship it')).toEqual({
      cmd: 'meme',
      top: 'When tests pass',
      bottom: 'Ship it',
    });
    expect(parseStudioCommand('make a meme with bottom text Bottom line')).toEqual({
      cmd: 'meme',
      top: null,
      bottom: 'Bottom line',
    });
    expect(parseStudioCommand('caption this: Coffee first')).toEqual({
      cmd: 'meme',
      top: 'Coffee first',
      bottom: null,
    });
  });

  test.each([
    'what is a meme',
    'how do I make a meme',
    'explain this meme',
    'build me a meme generator website',
    'make a meme app',
    'add captions to my video',
    'make a meme about something in a very long sentence that goes on and on and on and on and on',
    '',
    null,
  ])('%p is left to the chat', (t) => {
    expect(parseStudioCommand(t)).toBeNull();
  });

  test('sendToStudio posts every Studio command, meme included, to the Studio origin', () => {
    expect(studioSrc).toContain("export const sendToStudio = (frame, msg) => { if (!frame) return false; frame.contentWindow.postMessage({flisk: 'studio', ...msg}, STUDIO_ORIGIN); return true; };");
    expect(studioSrc).toContain("const STUDIO_ORIGIN = 'https://studio.flisk.si';");
    expect(parseStudioCommand('make a meme')).toEqual({ cmd: 'meme', top: null, bottom: null });
  });
});
