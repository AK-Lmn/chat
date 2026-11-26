import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseVoiceCommand } from '../web/src/voice-commands.js';
import catalog from '../plugins/catalog.json';

describe('voice.commands ("hey flisk") parser', () => {
  test.each([
    'hey flisk',
    'Hey Flisk!',
    'hey, flisk.',
    'hi flisk',
    'hello flisk',
    'ok flisk',
    'okay flisk',
    'hey flisk, please',
    'hey flisk voice talk',
    'hey flisk, open oracle',
  ])('wake phrase "%s" opens Voice talk', (input) => {
    expect(parseVoiceCommand(input)).toEqual({ cmd: 'talk' });
  });

  test.each([
    ['hey flisk, new chat', { cmd: 'newChat' }],
    ['hey flisk start a new chat', { cmd: 'newChat' }],
    ['hey flisk open plugins', { cmd: 'plugins' }],
    ['hey flisk, open studio', { cmd: 'studio' }],
    ['hey flisk close photo editor', { cmd: 'closeStudio' }],
    ['hey flisk, open settings', { cmd: 'settings' }],
    ['hey flisk choose model', { cmd: 'model' }],
    ['hey flisk connect computer', { cmd: 'computers' }],
    ['hey flisk attach file', { cmd: 'attach' }],
    ['hey flisk dictate', { cmd: 'dictate' }],
    ['hey flisk, read it to me', { cmd: 'readAloud' }],
    ['hey flisk explain mode', { cmd: 'explain' }],
    ['hey flisk stop', { cmd: 'stop' }],
    ['hey flisk, dark mode', { cmd: 'scheme', scheme: 'dark' }],
    ['hey flisk switch to light look', { cmd: 'scheme', scheme: 'light' }],
    ['hey flisk earth theme', { cmd: 'scheme', scheme: 'earth' }],
    ['hey flisk system look', { cmd: 'scheme', scheme: 'system' }],
  ])('"%s" resolves to %j', (input, expected) => {
    expect(parseVoiceCommand(input)).toEqual(expected);
  });

  test('wake phrase with a task strips "hey flisk" and forwards the task', () => {
    expect(parseVoiceCommand('hey flisk, build me a coffee shop website')).toEqual({
      cmd: 'task',
      task: 'build me a coffee shop website',
    });
    expect(parseVoiceCommand('Hey Flisk what is the weather in Tokyo?')).toEqual({
      cmd: 'task',
      task: 'what is the weather in Tokyo?',
    });
  });

  test.each([
    'what is hey flisk?',
    'how does hey flisk work',
    'explain voice commands',
    'build me a shop',
    'what is the weather',
    '',
    null,
    'hey flisk ' + 'a'.repeat(200),
  ])('ordinary request %p is left to the chat', (input) => {
    expect(parseVoiceCommand(input)).toBeNull();
  });

  test('catalog lists voice.commands as ready with phrases the parser understands', () => {
    const p = catalog.plugins.find((x) => x.id === 'voice.commands');
    expect(p).toBeDefined();
    expect(p.title).toBe('Voice commands');
    expect(p.group).toBe('Voice and chat');
    expect(p.owner).toBe('flisk');
    expect(p.status).toBe('ready');
    for (const v of p.voice) expect(parseVoiceCommand(v)?.cmd).toBe('talk');
  });
});

describe('voice.commands app and picker wiring', () => {
  test('App.jsx and Plugins.jsx wire typed, spoken, and picker voice commands', () => {
    const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
    const app = read('../web/src/App.jsx');
    for (const needle of [
      "from './voice-commands.js'",
      'parseVoiceCommand(text)',
      'parseVoiceCommand(task)',
      'runVoiceCommand(vc)',
      'onVoiceCommands={() => setTalk(true)}',
    ]) expect(app).toContain(needle);
    expect(read('../web/src/Plugins.jsx')).toContain("p.id === 'voice.commands'");
  });
});
