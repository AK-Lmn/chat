import { describe, expect, test } from 'bun:test';
import { appPage } from '../src/page.js';
import { inlineLocal, localImages, MAX_LAYOUT_BYTES, runTask, SYSTEM } from '../src/loop.js';

const scripted = (...texts) => { let i = 0; return async () => ({ text: texts[Math.min(i++, texts.length - 1)] }); };
const disk = (files) => async (path) => (path in files ? { status: 200, data: { encoding: 'utf8', content: files[path] } } : { error: `No such file: ${path}` });

describe('a site written as separate files is published as one page', () => {
  test('stylesheets and scripts next to the page are put into it; other links stay', async () => {
    const html = '<html><head><link rel="stylesheet" href="styles.css"><link rel="icon" href="icon.png"><link rel="stylesheet" href="https://fonts.example/x.css"><script src="app.js" defer></script></head><body><h1>Hearth</h1></body></html>';
    const r = await inlineLocal(html, '~/site/index.html', disk({ '~/site/styles.css': 'h1{color:red}', '~/site/app.js': 'go("</script>")' }));
    expect(r.missing).toEqual([]);
    expect(r.html).toContain('<style>\nh1{color:red}\n</style>');
    expect(r.html).toContain('<link rel="icon" href="icon.png">');
    expect(r.html).toContain('https://fonts.example/x.css');
    expect(r.html).not.toContain('src="app.js"');
    // The deferred script runs after the page, as it would have: it moves to the end of the body.
    expect(r.html).toMatch(/<h1>Hearth<\/h1><script>\ngo\("<\\\/script>"\)\n<\/script>\n<\/body>/);
  });

  test('a module script stays where it is, with its type', async () => {
    const r = await inlineLocal('<head><script type="module" src="./js/main.js"></script></head>', 'site/index.html', disk({ 'site/js/main.js': 'x()' }));
    expect(r.html).toBe('<head><script type="module">\nx()\n</script></head>');
  });

  test('a linked file that is not there is reported', async () => {
    const r = await inlineLocal('<link rel="stylesheet" href="styles.css">', '~/site/index.html', disk({}));
    expect(r.missing).toEqual(['styles.css']);
  });

  test('a picture next to the page goes into it, so the published page shows it (2026-11-15: cat.jpg was left behind)', async () => {
    const read = async (path) => (path === '~/site/cat.jpg' ? { status: 200, data: { encoding: 'base64', content: '/9j/4AAQ\nSkZJRg==' } } : path === '~/site/mark.svg' ? { status: 200, data: { encoding: 'utf8', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' } } : { error: `No such file: ${path}` });
    const html = '<body><img src="cat.jpg" alt="A cat taking a mirror selfie"><img alt="mark" src=\'./mark.svg\'><img src="https://example.com/a.png"><img src="data:image/png;base64,AAAA"></body>';
    const r = await inlineLocal(html, '~/site/index.html', read);
    expect(r.missing).toEqual([]);
    expect(r.pictures).toBe(2);
    expect(r.html).toContain('<img src="data:image/jpeg;base64,/9j/4AAQSkZJRg==" alt="A cat taking a mirror selfie">');
    expect(r.html).toContain(`src="data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')}"`);
    expect(r.html).toContain('<img src="https://example.com/a.png">');
    expect(localImages(r.html)).toEqual([]);
    expect(localImages(html)).toEqual(['cat.jpg', './mark.svg']);
  });

  test('a picture that is not there, or was read as text, is reported and never published as a broken image', async () => {
    const read = async (path) => (path === 'site/b.jpg' ? { status: 200, data: { encoding: 'utf8', content: 'garbled' } } : { error: 'No such file' });
    const r = await inlineLocal('<img src="a.jpg"><img src="b.jpg"><img src="notes.txt">', 'site/index.html', read);
    expect(r.missing).toEqual(['a.jpg', 'b.jpg', 'notes.txt']);
    expect(r.pictures).toBe(0);
  });

  test('cat replay: the page with its picture is published whole, with room for the picture', async () => {
    const jpg = 'QUJD'.repeat(70000); // 280 KB of base64: over the plain page limit
    const files = { '~/site/cat.jpg': { encoding: 'base64', content: jpg } };
    const computer = {
      start: async () => ({ status: 201, data: { id: 'p1', provider: 'upstash' } }),
      stop: async () => ({ status: 200, data: {} }),
      run: async () => ({ status: 200, data: { exitCode: 0, stdout: '', stderr: '' } }),
      write: async (id, path, content) => ((files[path] = { encoding: 'utf8', content }), { status: 200, data: {} }),
      read: async (id, path) => (files[path] ? { status: 200, data: files[path] } : { error: `No such file: ${path}` }),
    };
    const page = '<html><body><h1>Cat Mirror Selfie</h1><img src="cat.jpg" alt="A cat taking a mirror selfie"></body></html>';
    const published = [];
    const out = await runTask({
      task: 'make a web page with a photo of my cat taking a mirror selfie', computer, origin: 'https://chat.test',
      model: scripted(JSON.stringify({ write: { path: '~/site/index.html', content: page } }), '{"publish": "~/site/index.html"}', '{"say": "Your page is live: https://chat.test/s/abc"}'),
      publish: async (html, o) => (published.push({ html, limit: o?.limit }), { url: 'https://chat.test/s/abc' }),
    });
    expect(published.length).toBe(1);
    expect(localImages(published[0].html)).toEqual([]);
    expect(published[0].html).toContain('src="data:image/jpeg;base64,QUJD');
    expect(published[0].limit).toBe(MAX_LAYOUT_BYTES);
    expect(out.stats.errors).toBe(0);
  });

  test('bakery replay (2026-11-14): index.html, styles.css and app.js published as one page, no Flisk', async () => {
    const files = {};
    const computer = {
      start: async () => ({ status: 201, data: { id: 'p1', provider: 'upstash' } }),
      stop: async () => ({ status: 200, data: {} }),
      run: async () => ({ status: 200, data: { exitCode: 0, stdout: '', stderr: '' } }),
      write: async (id, path, content) => ((files[path] = content), { status: 200, data: {} }),
      read: async (id, path) => disk(files)(path),
    };
    const page = '<html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Hearth &amp; Crumb</h1>' + '<section>Fresh bread every morning.</section>'.repeat(40) + '<script src="app.js"></script></body></html>';
    const model = scripted(
      JSON.stringify({ write: { path: '~/site/index.html', content: page } }),
      JSON.stringify({ write: { path: '~/site/styles.css', content: 'body{font-family:system-ui}' } }),
      JSON.stringify({ write: { path: '~/site/app.js', content: 'document.title="Hearth"' } }),
      '{"publish": "~/site/index.html"}',
      '{"say": "https://chat.flisk.si/s/x"}',
    );
    const published = [];
    const r = await runTask({ task: 'bakery website with many sections, as separate files (index.html, styles.css, app.js)', model, computer, publish: async (html) => (published.push(html), { url: 'https://chat.flisk.si/s/x' }) });
    expect(r.stats.errors).toBe(0);
    expect(published).toHaveLength(1);
    expect(published[0]).toContain('body{font-family:system-ui}');
    expect(published[0]).toContain('document.title="Hearth"');
    expect(published[0]).not.toContain('href="styles.css"');
  });
});

describe('the recipe names where the files go', () => {
  test('a Flisk website keeps the scaffold layout: index.html, src/style.css, src/main.ts', () => {
    expect(SYSTEM).toContain('<script type="module" src="/src/main.ts"></script>');
    expect(SYSTEM).toContain('href="/src/style.css"');
    expect(SYSTEM).toContain('never copy a file to a second place');
  });

  test('"What: A website" is a show-only page, never a Flisk app', () => {
    expect(SYSTEM).toContain('When the answers say "What: A website", it is a show-only website');
  });
});

describe('the "What" guess from the request', () => {
  const page = appPage({ login: 'x' });
  const line = page.match(/const kind=(.*?);\n/)[1];
  const guess = new Function('task', `return ${line};`);

  test('a file name such as app.js does not make a website "A small app" (bakery, 2026-11-14)', () => {
    expect(guess('bakery website with many sections, as separate files (index.html, styles.css, app.js)')).toBe('A website');
  });

  test('a real app is still an app', () => {
    expect(guess('Build a tip calculator web page with a dark theme.')).toBe('A small app');
    expect(guess('a booking app for my salon')).toBe('A small app');
  });
});
