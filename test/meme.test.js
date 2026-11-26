import { describe, expect, test } from 'bun:test';
import { parseStudioCommand } from '../web/src/studio-commands.js';
import { sendToStudio, STUDIO_URL } from '../web/src/Studio.jsx';
import { opensStudio } from '../web/src/Plugins.jsx';
import catalog from '../plugins/catalog.json';

describe('Meme and caption maker plugin (studio.meme)', () => {
  test('catalog lists studio.meme as ready with expected metadata and voice phrase', () => {
    const p = catalog.plugins.find((x) => x.id === 'studio.meme');
    expect(p).toBeDefined();
    expect(p.title).toBe('Meme and caption maker');
    expect(p.group).toBe('Studio next');
    expect(p.status).toBe('ready');
    expect(p.owner).toBe('flisk');
    expect(p.voice).toContain('make a meme');
    expect(opensStudio(p)).toBe(true);
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

  test('sendToStudio posts the meme command to the Studio origin', () => {
    const sent = [];
    const frame = {
      contentWindow: {
        postMessage(msg, origin) {
          sent.push({ msg, origin });
        },
      },
    };
    const cmd = parseStudioCommand('make a meme');
    expect(sendToStudio(frame, cmd)).toBe(true);
    expect(sent).toEqual([
      {
        msg: { flisk: 'studio', cmd: 'meme', top: null, bottom: null },
        origin: new URL(STUDIO_URL).origin,
      },
    ]);
    expect(sendToStudio(null, cmd)).toBe(false);
  });
});
