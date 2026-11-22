# North star: bounce rate on the first screen

**Metric:** share of visits to chat.flisk.si that leave after one page (bounce rate), from Flisk Analytics
(`/api/stats` for `chat.flisk.si`, range 7d). A visitor who does not understand the first screen leaves, so a
falling bounce rate is the measurable sign that the first five seconds work.

**Baseline:** 66% (49 visitors, 197 visits, 7 days to 2026-11-17, before the clear first screen).

**Target:** 1.5x lower, so 44% or less.

**How it is measured:** `.github/workflows/north-star.yml` runs `node scripts/measure-bounce.mjs` every Monday
and on demand, and publishes the number with the run's link to the `north-star` branch. GEL and Cilytics read it
there, so nobody types it in. The script reads the key from the `FLISK_ANALYTICS_KEY` repository secret (passed in
as `MEASURE_SECRET`).

- A bounce rate is only published from at least 50 visits in the 7 days. With fewer, or with no key, a rejected
  key or an API error, the script exits 2 and no number is published.
- A bounce rate of 0% is published as 0.1, because GEL needs a positive value.
- The sample is small and includes the team testing the site; read a move of a few points as noise.

**First real reading, 2026-11-22:** 75% over 256 visits, worse than the 66% baseline. The pitch line and chips
(chat#273) have not lowered the bounce rate yet.

**Also enforced in code:** `test/first-screen.test.js` holds the home page to the GEL five-second rules
(headline up to 12 words, lead up to 32, no jargon, a button right under the headline).

## What counts as engaged

The analytics beacon counts one pageview per page load, and chat never navigates. From 2026-11-22 the first task of a visit sends one more pageview, `/ask`, with the same visit id (`web/src/engaged.js`, `markEngaged`). A visit that asks for something is two pageviews, so it no longer reads as a bounce. Readings before that date counted every engaged visitor as a bounce, so they are not comparable: the 66% baseline and the first 74% reading both overstate the bounce.
