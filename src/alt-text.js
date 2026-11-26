// The chat.alt-text plugin on the server: describe an attached photo for screen readers.
// It lives beside runTask (src/loop.js) and not inside it: loop.js is the most-fixed file in the repo, so the plugin wraps it.
const ALT_TEXT_QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const MAX_VISION_CHARS = 1_400_000; // the same cap runTask uses before it shows a picture to the model

// "describe this photo", "write alt text": true when the task asks for alt text.
export function asksAltText(task) {
  const t = String(task || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80 || ALT_TEXT_QUESTION.test(t)) return false;
  return /\bdescribe\s+(?:this|the|my|a)?\s*(?:photo|photograph|picture|pic|image)\b/.test(t) || /\balt[\s-]?text\b/.test(t);
}

const ALT_INSTRUCTION = ' Write concise, accurate alt text for this photo for screen readers in one or two plain sentences under 300 characters. Do not start with "Image of" or "Photo of". Reply with {"say": "<alt text>"} and do not start a computer.';
const NO_PHOTO_READ = 'Sorry, I could not read that photo right now. Try again in a minute, or choose a model that can see images in Settings.';

// Runs `run` (runTask) for everything except an alt-text request on an attached photo.
// For that: Workers AI writes the alt text; if it cannot, a vision model of the visitor's own gets the same instruction;
// with neither, a calm message. Never starts a computer. Returns what runTask returns.
export async function runWithAltText(run, opts) {
  const { task, plugin = '', files = [], vision = false, altText = null, emit = () => {} } = opts;
  const photos = files.filter((f) => f.image);
  if (!(plugin === 'chat.alt-text' || asksAltText(task)) || !photos.length) return run(opts);
  const t0 = Date.now();
  const done = (answer) => {
    emit({ type: 'answer', text: answer });
    return { answer, error: null, steps: [], links: [], provider: null, ms: Date.now() - t0, stats: { firstAction: 'alt-text', big: false, bad: 0, empty: 0, provider: 0, errors: 0, refused: 0, refusedWhy: null, salvaged: 0, guarded: 0, podMs: 0, system: false, shared: false, copy: false, failed: null } };
  };
  const alt = altText ? await Promise.resolve(altText(files)).catch(() => '') : '';
  if (alt) {
    emit({ type: 'note', target: 'Writing alt text for the photo' });
    return done(alt);
  }
  if (vision && photos.some((f) => f.content.length <= MAX_VISION_CHARS)) return run({ ...opts, task: task + ALT_INSTRUCTION });
  return done(NO_PHOTO_READ);
}
