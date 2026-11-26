// What you say or type to the Studio plugin. Returns {cmd, ...} for a request Studio can do, or null for anything else (that goes to the chat as usual).
// Commands: remove the background, crop (to a shape, when one is named), and make a meme or caption.
const WORDS = {one: 1, two: 2, three: 3, four: 4, nine: 9, sixteen: 16};
const SHAPES = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2'];
const MEME_SKIP = /(?:^(?:what|why|how|who|when|where|explain)\b)|\b(?:website|web ?site|site|app|application|page|generator|bot|video|subtitles?)\b/;
const unquote = (s) => s.replace(/^["']|["']$/g, '').trim() || null;

// "16:9", "16x9", "16 by 9", "sixteen to nine", or "square".
function shapeOf(t) {
  if (/\bsquare\b/.test(t)) return '1:1';
  const n = t.replace(/\b(one|two|three|four|nine|sixteen)\b/g, (w) => WORDS[w]);
  const m = n.match(/\b(\d+) ?(?:[:x]|by|to) ?(\d+)\b/);
  const id = m && m[1] + ':' + m[2];
  return SHAPES.includes(id) ? id : null;
}

function memeOf(raw, t) {
  if (MEME_SKIP.test(t)) return null;
  const isMeme = /\b(?:make|create)(?: me)?(?: (?:this|it))?(?: into)?(?: a| an| this| it)? (?:meme|meme caption)\b/.test(t)
    || /\bturn (?:this|it) into a meme\b/.test(t)
    || /\bmeme (?:this|it)\b/.test(t)
    || /\badd (?:a )?(?:meme )?caption\b/.test(t)
    || /\bmake (?:a )?(?:meme )?caption\b/.test(t)
    || /\bcaption (?:this|the|my|it)\b/.test(t);
  if (!isMeme) return null;
  const s = String(raw || '').trim().replace(/[.!?]+$/, '');
  const tb = s.match(/\btop(?:\s+text)?\s*[:=-]?\s*(.+?)\s+(?:and\s+)?bottom(?:\s+text)?\s*[:=-]?\s*(.+)$/i);
  if (tb) return {cmd: 'meme', top: unquote(tb[1]), bottom: unquote(tb[2])};
  const topOnly = s.match(/\btop(?:\s+text)?\s*[:=-]?\s*(.+)$/i);
  if (topOnly) return {cmd: 'meme', top: unquote(topOnly[1]), bottom: null};
  const botOnly = s.match(/\bbottom(?:\s+text)?\s*[:=-]?\s*(.+)$/i);
  if (botOnly) return {cmd: 'meme', top: null, bottom: unquote(botOnly[1])};
  const cap = s.match(/\b(?:saying|with(?:\s+the)?\s+(?:text|caption))\s*[:=-]?\s*(.+)$/i) || s.match(/:\s*(.+)$/);
  if (cap) return {cmd: 'meme', top: unquote(cap[1]), bottom: null};
  return {cmd: 'meme', top: null, bottom: null};
}

export function parseStudioCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80) return null;
  if (/\b(remove|delete|erase|clear|cut out|get rid of|take off|take out|drop)\b.*\b(background|backdrop)\b/.test(t) || /\bcut out (the |this )?(subject|person|object)\b/.test(t) || /\b(background|backdrop) (remover|removal)\b/.test(t)) return {cmd: 'removeBackground'};
  if (/\bcrop\b/.test(t)) {
    return {cmd: 'crop', ratio: shapeOf(t)};
  }
  return memeOf(text, t);
}
