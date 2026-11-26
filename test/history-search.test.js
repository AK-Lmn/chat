import { describe, expect, test } from 'bun:test';
import { parseHistorySearchCommand, searchChatHistory, matchesChat, formatHistorySummary } from '../web/src/history-search.js';
import catalog from '../plugins/catalog.json';

describe('chat history search voice and typed commands', () => {
  test.each([
    ['find what I asked about pdfs', 'pdfs'],
    ['Find what I asked about PDFs.', 'PDFs'],
    ['please find what I asked about docker compose', 'docker compose'],
    ['can you find what I asked about pricing?', 'pricing'],
    ['show what we talked about React hooks', 'React hooks'],
    ['what did I ask about pdfs?', 'pdfs'],
    ['what did I ask you about auth?', 'auth'],
    ['search chat history for invoices', 'invoices'],
    ['search my chat history about deployment', 'deployment'],
    ['find in chat history: tailwind', 'tailwind'],
    ['search past chats for sqlite', 'sqlite'],
    ['search my chats for coffee shop', 'coffee shop'],
    ['search my chat history', ''],
  ])('"%s" parses to query "%s"', (input, query) => {
    expect(parseHistorySearchCommand(input)).toEqual({ cmd: 'historySearch', query });
  });

  test.each([
    'what is the weather',
    'build me a shop',
    'search the web for pdfs',
    'find a good restaurant in Tokyo',
    'how do I search chat history in React?',
    'explain chat history search',
    'write a very long story about what I asked in a chat once upon a time when everything went on and on and on',
    '',
    null,
  ])('%p is left to the chat', (input) => {
    expect(parseHistorySearchCommand(input)).toBeNull();
  });

  test('catalog lists chat.history-search as ready with phrases the parser understands', () => {
    const p = catalog.plugins.find((x) => x.id === 'chat.history-search');
    expect(p).toBeDefined();
    expect(p.status).toBe('ready');
    expect(p.group).toBe('Voice and chat');
    for (const v of p.voice) expect(parseHistorySearchCommand(v)?.cmd).toBe('historySearch');
  });
});

describe('chat history matching and ranking', () => {
  const chats = [
    {
      id: 'c1',
      at: 1000,
      title: 'Coffee shop website',
      msgs: [
        { role: 'user', content: 'Build a one-page website for my coffee shop' },
        { role: 'assistant', content: 'Here is your site.' },
        { role: 'user', content: 'Can you also help me merge pdfs for the menu?' },
      ],
      memo: '',
    },
    {
      id: 'c2',
      at: 2000,
      title: 'Merge PDFs tool',
      msgs: [
        { role: 'user', content: 'How do I shrink this document?' },
        { role: 'assistant', content: 'Use Studio to shrink or merge pdfs locally.' },
      ],
      memo: '',
    },
    {
      id: 'c3',
      at: 3000,
      title: 'Bakery landing page',
      msgs: [
        { role: 'user', content: 'Make a bakery menu page' },
        { role: 'assistant', content: 'Published.' },
      ],
      memo: 'Earlier user asked about exporting pdfs for print.',
    },
  ];

  test('finds matches across user messages, titles, assistant replies, and memo, prioritizing user questions', () => {
    const hits = searchChatHistory(chats, 'pdfs');
    expect(hits.map((h) => h.id)).toEqual(['c1', 'c2', 'c3']);
    expect(hits[0].role).toBe('user');
    expect(hits[0].snippet).toContain('merge pdfs');
    expect(hits[1].role).toBe('title');
    expect(hits[2].role).toBe('memo');
  });

  test('matches multi-word queries and returns false for non-matching chats', () => {
    expect(searchChatHistory(chats, 'bakery menu').map((h) => h.id)).toEqual(['c3']);
    expect(searchChatHistory(chats, 'kubernetes')).toEqual([]);
    expect(searchChatHistory(chats, '')).toEqual([]);
    expect(matchesChat(chats[0], 'merge pdfs')).toBe(true);
    expect(matchesChat(chats[0], 'kubernetes')).toBe(false);
    expect(matchesChat(chats[0], '')).toBe(true);
  });

  test('formats summaries for hits and empty results', () => {
    const hits = searchChatHistory(chats, 'pdfs');
    const summary = formatHistorySummary('pdfs', hits);
    expect(summary).toContain('Found 3 matching chats for **pdfs**');
    expect(summary).toContain('**Coffee shop website** — You asked:');
    expect(formatHistorySummary('k8s', [])).toBe('No past chats in this browser matched "k8s".');
  });
});

describe('App.jsx and Plugins.jsx wiring', () => {
  test('wires chat.history-search in submit, dictate, sidebar filter, and plugin picker', async () => {
    const app = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
    expect(app).toContain("from './history-search.js'");
    expect(app).toContain('toHistorySearch(task)');
    expect(app).toContain('toHistorySearch(text)');
    expect(app).toContain('matchesChat(c, filter)');
    expect(app).toContain('onHistorySearch={');
    const dlg = await Bun.file(new URL('../web/src/Plugins.jsx', import.meta.url)).text();
    expect(dlg).toContain("p.id === 'chat.history-search'");
  });
});
