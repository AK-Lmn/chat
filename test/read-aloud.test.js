import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isReadAloudCommand, spokenText, resultText, speechChunks, speechLang, createReader } from '../web/src/read-aloud.js';
import { newTurn } from '../web/src/events.js';
import catalog from '../plugins/catalog.json';

describe('read-aloud voice and typed commands', () => {
  test.each([
    'read it to me',
    'Read it to me.',
    'please read it to me',
    'can you read that to me?',
    'read this to me',
    'read it aloud',
    'read it out loud',
    'read the result',
    'read the result aloud',
    'read the answer out loud',
    'read that back',
    'read aloud',
  ])('"%s" triggers read-aloud', (t) => {
    expect(isReadAloudCommand(t)).toBe(true);
  });

  test('ordinary requests are left to the chat', () => {
    const ordinary = [
      'what is the weather',
      'build me a shop',
      'read package.json',
      'read this file and summarize it',
      'how do I read a CSV in Python',
      'write a story about someone who loved to read aloud in a very long sentence that goes on and on and on',
      '',
      null,
    ];
    for (const t of ordinary) expect(isReadAloudCommand(t)).toBe(false);
  });

  test('the catalog lists voice.read-aloud as ready with phrases the parser understands', () => {
    const p = catalog.plugins.find((x) => x.id === 'voice.read-aloud');
    expect(p).toBeDefined();
    expect(p.status).toBe('ready');
    expect(p.group).toBe('Voice and chat');
    for (const v of p.voice) expect(isReadAloudCommand(v)).toBe(true);
  });
});

describe('read-aloud text extraction', () => {
  test('reads the latest turn answer and strips markdown, code blocks, and links', () => {
    const t1 = { ...newTurn('first'), answer: 'Old answer.' };
    const t2 = { ...newTurn('second'), text: 'streamed', answer: '# Title\n\nIt is **sunny** today. See [the forecast](https://example.com) and https://foo.test/x\n```js\nconst x = 1;\n```' };
    expect(resultText([{ task: 'first', t: t1 }, { task: 'second', t: t2 }])).toBe('Title. It is sunny today. See the forecast and link');
  });

  test('falls back to outputs, errors, or links, and returns empty when there is no result', () => {
    expect(resultText([])).toBe('');
    expect(resultText([{ task: 'q', t: newTurn('q') }])).toBe('');
    expect(resultText([{ task: 'q', t: { ...newTurn('q'), outs: [{ text: 'hello stdout' }] } }])).toBe('hello stdout');
    expect(resultText([{ task: 'q', t: { ...newTurn('q'), error: { message: 'Something failed.' } } }])).toBe('Something failed.');
    expect(resultText([{ task: 'q', t: { ...newTurn('q'), link: 'https://chat.flisk.si/s/abc' } }])).toBe('Your link is ready.');
    expect(spokenText('![pic](https://x.test/a.png)\nLine two')).toBe('pic. Line two');
  });

  test('splits long text into chunks and detects Ukrainian or Russian', () => {
    expect(speechChunks('First sentence is fairly short. Second sentence is here.')).toEqual(['First sentence is fairly short. Second sentence is here.']);
    const long = 'Sentence one is long enough to exceed one hundred and eighty characters when repeated several times in a row here. '.repeat(2).trim();
    expect(speechChunks(long).length).toBe(2);
    expect(speechLang('Привіт, як справи?')).toBe('uk');
    expect(speechLang('Это всё работает.')).toBe('ru');
    expect(speechLang('Hello world')).toBe('');
  });
});

describe('read-aloud audio player', () => {
  test('streams chunks from /voice and fires onEnd when finished', async () => {
    const played = [];
    class FakeAudio {
      constructor() { this.src = ''; this.onended = null; this.onerror = null; }
      play() {
        played.push(this.src);
        queueMicrotask(() => this.onended && this.onended());
        return Promise.resolve();
      }
      pause() {}
    }
    const r = createReader({ AudioCtor: FakeAudio, tts: null, Utterance: null });
    let ended = false;
    expect(r.speak('Hello world.', { onEnd: () => { ended = true; } })).toBe(true);
    await new Promise((res) => setTimeout(res, 10));
    expect(played).toEqual(['/voice?l=&t=Hello%20world.']);
    expect(ended).toBe(true);
    expect(r.isSpeaking()).toBe(false);
  });

  test('falls back to speechSynthesis once when /voice fails and supports stop()', async () => {
    const spoken = [];
    let cancelled = 0;
    let paused = 0;
    class FailingAudio {
      constructor() { this.src = ''; this.onended = null; this.onerror = null; }
      play() {
        queueMicrotask(() => this.onerror && this.onerror());
        return Promise.reject(new Error('blocked'));
      }
      pause() { paused++; }
    }
    class FakeUtterance {
      constructor(text) { this.text = text; this.lang = ''; this.onend = null; this.onerror = null; }
    }
    const tts = {
      speak(u) { spoken.push(u.text); queueMicrotask(() => u.onend && u.onend()); },
      cancel() { cancelled++; },
    };
    const r = createReader({ AudioCtor: FailingAudio, tts, Utterance: FakeUtterance });
    r.speak('Read this.');
    await new Promise((res) => setTimeout(res, 10));
    expect(spoken).toEqual(['Read this.']);
    r.stop();
    expect(paused).toBeGreaterThan(0);
    expect(cancelled).toBeGreaterThan(0);
    expect(r.isSpeaking()).toBe(false);
  });
});

describe('read-aloud app and picker wiring', () => {
  test('App.jsx handles read-aloud in submit, dictate, and the plugin picker', () => {
    const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
    const app = src('../web/src/App.jsx');
    for (const needle of ["from './read-aloud.js'", 'toReadAloud(text)', 'toReadAloud(task)', 'onReadAloud={readResult}']) expect(app).toContain(needle);
    expect(src('../web/src/Plugins.jsx')).toContain("p.id === 'voice.read-aloud'");
  });
});
