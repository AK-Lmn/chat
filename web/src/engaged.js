// Engaged visit: the Flisk Analytics beacon (flisk.sh/a.js) counts one pageview per load, and this page never navigates, so a
// visitor who asks for something would still read as a bounce. The first task of a visit sends one more pageview, "/ask", with the
// same visit id the beacon uses. No cookie, no text of the task. Fails quietly: a blocked beacon must never stop a task.
let engagedSent = false;
export function markEngaged(send = typeof navigator !== 'undefined' && navigator.sendBeacon ? (u, b) => navigator.sendBeacon(u, b) : null, host = typeof location !== 'undefined' ? location.hostname : '') {
  if (engagedSent || !send || host !== 'chat.flisk.si') return false;
  engagedSent = true;
  let s = '';
  try { s = sessionStorage.getItem('_fa') || ''; } catch { /* no storage */ }
  try { send('https://analytics.flisk.si/e', JSON.stringify({d: host, p: '/ask', r: '', s, u: '', t: ''})); return true; } catch { return false; }
}
