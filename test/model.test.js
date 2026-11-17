
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
