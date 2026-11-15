import { expect, test } from 'bun:test';
import { about, lookup, related, searchWords, sourcesNote, splitPoints, wantsLookup, wikiFor, withSources } from '../src/lookup.js';
import { runTask } from '../src/loop.js';

const page = (index, title, extract) => ({ index, title, extract, fullurl: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}` });
const wiki = (pages, seen = []) => async (url) => {
  seen.push(String(url));
  return { ok: true, json: async () => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [i, p])) } }) };
};

test('the search words are the subject of the question, without the filler', () => {
  expect(searchWords('The Animals - House Of The Rising Sun - this is the best song yes not??')).toBe('animals house rising sun song');
  expect(searchWords('why is the sky blue?')).toBe('sky blue');
  expect(searchWords('yes ok thanks')).toBe('');
});

test('only a plain question about the world is looked up', () => {
  expect(wantsLookup('is Inception a good movie?')).toBe(true);
  expect(wantsLookup('який рецепт борщу найкращий')).toBe(true);
  expect(wantsLookup('hello')).toBe(false);
  expect(wantsLookup('thanks!')).toBe(false);
  expect(wantsLookup('what is the bitcoin price right now')).toBe(false);
  expect(wantsLookup('get me some news today')).toBe(false);
  expect(wantsLookup('read https://example.com and sum it up')).toBe(false);
  expect(wantsLookup('make a website for a bakery', { building: true })).toBe(false);
  expect(wantsLookup('what is in this file', { files: 1 })).toBe(false);
});

test('a Cyrillic question goes to the Ukrainian Wikipedia', () => {
  expect(wikiFor('що таке борщ')).toBe('uk');
  expect(wikiFor('what is borscht')).toBe('en');
});

test('a page is a source only when its title shares a word with the question', () => {
  expect(related('The House of the Rising Sun', 'House Of The Rising Sun best song?')).toBe(true);
  expect(related('Perfect Days', 'House Of The Rising Sun best song?')).toBe(false);
});

test('lookup returns the related pages, best first, and drops the unrelated ones', async () => {
  const seen = [];
  const got = await lookup('The Animals - House Of The Rising Sun - best song?', { fetchImpl: wiki([
    page(3, 'Perfect Days', 'A 2023 film.'),
    page(2, 'The Animals', 'The Animals are an English rock band formed in Newcastle upon Tyne in 1962, known for the song "The House of the Rising Sun".'),
    page(1, 'The House of the Rising Sun', '"The House of the Rising Sun" is an American traditional folk song.'),
  ], seen) });
  expect(got.map((s) => s.title)).toEqual(['The House of the Rising Sun', 'The Animals']);
  expect(got[0].url).toBe('https://en.wikipedia.org/wiki/The_House_of_the_Rising_Sun');
  expect(seen[0]).toContain('en.wikipedia.org');
  expect(decodeURIComponent(seen[0]).replace(/\+/g, ' ')).toContain('animals house rising sun song');
});

test('lookup never throws: a failed search is no sources', async () => {
  expect(await lookup('why is the sky blue', { fetchImpl: async () => { throw new Error('down'); } })).toEqual([]);
  expect(await lookup('why is the sky blue', { fetchImpl: async () => ({ ok: false }) })).toEqual([]);
  expect(await lookup('why is the sky blue', { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })).toEqual([]);
});

test('the answer gets its sources as links, once', () => {
  const src = [{ title: 'Docker (software)', url: 'https://en.wikipedia.org/wiki/Docker_(software)', text: 'x' }];
  const out = withSources('Docker packs an app.', src);
  expect(out).toBe('Docker packs an app.\n\nSources: [Docker (software)](https://en.wikipedia.org/wiki/Docker_%28software%29)');
  expect(withSources(`See ${src[0].url}`, src)).toBe(`See ${src[0].url}`);
  expect(withSources('Hi.', [])).toBe('Hi.');
  expect(sourcesNote([])).toBe('');
  expect(sourcesNote(src)).toContain('[1] Docker (software)');
});

test('labelled points written as one paragraph become a list', () => {
  const one = 'Yes. **Origin:** a folk song. **Impact:** British Invasion. **Legacy:** still played.';
  expect(splitPoints(one)).toBe('Yes.\n\n- **Origin:** a folk song.\n- **Impact:** British Invasion.\n- **Legacy:** still played.');
  const list = '- **Origin:** a. **Impact:** b. **Legacy:** c.';
  expect(splitPoints(list)).toBe(list);
  expect(splitPoints('It is **very** good and **fast**.')).toBe('It is **very** good and **fast**.');
  const run = '**Taste differs**, but it is a classic. **Most covered** of all. **First folk rock hit** in 1964. **Want the story behind it?**';
  expect(splitPoints(run)).toBe('**Taste differs**, but it is a classic.\n\n- **Most covered** of all.\n- **First folk rock hit** in 1964.\n\n**Want the story behind it?**');
  const names = 'They were **John Lennon**, **Paul McCartney** and **Ringo Starr**.';
  expect(splitPoints(names)).toBe(names);
});

test('a plain question: the model is given the sources and the answer ends with them', async () => {
  const asked = [];
  const src = [{ title: 'Inception', url: 'https://en.wikipedia.org/wiki/Inception', text: 'Inception is a 2010 science fiction film directed by Christopher Nolan.' }];
  const events = [];
  const out = await runTask({
    task: 'is Inception a good movie?',
    lookupFacts: async () => src,
    model: async (messages) => { asked.push(messages); return { text: '{"say": "Yes. **Year:** 2010. **Director:** Christopher Nolan. **Genre:** science fiction."}' }; },
    computer: {}, publish: async () => '', emit: (e) => events.push(e),
  });
  expect(asked[0][0].content).toContain('Inception is a 2010 science fiction film');
  expect(out.answer).toContain('- **Year:** 2010.\n- **Director:** Christopher Nolan.');
  expect(out.answer.endsWith('Sources: [Inception](https://en.wikipedia.org/wiki/Inception)')).toBe(true);
  expect(events.some((e) => e.type === 'sources')).toBe(true);
});

test('a build request and a greeting are not looked up', async () => {
  let calls = 0;
  const run = (task) => runTask({ task, lookupFacts: async () => { calls++; return []; }, model: async () => ({ text: '{"say": "Hi."}' }), computer: {}, publish: async () => '', emit: () => {} });
  await run('hello');
  await run('make a website for a bakery');
  expect(calls).toBe(0);
});

test('a question with no name and too few subject words is not looked up', () => {
  expect(wantsLookup('ok cool')).toBe(false);
  expect(wantsLookup('why is the sky blue?')).toBe(false);
  expect(wantsLookup('is Inception a good movie?')).toBe(true);
  expect(wantsLookup('the animals house of the rising sun best song?')).toBe(true);
});

test('a page is a source only when the question names all of its title', () => {
  expect(related('Sky Blue Sky', 'why is the sky blue?')).toBe(true);
  expect(related('Cool Runnings', 'ok cool')).toBe(false);
  expect(related('Inception (soundtrack)', 'is Inception a good movie?')).toBe(true);
  expect(related('The Animals', 'The Animals - House Of The Rising Sun')).toBe(true);
  expect(related('Animal rights', 'The Animals - House Of The Rising Sun')).toBe(false);
});

test('a page whose text is about something else is not a source', () => {
  const q = 'how much sleep do adults need?';
  expect(about({ title: 'Adults (TV series)', text: 'Adults is a British comedy series first shown in 2025.' }, q)).toBe(false);
  expect(about({ title: 'Sleep', text: 'Sleep is a state of reduced activity. Adults need seven hours or more.' }, q)).toBe(true);
  expect(about({ title: 'Inception', text: 'Inception is a 2010 science fiction film.' }, 'is Inception a good movie?')).toBe(true);
});
