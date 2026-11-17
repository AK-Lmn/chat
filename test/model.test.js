
test('Flisk Wolf is asked at low reasoning effort for chat and medium for a task', async () => {
  const { modelFrom } = await import('../src/model.js');
  const { answeredModel } = await import('../src/limits.js');
  const sent = [];
  const fetchImpl = async (_u, init) => { sent.push(JSON.parse(init.body).reasoning_effort); return Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }); };
  const m = modelFrom({ INFERENCE_KEY: 'k' }, fetchImpl);
  await m([{ role: 'user', content: 'hi' }]);
  await answeredModel(m).ask([{ role: 'user', content: 'build a site' }]);
  expect(sent).toEqual(['low', 'medium']);
});

test('our Vercel backup is off without a key and a daily cap, and stops at the cap', async () => {
  const { modelFrom, vercelCap, resetFallbacks, VERCEL_URL } = await import('../src/model.js');
  expect(vercelCap({})).toBe(0);
  expect(vercelCap({ VERCEL_AI_KEY: 'k' })).toBe(0);
  expect(vercelCap({ VERCEL_DAILY_REQUESTS: '50' })).toBe(0);
  expect(vercelCap({ VERCEL_AI_KEY: 'k', VERCEL_DAILY_REQUESTS: '50' })).toBe(50);
  const calls = [];
  const fetchImpl = async (u) => { calls.push(String(u)); return String(u) === VERCEL_URL ? Response.json({ choices: [{ message: { content: 'from vercel' }, finish_reason: 'stop' }] }) : new Response('down', { status: 500 }); };
  const base = { INFERENCE_KEY: 'k', NO_POLLINATIONS: '1' };
  const ask = (env, opts = {}) => { resetFallbacks(); return modelFrom(env, fetchImpl, undefined, opts)([{ role: 'user', content: 'hi' }]); };
  const off = await ask(base);
  expect(off.error).toBeTruthy();
  expect(calls).not.toContain(VERCEL_URL);
  const on = await ask({ ...base, VERCEL_AI_KEY: 'v', VERCEL_DAILY_REQUESTS: '5' }, { overVercel: async () => false });
  expect(on.text).toBe('from vercel');
  expect(on.by).toBe('vercel');
  calls.length = 0;
  const capped = await ask({ ...base, VERCEL_AI_KEY: 'v', VERCEL_DAILY_REQUESTS: '5' }, { overVercel: async (cap) => cap === 5 });
  expect(capped.error).toBeTruthy();
  expect(calls).not.toContain(VERCEL_URL);
});
