// Plugin voice.commands: wake phrase "hey flisk" (spoken or typed) opens Voice talk or runs a chat command.
// Returns {cmd, ...} when a voice command is recognized, or null to leave ordinary chat input untouched.
const WAKE = /^(?:hey|hi|hello|ok|okay)[\s,]*flisk\b(.*)$/i;
const LEADING = /^[\s,:;!?.-]+/;
const POLITELY = /^(?:(?:please|can you|could you|would you|will you)\b[\s,:;!?.-]*)+/i;

// Drop trailing . ! ? without a regex that backtracks.
function stripTrailing(text) {
  let end = text.length;
  while (end > 0 && '.!?'.includes(text[end - 1])) end--;
  return text.slice(0, end);
}

const COMMANDS = [
  ['talk', /^(?:(?:start|open|begin)\s+)?(?:voice\s+talk|oracle|flisk\s+oracle|talk(?:\s+to\s+me)?|listen(?:\s+to\s+me)?)$/],
  ['dictate', /^(?:(?:start|open)\s+)?(?:dictate|dictation|voice\s+typing)$/],
  ['newChat', /^(?:(?:start|open|begin)\s+(?:a\s+)?)?(?:new\s+chat|fresh\s+chat|clear\s+chat)$/],
  ['plugins', /^(?:(?:open|show|list)\s+(?:the\s+)?)?plugins?$/],
  ['studio', /^(?:(?:open|show)\s+(?:the\s+)?)?(?:studio|photo\s+editor)$/],
  ['closeStudio', /^(?:close|hide)\s+(?:the\s+)?(?:studio|photo\s+editor)$/],
  ['settings', /^(?:(?:open|show)\s+(?:the\s+)?)?settings$/],
  ['model', /^(?:(?:choose|pick|change|switch|open|show)\s+(?:the\s+|an?\s+)?)?(?:ai\s+)?models?$/],
  ['computers', /^(?:(?:choose|pick|connect|open|show)\s+(?:a\s+|my\s+|the\s+)?)?computers?$/],
  ['attach', /^attach(?:\s+(?:a\s+)?files?)?$/],
  ['readAloud', /^read\s+(?:(?:it|this|that|the\s+(?:last\s+)?(?:result|answer|reply|response|message))\s+)?(?:to\s+me|aloud|out\s+loud|back(?:\s+to\s+me)?)$|^read\s+the\s+(?:last\s+)?(?:result|answer|reply|response)$/],
  ['explain', /^(?:(?:toggle|turn\s+on|turn\s+off|enter|leave|exit)\s+)?explain(?:\s+mode)?$/],
  ['stop', /^(?:stop(?:\s+(?:reading|speaking|talking|listening|that|it))?|cancel|be\s+quiet|shut\s+up)$/],
];

const SCHEMES = [
  ['earth', /^(?:(?:switch\s+to|use|set)\s+(?:the\s+)?)?earth(?:\s+(?:look|mode|theme))?$/],
  ['dark', /^(?:(?:switch\s+to|use|set)\s+(?:the\s+)?)?dark(?:\s+(?:look|mode|theme))?$/],
  ['light', /^(?:(?:switch\s+to|use|set)\s+(?:the\s+)?)?light(?:\s+(?:look|mode|theme))?$/],
  ['system', /^(?:(?:switch\s+to|use|set)\s+(?:the\s+)?)?system(?:\s+(?:look|mode|theme))?$/],
];

export function parseVoiceCommand(text) {
  const norm = String(text || '').replace(/\s+/g, ' ').trim();
  if (!norm || norm.length > 200) return null;
  const m = norm.match(WAKE);
  if (!m) return null;

  const rest = m[1].replace(LEADING, '').trim();
  if (!rest) return {cmd: 'talk'};

  const cleaned = stripTrailing(rest.replace(POLITELY, '')).trim();
  if (!cleaned) return {cmd: 'talk'};

  const low = cleaned.toLowerCase();
  for (const [cmd, re] of COMMANDS) {
    if (re.test(low)) return {cmd};
  }
  for (const [scheme, re] of SCHEMES) {
    if (re.test(low)) return {cmd: 'scheme', scheme};
  }

  return {cmd: 'task', task: rest};
}
