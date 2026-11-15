import { expect, test } from 'bun:test';
import { playbooksFor, runTask } from '../src/loop.js';

// chat.flisk.si 2026-11-15: "get me some news today" curled newsapi.org with an invented key, then told the
// customer "Please provide a valid API key". It must try another way instead.
const computer = {
  start: async () => ({ status: 201, data: { id: 'p1', provider: 'upstash' } }),
  stop: async () => ({ status: 200, data: {} }),
  run: async (id, cmd) => ({ status: 200, data: { exitCode: 0, stdout: cmd.includes('newsapi') ? '{"status":"error","code":"apiKeyMissing"}' : '<title>Big story</title>', stderr: '' } }),
  write: async () => ({ status: 200, data: {} }),
  read: async () => ({ error: 'No such file' }),
};

test('a give-up answer asking for an API key is sent back to try another way', async () => {
  const replies = [
    '{"run": "curl -s https://newsapi.org/v2/top-headlines"}',
    '{"say": "The API key is missing. Please provide a valid API key for the news service."}',
    '{"run": "curl -s https://feeds.bbci.co.uk/news/rss.xml"}',
    '{"say": "Today: **Big story**"}',
  ];
  const seen = [];
  let i = 0;
  const model = async (m) => (seen.push(JSON.stringify(m.at(-1)) + (i === 0 ? m[0].content : '')), { text: replies[i++] });
  const r = await runTask({ task: 'get me some news today', model, computer, publish: async () => ({}) });
  expect(r.answer).toBe('Today: **Big story**');
  expect(seen[2]).toContain('Find another way');
  expect(seen[0]).toContain('feeds.bbci.co.uk');
});

test('gives up for real only after three pushes', async () => {
  const say = '{"say": "I cannot do this, please provide an API key."}';
  let n = 0;
  const model = async () => (n++, { text: say });
  const r = await runTask({ task: 'news', model, computer, publish: async () => ({}) });
  expect(n).toBe(4);
  expect(r.answer).toContain('cannot');
});

test('playbooks match the task', () => {
  expect(playbooksFor('bitcoin price')).toContain('coingecko');
  expect(playbooksFor('write me a poem')).toBe('');
});

import { web } from '../src/widgets.js';
test('the web widget reads an RSS feed as titles with links', async () => {
  const rss = '<rss><channel><title>BBC</title><item><title><![CDATA[Big story]]></title><link>https://bbc.co.uk/1</link></item></channel></rss>';
  const r = await web({ url: 'https://feeds.bbci.co.uk/news/rss.xml' }, { fetch: async () => new Response(rss) });
  expect(r.summary).toContain('- Big story (https://bbc.co.uk/1)');
  expect((await web({ url: 'http://localhost/x' }, { fetch })).error).toContain('public');
  expect((await web({ url: 'https://x.test' }, { fetch: async () => new Response('', { status: 403 }) })).error).toContain('another address');
});

test('passive give-ups are caught and price playbooks use the web reader', () => {
  expect(playbooksFor('bitcoin price')).toContain('"kind": "web"');
  expect(playbooksFor('usd to eur exchange rate')).toContain('"kind": "web"');
});
test('"could not be retrieved" is a give-up', async () => {
  const replies = ['{"say": "The Bitcoin price could not be retrieved at this time."}', '{"say": "BTC is $90,000"}'];
  let i = 0;
  const r = await runTask({ task: 'bitcoin price', model: async () => ({ text: replies[i++] }), computer, publish: async () => ({}) });
  expect(r.answer).toBe('BTC is $90,000');
});
