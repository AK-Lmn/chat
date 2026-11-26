import {shownText} from './events.js';

// Plugin voice.read-aloud: reads the latest chat result aloud when asked ("read it to me", etc.).
// Uses the same /voice (Ava Multilingual) endpoint as Voice talk, with browser speechSynthesis as fallback.
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export function isReadAloudCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80) return false;
  return /\bread (?:it|this|that|the (?:last )?(?:result|answer|reply|response|message)) to me\b/.test(t)
    || /\bread (?:(?:it|this|that|the (?:last )?(?:result|answer|reply|response|message)) )?(?:aloud|out loud)\b/.test(t)
    || /\bread (?:it|this|that|the (?:last )?(?:result|answer|reply|response|message)) back(?: to me)?\b/.test(t)
    || /\bread the (?:last )?(?:result|answer|reply|response)\b/.test(t);
}

// Turns the latest turn's result (Markdown, code, links) into plain spoken words.
export function spokenText(text) {
  return String(text || '')
    .replace(/\r?\n*```[\s\S]*?```\r?\n*/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/[*_#>|`~]/g, ' ')
    .replace(/\r?\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/([.!?…]) *\. +/g, '$1 ')
    .trim()
    .slice(0, 3000);
}

export function resultText(turns) {
  const list = Array.isArray(turns) ? turns : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i]?.t;
    if (!t) continue;
    const raw = shownText(t)
      || (t.outs || []).map((o) => o.text).filter(Boolean).join('\n')
      || t.error?.message
      || (t.link ? 'Your link is ready.' : t.video ? 'Your video is ready.' : '');
    const words = spokenText(raw);
    if (words) return words;
  }
  return '';
}

export const speechChunks = (text) => (String(text || '').match(/[^.!?…\n]+[.!?…]*\s*/g) || [String(text || '')])
  .reduce((a, s) => {
    const l = a[a.length - 1];
    if (l && l.length + s.length < 180) a[a.length - 1] = l + s;
    else a.push(s);
    return a;
  }, [])
  .map((s) => s.trim())
  .filter(Boolean);

export const speechLang = (text) => (/[іїєґ]/i.test(text) ? 'uk' : /[ыэъё]/i.test(text) ? 'ru' : '');

export function createReader({
  AudioCtor = typeof Audio !== 'undefined' ? Audio : null,
  tts = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null,
  Utterance = typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null,
} = {}) {
  let aud = null;
  let gen = 0;
  let speaking = false;

  const ensureAudio = () => {
    if (!aud && AudioCtor) aud = new AudioCtor();
    return aud;
  };

  const unlock = () => {
    const a = ensureAudio();
    if (!a) return;
    try { a.src = SILENT; const p = a.play(); if (p) p.catch(() => {}); } catch (e) { /* ignored */ }
  };

  const stop = () => {
    gen++;
    speaking = false;
    if (aud) { try { aud.pause(); aud.onended = aud.onerror = null; } catch (e) { /* ignored */ } }
    if (tts) { try { tts.cancel(); } catch (e) { /* ignored */ } }
  };

  const speak = (text, {onEnd} = {}) => {
    const parts = speechChunks(text);
    if (!parts.length) return false;
    stop();
    const myGen = gen;
    const lang = speechLang(text);
    const a = ensureAudio();
    speaking = true;
    let i = 0;

    const finish = () => {
      if (myGen !== gen) return;
      speaking = false;
      onEnd?.();
    };

    const fallback = (s) => {
      if (myGen !== gen) return;
      if (!tts || !Utterance) { next(); return; }
      try {
        const u = new Utterance(s);
        if (lang) u.lang = lang;
        u.onend = u.onerror = next;
        tts.speak(u);
      } catch (e) { next(); }
    };

    function next() {
      if (myGen !== gen || i >= parts.length) { finish(); return; }
      const s = parts[i++];
      if (!a) { fallback(s); return; }
      let fell = false;
      const fail = () => { if (fell) return; fell = true; a.onended = a.onerror = null; fallback(s); };
      a.onended = next;
      a.onerror = fail;
      a.src = '/voice?l=' + encodeURIComponent(lang) + '&t=' + encodeURIComponent(s.slice(0, 1200));
      try {
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(fail);
      } catch (e) { fail(); }
    }

    next();
    return true;
  };

  return {unlock, stop, speak, isSpeaking: () => speaking};
}
