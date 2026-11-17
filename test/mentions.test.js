import { expect, test } from 'bun:test';
import { mentionName, mentions, wantsLookup, lookup } from '../src/lookup.js';

test('mentionName finds the cited thing', () => {
  expect(mentionName('who cited flisk.sh')).toBe('flisk.sh');
  expect(mentionName('Who mentions github.com/flisk-sh/flisk?')).toBe('github.com/flisk-sh/flisk');
  expect(mentionName('who is the president')).toBe('');
  expect(wantsLookup('who cited flisk.sh')).toBe(true);
});

const fake = async (url) => {
  const u = String(url);
  const body = u.includes('algolia') ? { hits: [{ objectID: '1', title: 'Show HN: flisk.sh', points: 5, num_comments: 2, url: 'https://flisk.sh' }, { objectID: '2', title: 'Unrelated', url: 'https://x.dev' }] }
    : u.includes('api.github.com') ? { items: [{ full_name: 'a/b', html_url: 'https://github.com/a/b', description: 'uses flisk.sh' }] }
    : u.includes('npmjs') ? { objects: [{ package: { name: 'other', description: 'nothing' } }] }
    : { query: { search: [] } };
  return { ok: true, json: async () => body };
};
test('mentions keeps only results that contain the name', async () => {
  const r = await mentions('flisk.sh', { fetchImpl: fake });
  expect(r.map((x) => x.title)).toEqual(['Hacker News: Show HN: flisk.sh', 'GitHub: a/b']);
  expect((await lookup('who cited flisk.sh', { fetchImpl: fake })).length).toBe(2);
});
