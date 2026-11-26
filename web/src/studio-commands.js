import {parseSignPdfCommand} from './sign-pdf.js';

// What you say or type to the Studio plugin. Returns {cmd, ...} for a request Studio can do, or null for anything else (that goes to the chat as usual).
// Commands: remove the background, crop (to a shape, when one is named), social image sizes, and sign a PDF.
const WORDS = {one: 1, two: 2, three: 3, four: 4, nine: 9, sixteen: 16};
const SHAPES = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2'];
const NON_PHOTO = /(?:^(?:what|why|how|when|where|who)\b)|\b(?:write|caption|ideas?|tips?|guide|tutorial|explain|describe|build|website|clone|script)\b/;

export const SOCIAL_SIZES = [
  {preset: 'instagram-story', match: /\b(?:instagram|ig|insta)\s+stor(?:y|ies)\b/, ratio: '9:16', width: 1080, height: 1920},
  {preset: 'instagram-reel', match: /\b(?:instagram|ig|insta)\s+reels?\b|\breels?\b/, ratio: '9:16', width: 1080, height: 1920},
  {preset: 'facebook-story', match: /\b(?:facebook|fb)\s+stor(?:y|ies)\b/, ratio: '9:16', width: 1080, height: 1920},
  {preset: 'tiktok', match: /\btik\s*tok\b/, ratio: '9:16', width: 1080, height: 1920},
  {preset: 'youtube-short', match: /\b(?:youtube|yt)\s+shorts?\b/, ratio: '9:16', width: 1080, height: 1920},
  {preset: 'instagram-portrait', match: /\b(?:instagram|ig|insta)\s+portrait\b/, ratio: '3:4', width: 1080, height: 1440},
  {preset: 'pinterest-pin', match: /\bpinterest(?:\s+pin)?\b/, ratio: '3:4', width: 1000, height: 1333},
  {preset: 'instagram-post', match: /\b(?:instagram|ig|insta)\s+(?:post|square|feed)\b/, ratio: '1:1', width: 1080, height: 1080},
  {preset: 'profile-picture', match: /\b(?:profile\s+(?:pic|picture|photo|image)|avatar)\b/, ratio: '1:1', width: 1080, height: 1080},
  {preset: 'youtube-thumbnail', match: /\b(?:youtube|yt)\s+thumbnail\b/, ratio: '16:9', width: 1280, height: 720},
  {preset: 'facebook-cover', match: /\b(?:facebook|fb)\s+(?:cover|banner)\b/, ratio: '16:9', width: 1640, height: 924},
  {preset: 'linkedin-banner', match: /\blinkedin\s+(?:banner|cover|header)\b/, ratio: '16:9', width: 1584, height: 891},
  {preset: 'x-post', match: /\b(?:twitter|x)\s+(?:post|image|card|header|banner)\b/, ratio: '16:9', width: 1600, height: 900},
  {preset: 'og-image', match: /\b(?:og|open\s*graph|link\s+preview)\s*(?:image|card|banner)?\b/, ratio: '16:9', width: 1200, height: 675},
];

// "16:9", "16x9", "16 by 9", "sixteen to nine", or "square".
function shapeOf(t) {
  if (/\bsquare\b/.test(t)) return '1:1';
  const n = t.replace(/\b(one|two|three|four|nine|sixteen)\b/g, (w) => WORDS[w]);
  const m = n.match(/\b(\d+) ?(?:[:x]|by|to) ?(\d+)\b/);
  const id = m && m[1] + ':' + m[2];
  return SHAPES.includes(id) ? id : null;
}

function socialSizeOf(t) {
  if (NON_PHOTO.test(t)) return null;
  for (const s of SOCIAL_SIZES) {
    if (s.match.test(t)) return {cmd: 'crop', ratio: s.ratio, preset: s.preset, width: s.width, height: s.height};
  }
  if (/\bsocial\s+(?:media\s+)?(?:image\s+)?sizes?\b/.test(t)) return {cmd: 'crop', ratio: null};
  return null;
}

export function parseStudioCommand(text) {
  const sign = parseSignPdfCommand(text);
  if (sign) return sign;
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80) return null;
  if (/\b(remove|delete|erase|clear|cut out|get rid of|take off|take out|drop)\b.*\b(background|backdrop)\b/.test(t) || /\bcut out (the |this )?(subject|person|object)\b/.test(t) || /\b(background|backdrop) (remover|removal)\b/.test(t)) return {cmd: 'removeBackground'};
  const social = socialSizeOf(t);
  if (social) return social;
  if (/\bcrop\b/.test(t)) {
    return {cmd: 'crop', ratio: shapeOf(t)};
  }
  return null;
}
