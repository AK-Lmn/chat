// How chat answers a research or analysis question: competitors, alternatives, a market, "compare A and B", "which
// should I pick", a strategy or "what are the pros and cons". Kept apart from ANSWER_STYLE because the answer loop
// (evals/answers/loop.mjs) rewrites that file from its export to the end.
export const ANALYSIS_STYLE = `- Research or analysis questions (competitors or alternatives of a product, a market, "compare A and B", "which should I choose", a strategy, pros and cons). These get a full structured report, not the short plain answer above, about 350 to 600 words:
  1. One bold headline sentence that answers the question outright (the names, in order of importance).
  2. A one or two line frame of what space the thing is in and what it is for. If the question names a site or product, read its page first with the web widget so the report is about what it really does.
  3. Numbered "##" sections, for example: 1. Direct competitors (each as a bold name that is a Markdown link, as in **[Tilt](https://tilt.dev)**, and 2 or 3 bullets of what it does and how it overlaps); 2. Adjacent tools, as a table (Product | Link | Overlap), the Product and Link cells as Markdown links; 3. Positioning, as a table (Name | Main strength | Threat or fit, rated Very high / High / Medium / Low); 4. Where the subject can differentiate (2 to 3 numbered points, each starting with a bold label); 5. My recommendation (the top few to focus on, in order, with one reason each, then the one strategic question that matters most).
  4. Say plainly which parts are your own judgment and not measured data ("qualitative, not market share"), and which come from the page you read. Never invent a number, star count, price or date; leave it out instead.
  5. Every product or site you name gets a Markdown link to its real home page (https://...), in lists and tables alike; never a bare name where a link is known.
  6. Last line: one specific offer of the deeper next step ("Want a feature-by-feature matrix with pricing and target customers?").
  Do this without a computer: use the web widget, never curl, install or run anything for a question like this.`;

// Chat decides this itself: a small or hurried model otherwise picks the short answer, or starts a computer and curls the site.
export const ANALYSIS_ASK = /\b(competitors?|alternatives?|rivals?|compare|comparison|versus|vs\.?|market|positioning|swot|pros and cons|differentiate|конкурент\p{L}*|альтернатив\p{L}*)\b/iu;
export function asksAnalysis(task) {
  const t = String(task ?? '');
  return t.length <= 500 && ANALYSIS_ASK.test(t) && !/\b(build|make|create|scaffold|deploy|code|implement)\b/i.test(t);
}
export const ANALYSIS_NOTE = '\n\nThis question is a research or analysis question: use the full report format above (headline sentence, numbered sections, the two tables, recommendation, one next-step offer). If it names a site or product, first read its page with {"widget": {"kind": "web", "url": "https://<that site>"}}, then reply with "say". Do NOT use run or write: no computer is needed.';

// "Draw me stats about X", "show launches per year", "chart of ...": a data request. It is answered with real numbers on an
// interactive chart (the chart widget), never with a drawn picture or SVG art.
export const STATS_ASK = /\b(stats?|statistics|statistic|numbers|metrics|figures|trends?|how many|per (?:year|month|day|week)|by (?:year|month|day|week)|launch(?:es)?|history of|over time|dashboard|infographic|charts?|graphs?|plots?)\b/i;
export function asksStats(task) {
  const t = String(task ?? '');
  return t.length <= 500 && STATS_ASK.test(t) && !/\b(build|scaffold|deploy|implement|code|app|website)\b/i.test(t);
}
export const STATS_NOTE = '\n\nThis is a data request: the user wants real numbers shown as a chart, NOT a drawn picture and NOT SVG art. Read real data first with the web widget (a public API or page that needs no key, for example Wikipedia, Wikidata, the SpaceX API https://api.spacexdata.com/v4/launches, Launch Library https://ll.thespacedevs.com/2.2.0/launch/?limit=100, World Bank https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json); if one address fails try another. Count or group the data on the computer if it is large, then send ONE chart widget with the real points (a "source" naming where they come from, a clear title and unit), choosing "bar", "line" or "area" to fit. If you could not read real data, say so plainly: never invent numbers. After the chart, "say" two or three plain sentences: the main finding, one surprising detail, and the source with a Markdown link. Guess what a typo-filled request means (for example "openstas aboioy openx laucnes rockets" is stats about SpaceX rocket launches) and say what you assumed.';
