import { describe, expect, test } from 'bun:test';
import { parseChatCommand } from '../web/src/chat-commands.js';
import { altTextForFiles, ALT_TEXT_PROMPT, VISION_MODELS } from '../src/see.js';
import { asksAltText, cleanFiles, runTask } from '../src/loop.js';
import { handle } from '../src/index.js';
import { makeSession } from '../src/session.js';
import catalog from '../plugins/catalog.json';

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const noComputer = { start: async () => { throw new Error('alt-text needs no computer'); } };

describe('chat.alt-text voice and typed commands', () => {
  test.each([
    'describe this photo',
    'Describe this photo.',
    'please describe the photo',
    'describe my picture',
    'describe this image',
    'write alt text for this photo',
    'generate alt text',
    'alt text',
    'describe a photo for alt text',
  ])('"%s" calls altText', (t) => {
    expect(parseChatCommand(t)).toEqual({ cmd: 'altText' });
    expect(asksAltText(t)).toBe(true);
  });

  test.each([
    'what is alt text?',
    'explain alt text',
    'what is the weather',
    'build me a shop',
    'describe how to take a photo',
    'describe this photo in a very long essay that goes on and on and on and on and on and on',
    '',
    null,
  ])('%p is left to the chat', (t) => {
    expect(parseChatCommand(t)).toBeNull();
    expect(asksAltText(t)).toBe(false);
  });

  test('the catalog lists chat.alt-text as ready, with phrases the parser understands', () => {
    const p = catalog.plugins.find((x) => x.id === 'chat.alt-text');
    expect(p).toBeTruthy();
    expect(p.status).toBe('ready');
    expect(p.group).toBe('Voice and chat');
    expect(p.owner).toBe('flisk');
    for (const v of p.voice) expect(parseChatCommand(v)?.cmd).toBe('altText');
  });

  test('App.jsx wires parseChatCommand for both spoken (dictate) and typed (submit) requests', async () => {
    const app = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
    expect(app).toContain("from './chat-commands.js'");
    expect(app).toContain('toChatPlugin(text, filesRef.current');
    expect(app).toContain('if (toChatPlugin(task, files)) return;');
    expect(app).toContain("plugin: 'chat.alt-text'");
  });
});

describe('altTextForFiles and runTask alt-text execution', () => {
  test('altTextForFiles decodes attached images and calls Workers AI vision', async () => {
    const seen = [];
    const env = {
      AI: {
        run: async (model, input) => {
          seen.push({ model, len: input.image.length, prompt: input.prompt });
          return { response: 'A golden retriever sitting on green grass in sunlight.' };
        },
      },
    };
    const files = cleanFiles([{ name: 'dog.png', type: 'image/png', content: PNG_1PX, b64: true }]);
    const out = await altTextForFiles(env, files);
    expect(out).toBe('A golden retriever sitting on green grass in sunlight.');
    expect(seen[0].model).toBe(VISION_MODELS[0]);
    expect(seen[0].prompt).toBe(ALT_TEXT_PROMPT);
    expect(seen[0].len).toBeGreaterThan(20);
  });

  test('altTextForFiles falls back to the second vision model and formats multiple photos', async () => {
    let calls = 0;
    const env = {
      AI: {
        run: async (model) => {
          calls++;
          if (model === VISION_MODELS[0]) return { response: '' };
          return { description: 'A red mug on a wooden desk.' };
        },
      },
    };
    const files = cleanFiles([
      { name: 'a.png', type: 'image/png', content: PNG_1PX, b64: true },
      { name: 'b.png', type: 'image/png', content: PNG_1PX, b64: true },
    ]);
    const out = await altTextForFiles(env, files);
    expect(calls).toBe(4);
    expect(out).toBe('**a.png:** A red mug on a wooden desk.\n\n**b.png:** A red mug on a wooden desk.');
    expect(await altTextForFiles({}, files)).toBe('');
    expect(await altTextForFiles(env, [])).toBe('');
  });

  test('runTask handles chat.alt-text without calling the text model or starting a computer', async () => {
    const events = [];
    let asked = 0;
    const files = cleanFiles([{ name: 'cat.png', type: 'image/png', content: PNG_1PX, b64: true }]);
    const r = await runTask({
      task: 'describe this photo',
      plugin: 'chat.alt-text',
      files,
      altText: async () => 'A tabby cat curled up on a blue armchair.',
      model: async () => (asked++, { text: '{"say":"no"}' }),
      computer: noComputer,
      emit: (e) => events.push(e),
    });
    expect(asked).toBe(0);
    expect(r.error).toBeNull();
    expect(r.answer).toBe('A tabby cat curled up on a blue armchair.');
    expect(events.find((e) => e.type === 'answer').text).toBe('A tabby cat curled up on a blue armchair.');
  });

  test('runTask falls back to a vision-capable BYO model when altText returns empty', async () => {
    const seen = [];
    const files = cleanFiles([{ name: 'cat.png', type: 'image/png', content: PNG_1PX, b64: true }]);
    const r = await runTask({
      task: 'describe this photo',
      plugin: 'chat.alt-text',
      files,
      vision: true,
      altText: async () => '',
      model: async (msgs) => { seen.push(msgs); return { text: '{"say":"A black cat looking out a rain-streaked window."}' }; },
      computer: noComputer,
    });
    expect(r.answer).toBe('A black cat looking out a rain-streaked window.');
    expect(JSON.stringify(seen[0])).toContain('data:image/png;base64,');
  });

  test('runTask returns a calm message when neither Workers AI nor a vision model is available', async () => {
    const files = cleanFiles([{ name: 'cat.png', type: 'image/png', content: PNG_1PX, b64: true }]);
    const r = await runTask({
      task: 'describe this photo',
      plugin: 'chat.alt-text',
      files,
      vision: false,
      altText: async () => '',
      model: async () => { throw new Error('text model must not run'); },
      computer: noComputer,
    });
    expect(r.error).toBeNull();
    expect(r.answer).toContain('could not read that photo');
  });

  test('POST /api/run describes an attached photo via Workers AI when chat.alt-text is called', async () => {
    const env = {
      SESSION_SECRET: 's'.repeat(32),
      AI: { run: async () => ({ response: 'A white lighthouse overlooking calm blue water.' }) },
    };
    const cookie = (await makeSession(env, 'ada')).split(';')[0];
    const req = new Request('https://chat.flisk.si/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://chat.flisk.si', cookie },
      body: JSON.stringify({
        task: 'describe this photo',
        plugin: 'chat.alt-text',
        files: [{ name: 'lighthouse.png', type: 'image/png', content: PNG_1PX, b64: true }],
        ai: { ai: 'wolf' },
      }),
    });
    const res = await handle(req, env, {
      fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('A white lighthouse overlooking calm blue water.');
  });
});
