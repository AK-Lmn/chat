// Chat's view of fleet.flisk.si: a trusted site that signs users in itself and calls fleet for them.
// One computer (pod) per task: start on the first action, stop at the end, unless the task shared the running app (share.js).
// The routes for pod actions come from fleet's connector file (capabilities/fleet.json).
import { CAPABILITIES } from './capabilities.generated.js';
import { friendlyUrl } from './share.js';

const ROUTES = Object.fromEntries(CAPABILITIES.find((m) => m.service === 'fleet').capabilities.map((c) => [c.id, c.http]));

// "pod_run" and a pod id -> ['POST', '/v1/pods/<id>/run']
function route(action, id) {
  const [method, path] = ROUTES[action].split(' ');
  return [method, path.replace('{id}', () => encodeURIComponent(id))];
}

export function fleetClient(env, login, fetchImpl = fetch) {
  const base = (env.FLEET_URL || 'https://fleet.flisk.si').replace(/\/$/, '');
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${env.FLEET_SERVICE_SECRET}`, 'x-on-behalf-of': login, 'content-type': 'application/json', 'user-agent': 'flisk-chat' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, error: res.status >= 400 ? data.error || `fleet answered ${res.status}` : null };
  };
  return {
    connections: async () => (await call('GET', '/v1/connections')).data.connections || {},
    connect: async (provider, key) => call('PUT', `/v1/connections/${encodeURIComponent(provider)}`, { key }),
    // order: provider ids to use, in this order; empty means fleet picks the cheapest of the connected ones.
    // public: a computer that can later give a port a public URL (share.js). Fleet starts a normal one where that is not possible.
    start: async (order = []) => call(...route('pod_create'), { cpu: 2, ram: 4, public: true, ...(order.length ? { order } : {}) }),
    share: async (id, port, startup) => {
      const r = await call('POST', `/v1/pods/${encodeURIComponent(id)}/public`, { port, startup });
      if (r.data?.url && env.APP_HOST) r.data.url = friendlyUrl(r.data.url, env.APP_HOST); // https://name-3000.app.flisk.si instead of the provider's address
      return r;
    },
    run: async (id, command) => call(...route('pod_run', id), { command, timeout: 60 }),
    write: async (id, path, content) => call(...route('pod_write_file', id), { path, content }),
    read: async (id, path) => {
      const [method, files] = route('pod_read_file', id);
      return call(method, `${files}?path=${encodeURIComponent(path)}`);
    },
    stop: async (id) => call(...route('pod_stop', id)),
  };
}
