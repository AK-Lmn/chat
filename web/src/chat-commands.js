// What you say or type to a Voice and chat plugin. Returns {cmd, ...} for a request chat handles itself, or null for anything else.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;

export function parseChatCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80 || QUESTION.test(t)) return null;
  if (/\bdescribe\s+(?:this|the|my|a)?\s*(?:photo|photograph|picture|pic|image)\b/.test(t) || /\balt[\s-]?text\b/.test(t)) {
    return {cmd: 'altText'};
  }
  return null;
}
