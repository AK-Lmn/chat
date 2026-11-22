// North star measure (docs/gel.json north_star.measure): the bounce rate of chat.flisk.si over the last 7 days,
// read from Flisk Analytics. Lower is better. The last stdout line is JSON with a numeric `value`.
// Exit 0: measured. Exit 2: no number could be measured (no key, the API failed, or too few visits to mean anything).
// A bad number is not an error here: GEL judges it against the baseline and the target and publishes either way.
import { pathToFileURL } from 'node:url';

export const SITE = 'chat.flisk.si';
export const RANGE = '7d';
export const BASELINE = 66;
// Under this many visits a bounce rate is a coin toss, so it is not published as a measurement.
export const MIN_VISITS = 50;
const URL_BASE = 'https://analytics.flisk.si/api/stats';

// Pure: stats JSON from /api/stats -> the measurement, or { error } saying why there is none.
export function bounceRate(stats) {
  const cur = stats?.current;
  const rate = Number(cur?.bounceRate);
  const visits = Number(cur?.visits);
  if (cur?.bounceRate == null || !Number.isFinite(rate) || rate < 0 || rate > 100) return { error: 'the stats have no bounce rate' };
  if (!Number.isInteger(visits) || visits < MIN_VISITS) return { error: `only ${cur?.visits ?? 0} visits in ${RANGE}, need ${MIN_VISITS} for a bounce rate that means something` };
  // GEL needs a positive value; 0% bounce reads as 0.1.
  return { value: Math.max(0.1, rate), baseline: BASELINE, unit: '% bounce', site: SITE, range: RANGE, visits, visitors: Number(cur.visitors) || null };
}

export async function measure(env = process.env, fetchImpl = fetch) {
  const key = env.MEASURE_SECRET;
  if (!key) return { error: 'MEASURE_SECRET is not set (the Flisk Analytics key)' };
  let res;
  try {
    res = await fetchImpl(`${URL_BASE}?site=${SITE}&range=${RANGE}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return { error: `could not reach Flisk Analytics: ${e.message}` };
  }
  if (!res.ok) return { error: `Flisk Analytics answered ${res.status}` };
  let stats;
  try { stats = await res.json(); } catch { return { error: 'Flisk Analytics did not answer with JSON' }; }
  return bounceRate(stats);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = await measure();
  if (out.error) {
    console.error(`measure-bounce: ${out.error}`);
    process.exit(2);
  }
  console.log(JSON.stringify(out));
}
