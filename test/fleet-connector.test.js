// chat's fleet client (src/fleet.js) and fleet's connector file (capabilities/fleet.json) must not drift apart.
import { expect, test } from 'bun:test';
import { CAPABILITIES } from '../src/capabilities.generated.js';
import { fleetClient } from '../src/fleet.js';

const actions = CAPABILITIES.find((m) => m.service === 'fleet').capabilities;

test.each([
  ['pod_create', (f) => f.start()],
  ['pod_run', (f) => f.run('ID', 'ls')],
  ['pod_write_file', (f) => f.write('ID', 'a.txt', 'x')],
  ['pod_read_file', (f) => f.read('ID', 'a.txt')],
  ['pod_stop', (f) => f.stop('ID')],
])('chat calls "%s" on the route the connector names', async (id, use) => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = `${init.method} ${new URL(url).pathname.replace('/ID', '/{id}')}`;
    return new Response('{}');
  };
  await use(fleetClient({ FLEET_SERVICE_SECRET: 'test' }, 'octocat', fetchImpl));
  expect(seen).toBe(actions.find((c) => c.id === id)?.http);
});

test('every fleet action says whether it reads, writes or spends', () => {
  for (const c of actions) expect(['read', 'write', 'spend']).toContain(c.access);
});
