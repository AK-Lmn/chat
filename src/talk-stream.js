// Voice talk speaks while the model is still writing: the reply is cut into sentences as it arrives, and each finished
// sentence goes to the page at once (one NDJSON line), so the first one is already being read aloud when the rest is
// still being written.

const MIN_CHARS = 20; // a shorter piece ("Hi.", "Dr.") is joined to the next sentence, so the voice does not chop
const MAX_CHARS = 180; // a run with no full stop is cut at a space after this many characters
const STOP = /([.!?…]+["'”’)\]]*)\s+|([。！？]+["”’）」]*)/g;

// push(text) returns the sentences that are now complete; flush() returns what is left. With hold the reply is kept back
// (the page asked to build something: the whole answer is read before anything is said), and a reply that starts like
// JSON ({"say": ..., "build": ...}) is never cut, because the words are inside it.
export function sentenceSplitter({ hold = false } = {}) {
  let buf = '', carry = '', mode = '';
  const take = () => {
    const out = [];
    let last = 0, m;
    STOP.lastIndex = 0;
    while ((m = STOP.exec(buf))) {
      const piece = (carry + ' ' + buf.slice(last, m.index + m[0].length)).trim();
      last = m.index + m[0].length;
      if (piece.length >= MIN_CHARS) { out.push(piece); carry = ''; } else carry = piece;
    }
    buf = buf.slice(last);
    if ((carry + buf).length > MAX_CHARS) {
      const all = (carry + ' ' + buf).trim();
      const cut = all.lastIndexOf(' ', MAX_CHARS);
      if (cut > MIN_CHARS) { out.push(all.slice(0, cut).trim()); carry = ''; buf = all.slice(cut + 1); }
    }
    return out;
  };
  return {
    push(delta) {
      buf += String(delta ?? '');
      if (!mode) {
        const head = buf.trimStart();
        if (!head) return [];
        mode = hold || head.startsWith('{') || head.startsWith('```') ? 'held' : 'text';
      }
      return mode === 'text' ? take() : [];
    },
    // True once any text was seen that this splitter is cutting up (a held or JSON reply says false).
    get live() { return mode === 'text'; },
    flush() {
      if (mode !== 'text') return [];
      const rest = (carry + ' ' + buf).trim();
      carry = buf = '';
      return rest ? [rest] : [];
    },
  };
}

// A whole reply cut the same way (a model that cannot stream sends it all at once).
export function splitReply(text) {
  const s = sentenceSplitter();
  const first = s.push(String(text ?? ''));
  return [...first, ...s.flush()];
}
