import { describe, expect, test } from 'bun:test';
import { homePath, runTask } from '../src/loop.js';

const scripted = (...texts) => { let i = 0; return async () => ({ text: texts[Math.min(i++, texts.length - 1)] }); };

describe('guessed home folders', () => {
  test('a path under /home/<anyone> or /root goes to ~', () => {
    expect(homePath('/home/user/coffee/styles.css')).toBe('~/coffee/styles.css');
    expect(homePath('/home/ubuntu/app')).toBe('~/app');
    expect(homePath('/root/site/index.html')).toBe('~/site/index.html');
    expect(homePath('/home/user')).toBe('~');
  });

  test('other paths stay as they are', () => {
    for (const p of ['index.html', '~/app/web/index.html', '/tmp/up.log', '/workspace/home/a.txt', '/homes/x', '/rootfs/x']) expect(homePath(p)).toBe(p);
  });

  test('write, read and publish reach the computer with ~ (coffee site, 2026-11-14)', async () => {
    const calls = [];
    const computer = {
      start: async () => ({ status: 201, data: { id: 'p1', provider: 'upstash' } }),
      stop: async () => ({ status: 200, data: {} }),
      run: async () => ({ status: 200, data: { exitCode: 0, stdout: '', stderr: '' } }),
      write: async (id, path) => (calls.push(['write', path]), path.startsWith('/home/') ? { error: 'Permission denied' } : { status: 200, data: {} }),
      read: async (id, path) => (calls.push(['read', path]), { status: 200, data: { encoding: 'utf8', content: '<html><body><h1>Roast</h1></body></html>' } }),
    };
    const model = scripted('{"write": {"path": "/home/user/coffee/styles.css", "content": "body{}"}}', '{"read": "/home/user/coffee/styles.css"}', '{"publish": "/root/coffee/index.html"}', '{"say": "done"}');
    const r = await runTask({ task: 'coffee website', model, computer, publish: async () => ({ url: 'https://chat.flisk.si/s/x' }) });
    expect(calls).toEqual([['write', '~/coffee/styles.css'], ['read', '~/coffee/styles.css'], ['read', '~/coffee/index.html']]);
    expect(r.stats.errors).toBe(0);
  });
});
