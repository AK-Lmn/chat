// chat's fleet client (src/fleet.js) takes its pod routes from capabilities/fleet.json. The routes are written out here,
// so an edit to that file that would change what chat sends to fleet fails.
import { expect, test } from 'bun:test';
import { CAPABILITIES } from '../src/capabilities.generated.js';
import { fleetClient } from '../src/fleet.js';

const actions = CAPABILITIES.find((m) => m.service === 'fleet').capabilities;

test.each([
  ['start', (f) => f.start(), 'POST /v1/pods'],
  ['run', (f) => f.run('a/b $&', 'ls'), 'POST /v1/pods/a%2Fb%20%24%26/run'],
  ['write', (f) => f.write('ID', 'a.txt', 'x'), 'PUT /v1/pods/ID/files'],
  ['read', (f) => f.read('ID', 'a b.txt'), 'GET /v1/pods/ID/files?path=a%20b.txt'],
  ['stop', (f) => f.stop('ID'), 'DELETE /v1/pods/ID'],
])('"%s" calls fleet on the connector route', async (_name, use, expected) => {
  let seen;
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    seen = `${init.method} ${u.pathname}${u.search}`;
    return new Response('{}');
  };
  await use(fleetClient({ FLEET_SERVICE_SECRET: 'test' }, 'octocat', fetchImpl));
  expect(seen).toBe(expected);
});

test('every fleet action says whether it reads, writes or spends', () => {
  for (const c of actions) expect(['read', 'write', 'spend']).toContain(c.access);
});
