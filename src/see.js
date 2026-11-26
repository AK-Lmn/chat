import { extractPdfText, isPdfFile } from './ocr.js';

// Reading a picture: the posts @askflisk answers often point at one ("is this ranking right?", a screenshot, a chart),
// and the studio.ocr plugin reads text from attached photos and PDFs.
// A vision model on Workers AI writes down what is in it (text, names, tiers), and the answer is made from that.
export const VISION_MODELS = ['@cf/meta/llama-3.2-11b-vision-instruct', '@cf/llava-hf/llava-1.5-7b-hf'];
export const MAX_IMAGE_BYTES = 3_000_000;
export const MAX_IMAGES = 2;
export const OCR_PROMPT = 'Read and transcribe all text visible in this image accurately, preserving line breaks and reading order. Output only the extracted text, with no extra commentary.';
// Only pictures that X and Bluesky themselves host: the bot sends links, chat fetches them, so no link to anywhere else is followed.
export const IMAGE_URL = /^https:\/\/pbs\.twimg\.com\/(?:media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\/[\w./-]+(?:\?[\w=&.%-]*)?$/;
// Bluesky: the photos of a post (cdn.bsky.app) and the preview frame of its video (video.bsky.app), both Bluesky's own hosts.
export const BSKY_IMAGE_URL = /^https:\/\/(?:cdn\.bsky\.app\/img\/feed_(?:thumbnail|fullsize)\/plain\/[\w:.%-]+\/[\w.-]+@(?:jpeg|png|webp)|video\.bsky\.app\/watch\/[\w:.%-]+\/[\w.-]+\/thumbnail\.jpg)$/;
export const imageUrls = (list) => (Array.isArray(list) ? list.filter((u) => typeof u === 'string' && (IMAGE_URL.test(u) || BSKY_IMAGE_URL.test(u))).slice(0, MAX_IMAGES) : []);

async function seeBytes(env, buf, prompt, maxTokens = 600) {
  if (!env?.AI || !buf.length || buf.length > MAX_IMAGE_BYTES) return '';
  for (const model of VISION_MODELS) {
    const r = await env.AI.run(model, { image: [...buf], prompt, max_tokens: maxTokens }).catch(() => null);
    const text = String(r?.description || r?.response || '').trim();
    if (text) return text;
  }
  return '';
}

// What is in these pictures, for someone who asked `question`: plain text, '' when none could be read.
export async function seeImages(env, urls, question, fetchImpl = fetch) {
  if (!env?.AI || !urls.length) return '';
  const parts = [];
  const prompt = `Someone asks about this picture: "${String(question).slice(0, 200)}". Write down what is in it, facts only: every readable text, name and label. For a ranking, tier list or chart write each tier or group with the items in it, in order. Under 1200 characters.`;
  for (const url of urls) {
    const res = await fetchImpl(url).catch(() => null);
    if (!res?.ok) continue;
    const buf = new Uint8Array(await res.arrayBuffer());
    const text = await seeBytes(env, buf, prompt, 600);
    if (text) parts.push(text);
  }
  return parts.join('\n---\n').slice(0, 1800);
}

// OCR for attached photos and PDFs (studio.ocr plugin): returns extracted plain text, '' when none could be read.
export async function ocrForFiles(env, files) {
  if (!Array.isArray(files) || !files.length) return '';
  const results = [];
  for (const f of files) {
    if (!f || typeof f.content !== 'string' || !f.content) continue;
    if (f.image) {
      let buf;
      try { buf = Uint8Array.from(atob(f.content), (c) => c.charCodeAt(0)); } catch { continue; }
      const text = await seeBytes(env, buf, OCR_PROMPT, 1200);
      if (text) results.push({ path: f.path || 'photo', text });
    } else if (isPdfFile(f)) {
      const text = await extractPdfText(f.content);
      if (text) results.push({ path: f.path || 'document.pdf', text });
    }
  }
  if (!results.length) return '';
  return results.length === 1 ? results[0].text : results.map((r) => `**${r.path}:**\n\n${r.text}`).join('\n\n');
}
