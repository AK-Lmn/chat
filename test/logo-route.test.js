import { describe, expect, it } from 'bun:test';
import { handle } from '../src/index.js';

const png = () => new Response('x', { headers: { 'content-type': 'image/png' } });
describe('/logo/<host>', () => {
  it('serves the favicon as an image', async () => {
    const r = await handle(new Request('https://chat.flisk.si/logo/tilt.dev'), {}, { fetchImpl: async () => png() });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
  });
  it('rejects a bad host without fetching', async () => {
    let n = 0;
    const r = await handle(new Request('https://chat.flisk.si/logo/..%2Fx'), {}, { fetchImpl: async () => { n++; return png(); } });
    expect(r.status).toBe(404);
    expect(n).toBe(0);
  });
});
