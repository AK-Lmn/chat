# North star: bounce rate on the first screen

**Metric:** share of visits to chat.flisk.si that leave after one page (bounce rate), from Flisk Analytics
(`site_stats` for `chat.flisk.si`, range 7d). A visitor who does not understand the first screen leaves, so a
falling bounce rate is the measurable sign that the first five seconds work.

**Baseline:** 66% (49 visitors, 197 visits, 7 days to 2026-11-17, before the clear first screen).

**Target:** 1.5x lower, so 44% or less. `gel` fails the guard until `bench/north-star.json` shows it.

**How to re-measure:** read `site_stats` for `chat.flisk.si`, range 7d, copy `bounceRate` into `value`, set
`measuredAt`, commit. Do it once a week. The sample is small and includes the team testing the site; read
a move of a few points as noise.

**Also enforced in code:** `test/first-screen.test.js` holds the home page to the GEL five-second rules
(headline up to 12 words, lead up to 32, no jargon, a button right under the headline).
