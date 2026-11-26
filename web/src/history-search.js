// Plugin chat.history-search: searches past chats stored in this browser by spoken or typed phrase.
const QUESTION = /^(?:how|why|when|where|explain)\b|^what\s+(?:is|are|was|were)\b/i;
const LEAD = /^(?:(?:please|can you|could you|hey flisk|flisk)[,\s]+)*/i;

function cleanQuery(raw) {
  return String(raw || '')
    .trim()
    .replace(/^[:\-\s]+/, '')
    .replace(/[.!?]+$/, '')
    .replace(/^["'](.*)["']$/, '$1')
    .trim();
}

export function parseHistorySearchCommand(text) {
  const norm = String(text || '').replace(/\s+/g, ' ').trim();
  if (!norm || norm.length > 100 || QUESTION.test(norm)) return null;
  const s = norm.replace(LEAD, '').trim();
  if (!s) return null;

  let m = s.match(/^(?:find|show|get|pull up|look up)\s+(?:what\s+(?:i|we)\s+(?:asked|said|talked|chatted|discussed)|my\s+(?:past\s+|previous\s+|old\s+)?(?:questions?|messages?|chats?))(?:\s+(?:about|on|for|regarding|with|:)\s*(.*))?$/i);
  if (m) return {cmd: 'historySearch', query: cleanQuery(m[1])};

  m = s.match(/^what\s+did\s+(?:i|we)\s+(?:ask|say|talk\s+about|discuss)(?:\s+you)?(?:\s+(?:about|on|for|regarding)\s*(.*))?$/i);
  if (m) return {cmd: 'historySearch', query: cleanQuery(m[1])};

  m = s.match(/^(?:search|find|look\s+up)\s+(?:in\s+)?(?:my\s+|our\s+)?(?:chat\s+history|chats?\s+history|past\s+chats?|previous\s+chats?|old\s+chats?|conversations?|history)(?:\s*(?:for|about|with|:)\s*(.*))?$/i);
  if (m) return {cmd: 'historySearch', query: cleanQuery(m[1])};

  m = s.match(/^search\s+(?:my\s+|past\s+|previous\s+|old\s+)?chats?(?:\s+(?:for|about|with|:)\s*(.*))?$/i);
  if (m) return {cmd: 'historySearch', query: cleanQuery(m[1])};

  return null;
}

function snippetFor(text, terms, phrase) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const low = raw.toLowerCase();
  let idx = low.indexOf(phrase);
  if (idx < 0) {
    for (const term of terms) {
      idx = low.indexOf(term);
      if (idx >= 0) break;
    }
  }
  if (idx < 0 || raw.length <= 120) return raw.slice(0, 120);
  const start = Math.max(0, idx - 36);
  const end = Math.min(raw.length, start + 120);
  return (start > 0 ? '…' : '') + raw.slice(start, end).trim() + (end < raw.length ? '…' : '');
}

export function searchChatHistory(chats, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !Array.isArray(chats)) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits = [];

  for (const c of chats) {
    if (!c || typeof c !== 'object') continue;
    const title = String(c.title || '');
    const memo = String(c.memo || '');
    const msgs = Array.isArray(c.msgs) ? c.msgs : [];
    let bestScore = 0;
    let bestRole = '';
    let bestText = '';

    const consider = (score, role, text) => {
      if (score > bestScore) {
        bestScore = score;
        bestRole = role;
        bestText = text;
      }
    };

    for (const m of msgs) {
      const content = String((m && m.content) || '');
      if (!content) continue;
      const low = content.toLowerCase();
      const user = m.role === 'user';
      if (low.includes(q)) consider(user ? 100 : 60, user ? 'user' : 'assistant', content);
      else if (terms.length > 1 && terms.every((t) => low.includes(t))) consider(user ? 45 : 25, user ? 'user' : 'assistant', content);
    }

    const tLow = title.toLowerCase();
    if (tLow.includes(q)) consider(80, 'title', title);
    else if (terms.length > 1 && terms.every((t) => tLow.includes(t))) consider(30, 'title', title);

    const mLow = memo.toLowerCase();
    if (mLow.includes(q)) consider(50, 'memo', memo);
    else if (terms.length > 1 && terms.every((t) => mLow.includes(t))) consider(20, 'memo', memo);

    if (!bestScore && terms.length > 1) {
      const joined = [title, memo, ...msgs.map((m) => (m && m.content) || '')].join('\n').toLowerCase();
      if (terms.every((t) => joined.includes(t))) {
        const firstMatch = msgs.find((m) => m && m.content && terms.some((t) => m.content.toLowerCase().includes(t)));
        consider(15, firstMatch?.role === 'user' ? 'user' : 'assistant', (firstMatch && firstMatch.content) || title || memo);
      }
    }

    if (bestScore > 0) {
      hits.push({
        id: c.id,
        title: title || 'Untitled',
        at: Number(c.at) || 0,
        role: bestRole,
        snippet: snippetFor(bestText, terms, q),
        score: bestScore,
        chat: c,
      });
    }
  }

  return hits.sort((a, b) => (b.score - a.score) || (b.at - a.at));
}

export function matchesChat(chat, query) {
  const q = String(query || '').trim();
  if (!q) return true;
  return searchChatHistory([chat], q).length > 0;
}

export function formatHistorySummary(query, results) {
  if (!results || !results.length) {
    return `No past chats in this browser matched "${query}".`;
  }
  const count = results.length === 1 ? '1 matching chat' : `${results.length} matching chats`;
  const lines = results.slice(0, 6).map((r) => {
    const who = r.role === 'user' ? 'You asked' : r.role === 'assistant' ? 'Reply' : r.role === 'memo' ? 'Summary' : 'Title';
    return `- **${r.title}** — ${who}: ${r.snippet}`;
  });
  return `Found ${count} for **${query}**:\n\n${lines.join('\n')}`;
}
