// One language decision per chat, shared by the page and the Worker.
// Ukrainian and Russian share most letters and many short words, so a clip or a line like "Все добре, дякую" cannot be
// told apart by letters alone. Rule: marker letters and words decide first; when a text has none (an ambiguous Cyrillic
// line), the chat's sticky language, then the page language, decides, never a fresh guess.
export const UK_WORDS = ['дякую', 'будь', 'ласка', 'як', 'що', 'це', 'ти', 'тобі', 'мене', 'мені', 'добре', 'привіт', 'справи', 'чому', 'коли', 'де', 'ні', 'можеш', 'був', 'була', 'вони', 'потім', 'тому', 'який', 'яка', 'які', 'будь-ласка', 'українською', 'розкажи', 'допоможи', 'зроби', 'створи'];
export const RU_WORDS = ['что', 'как', 'это', 'ты', 'тебя', 'меня', 'мне', 'привет', 'хорошо', 'пожалуйста', 'спасибо', 'кто', 'почему', 'когда', 'где', 'есть', 'нет', 'можешь', 'расскажи', 'помоги', 'сделай', 'создай', 'дела', 'добрые', 'добрый', 'очень', 'сейчас'];
const CYR = /[а-яіїєґёыэъ]/i;
const OTHER = [[/[가-힣]/, 'ko'], [/[ぁ-ヿ]/, 'ja'], [/[一-鿿]/, 'zh'], [/[α-ω]/i, 'el'], [/[א-ת]/, 'he'], [/[ء-ي]/, 'ar'], [/[ऀ-ॿ]/, 'hi'], [/[ก-๛]/, 'th']];

// 'uk' | 'ru' | another code | '' when the text itself does not say (ambiguous Cyrillic, or nothing readable).
export function detectLang(text) {
  const t = String(text || '');
  if (/[іїєґ]/i.test(t)) return 'uk';
  if (/[ыэъё]/i.test(t)) return 'ru';
  if (CYR.test(t)) {
    const words = t.toLowerCase().match(/[а-яіїєґё'’-]+/g) || [];
    const uk = words.filter((w) => UK_WORDS.includes(w)).length;
    const ru = words.filter((w) => RU_WORDS.includes(w)).length;
    return uk > ru ? 'uk' : ru > uk ? 'ru' : '';
  }
  for (const [re, code] of OTHER) if (re.test(t)) return code;
  return '';
}

// The chat's language for this turn. text = what was written or heard; heard = Whisper's guess (voice only);
// sticky = the language this chat has been in; ui = the page language ('uk' or 'en').
// Ambiguous Cyrillic (Whisper says ru or uk, the words say nothing) keeps the sticky language, else the page language.
const LATIN_LANGS = new Set(['en', 'es', 'de', 'fr', 'it', 'pt', 'pl', 'nl', 'tr', 'cs', 'sk', 'ro', 'hu', 'sv', 'da', 'no', 'fi', 'vi', 'id', 'ms', 'lt', 'lv', 'et', 'sl', 'hr']);
const CYRILLIC_PAIR = new Set(['uk', 'ru', 'be']);
export function resolveLang({ text = '', heard = '', sticky = '', ui = '' } = {}) {
  const t = detectLang(text);
  const h = String(heard || '').slice(0, 2).toLowerCase();
  const s = String(sticky || '').slice(0, 2).toLowerCase();
  const u = String(ui || '').slice(0, 2).toLowerCase();
  if (t === 'uk' || t === 'ru') return t;
  if (t) return t;
  if (CYRILLIC_PAIR.has(h) || (!h && CYR.test(String(text)))) {
    if (CYRILLIC_PAIR.has(s)) return s;
    if (u === 'uk') return 'uk';
    return h === 'be' ? 'ru' : h || 'ru';
  }
  // Plain Latin text names no language itself. It must not inherit a non-Latin sticky language (an English question in a chat that
  // was Ukrainian got a Ukrainian answer): keep a Latin sticky (Spanish, German...), otherwise it is English.
  if (!h && /[a-z]{2,}/i.test(String(text))) return LATIN_LANGS.has(s) ? s : 'en';
  return h || s || '';
}

export const LANG_NAMES = { en: 'English', uk: 'Ukrainian', ru: 'Russian', es: 'Spanish', de: 'German', fr: 'French', it: 'Italian', pt: 'Portuguese', pl: 'Polish', nl: 'Dutch', tr: 'Turkish', cs: 'Czech', sk: 'Slovak', ro: 'Romanian', hu: 'Hungarian', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish', el: 'Greek', bg: 'Bulgarian', sr: 'Serbian', hr: 'Croatian', be: 'Belarusian', ka: 'Georgian', he: 'Hebrew', ar: 'Arabic', fa: 'Persian', hi: 'Hindi', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', ms: 'Malay', kk: 'Kazakh', lt: 'Lithuanian', lv: 'Latvian', et: 'Estonian', sl: 'Slovenian' };

// An explicit rule for the model: a small model copies the language of the history, so the turn's language is stated, not hoped for.
export const replyRule = (lang) => {
  const code = String(lang || '').slice(0, 2).toLowerCase();
  const n = LANG_NAMES[code];
  if (!n) return '';
  const apart = code === 'uk' ? ' Ukrainian is not Russian: use Ukrainian words and spelling.' : code === 'ru' ? ' Russian is not Ukrainian: use Russian words and spelling.' : '';
  return `Reply only in ${n}, the language of the person's latest message, even if earlier replies in this chat were in another language.${apart}`;
};

// What the model must know about the product it speaks for, so it does not invent a name or a memory it does not have.
export const PRODUCT_FACTS = `About you and this chat: the typed chat is "Flisk Chat"; the spoken mode (the wave button) is "Flisk Oracle". Both are the same assistant on chat.flisk.si. The person's past chats are saved in their own browser, never on our server; you see the most recent messages of this chat (about the last six) plus a short summary of the older ones, kept in the browser, so say so plainly if asked what you remember, and never claim to remember another chat or another device.`;
