// The cards a turn shows beside its text, ported from /classic (src/page.js): widgets (weather, chart, services, web, grow),
// a Worker running live in this tab, and the offer to write the answer with a model in the browser when no AI was free.
import {Component, useEffect, useRef, useState} from 'react';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Button} from '@astryxdesign/core/Button';
import {BOOT, lsGet, lsSet} from './api.js';

const COL = ['#2F6FDE', '#F28C28', '#1FA463', '#C2389B', '#E5484D', '#7A5AF8'];
const fmtT = (v) => (v == null ? '–' : Math.round(v) + '°');
const dayName = (d, i) => (i === 0 ? 'Today' : new Date(d + 'T12:00:00').toLocaleDateString(undefined, {weekday: 'short'}));
const host = (u) => String(u).replace(/^https?:\/\//, '').replace(/\/$/, '');

export function SkyIcon({kind, size}) {
  const cloud = (y) => <path d={'M11 ' + (y + 10) + 'a6 6 0 0 1 1-12 8 8 0 0 1 15 2 5 5 0 0 1 0 10z'} fill="#B8C0CC" />;
  const drops = [14, 21, 28];
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      {kind === 'sun' && <circle cx={20} cy={20} r={8} fill="#F5A623" />}
      {kind === 'partly' && <><circle cx={15} cy={15} r={7} fill="#F5A623" />{cloud(14)}</>}
      {kind === 'rain' && <>{cloud(10)}{drops.map((x) => <line key={x} x1={x} y1={31} x2={x - 2} y2={36} stroke="#2F6FDE" strokeWidth={2.4} strokeLinecap="round" />)}</>}
      {kind === 'snow' && <>{cloud(10)}{drops.map((x) => <circle key={x} cx={x} cy={33} r={1.8} fill="#7FA6D8" />)}</>}
      {kind === 'storm' && <>{cloud(10)}<path d="M21 28l-4 6h4l-2 5 6-8h-4l2-3z" fill="#F5A623" /></>}
      {!['sun', 'partly', 'rain', 'snow', 'storm'].includes(kind) && cloud(14)}
    </svg>
  );
}

function Weather({d}) {
  const ts = d.hours.map((h) => h.temp).filter((v) => v != null);
  let line = null;
  if (ts.length > 1) {
    const lo = Math.min(...ts), hi = Math.max(...ts), W = 560, H = 70, pad = 14, n = d.hours.length;
    const xy = (h, i) => [pad + i * (W - 2 * pad) / (n - 1), H - pad - (h.temp - lo) / ((hi - lo) || 1) * (H - 2 * pad - 10)];
    line = (
      <svg viewBox={'0 0 ' + W + ' ' + (H + 18)} className="wline" role="img" aria-label="Temperature over the next 24 hours">
        <polyline points={d.hours.map((h, i) => xy(h, i).join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={2} />
        {d.hours.map((h, i) => { const p = xy(h, i); return (
          <g key={i}><text x={p[0]} y={p[1] - 6} textAnchor="middle" fontSize={11} fill="currentColor">{Math.round(h.temp) + '°'}</text>
            <text x={p[0]} y={H + 14} textAnchor="middle" fontSize={10} fill="#888">{h.time}</text></g>); })}
      </svg>
    );
  }
  return (
    <div className="wg wgw">
      <div className="wtop">
        <div className="wbig"><SkyIcon kind={d.now.icon} size={56} /><span className="wtemp">{fmtT(d.now.temp)}</span><span className="wunit">{d.unit}</span></div>
        <div className="wmeta">
          <span>{d.now.sky}</span><span>{'Feels like ' + fmtT(d.now.feels)}</span>
          <span>{'Humidity ' + (d.now.humidity == null ? '–' : d.now.humidity + '%')}</span>
          <span>{'Wind ' + (d.now.wind == null ? '–' : Math.round(d.now.wind) + ' ' + d.wind)}</span>
        </div>
        <div className="wplace">{d.place}</div>
      </div>
      {line}
      <div className="wdays">{d.days.map((x, i) => (
        <div className="wday" key={x.date || i} title={x.sky}><b>{dayName(x.date, i)}</b><SkyIcon kind={x.icon} size={30} />
          <span>{fmtT(x.high) + ' / ' + fmtT(x.low)}</span><em>{x.rain == null ? '' : x.rain + '% rain'}</em></div>))}</div>
    </div>
  );
}

function Chart({d}) {
  const [hid, setHid] = useState({});
  const [act, setAct] = useState(-1);
  const W = 560, H = 250, L = 46, R = 14, T = 16, B = 30, n = d.labels.length;
  const fmt = (v) => (v == null ? '–' : (Math.abs(v) >= 1000 ? v.toLocaleString() : Math.round(v * 100) / 100) + (d.unit ? ' ' + d.unit : ''));
  const all = [];
  d.series.forEach((s, si) => { if (!hid[si]) s.values.forEach((v) => { if (v != null) all.push(v); }); });
  if (!all.length) all.push(0, 1);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (d.type !== 'line') lo = Math.min(0, lo);
  if (lo === hi) hi = lo + 1;
  const raw = (hi - lo) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, st = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
  const bar = d.type === 'bar';
  const X = (i) => (bar ? L + (i + 0.5) * (W - L - R) / n : L + i * (W - L - R) / Math.max(1, n - 1));
  const Y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const vis = d.series.map((s, i) => i).filter((i) => !hid[i]);
  const bw = Math.max(3, (W - L - R) / n / (vis.length + 1));
  const step = Math.ceil(n / 8);
  const at = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, w = (W - L - R) / (bar ? n : Math.max(1, n - 1));
    return Math.max(0, Math.min(n - 1, Math.round(bar ? (x - L) / w - 0.5 : (x - L) / w)));
  };
  const base = Y(Math.max(lo, 0));
  return (
    <div className="wg wgchart">
      {d.title && <div className="wtitle">{d.title + (d.unit ? ' (' + d.unit + ')' : '')}</div>}
      <svg viewBox={'0 0 ' + W + ' ' + H} className="wchart" role="img" aria-label={d.title || 'Chart'}
        onPointerMove={(e) => setAct(at(e))} onPointerDown={(e) => setAct(at(e))} onPointerLeave={() => setAct(-1)}>
        {[0, 1, 2, 3, 4].map((k) => { const v = lo + (hi - lo) * k / 4, y = Y(v); return (
          <g key={k}><line x1={L} y1={y} x2={W - R} y2={y} stroke="currentColor" strokeOpacity={0.12} />
            <text x={L - 6} y={y + 4} textAnchor="end" fontSize={11} fill="#888">{Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Math.round(v * 10) / 10}</text></g>); })}
        {d.labels.map((l, i) => (i % step ? null : <text key={i} x={X(i)} y={H - 9} textAnchor="middle" fontSize={11} fill="#888">{l}</text>))}
        {act >= 0 && !bar && <line x1={X(act)} y1={T} x2={X(act)} y2={H - B} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3" />}
        {vis.map((si, k) => {
          const s = d.series[si], col = COL[si % 6];
          if (bar) return <g key={si}>{s.values.map((v, i) => { if (v == null) return null; const x = X(i) - bw * vis.length / 2 + k * bw, y0 = Y(0), y1 = Y(v);
            return <rect key={i} x={x} y={Math.min(y0, y1)} width={bw * 0.88} height={Math.max(1, Math.abs(y0 - y1))} fill={col} opacity={act === i || act < 0 ? 1 : 0.45} />; })}</g>;
          const pts = []; s.values.forEach((v, i) => { if (v != null) pts.push([X(i), Y(v)]); });
          if (!pts.length) return null;
          return (
            <g key={si}>
              {d.type === 'area' && <polygon points={[[pts[0][0], base], ...pts, [pts[pts.length - 1][0], base]].map((q) => q.join(',')).join(' ')} fill={col} fillOpacity={0.2} />}
              <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={col} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (v == null || !(act === i || n <= 24) ? null : <circle key={i} cx={X(i)} cy={Y(v)} r={act === i ? 5 : 3} fill={act === i ? col : 'transparent'} stroke={col} strokeWidth={2} />))}
            </g>
          );
        })}
      </svg>
      {act >= 0 && <div className="wtipline"><b>{d.labels[act]}</b>{d.series.map((s, si) => (hid[si] ? null : <span key={si}><i className="wdt" style={{background: COL[si % 6]}} />{(s.name || 'Series ' + (si + 1)) + ': '}<b>{fmt(s.values[act])}</b></span>))}</div>}
      {(d.series.length > 1 || d.series[0].name) && <div className="wlegend">{d.series.map((s, i) => (
        <button key={i} type="button" className={'wlg' + (hid[i] ? ' off' : '')} style={{'--c': COL[i % 6]}}
          onClick={() => setHid((h) => { const c = {...h}; if (c[i]) delete c[i]; else if (Object.keys(c).length < d.series.length - 1) c[i] = 1; return c; })}>{s.name || 'Series ' + (i + 1)}</button>))}</div>}
      {d.source && <div className="wsrc">{'Source: ' + d.source}</div>}
    </div>
  );
}

function Services({d}) {
  return (
    <div className="wg">
      <div className="wtitle">{'Services · ' + d.runtime + (d.ready ? ' · all ready' : '')}</div>
      <ul className="wsvc">{d.services.map((x) => { const ok = /ready|running|ok|healthy/i.test(x.status), bad = /error|fail|crash/i.test(x.status); return (
        <li key={x.name}><i className={'wdot ' + (ok ? 'ok' : bad ? 'bad' : 'wait')} /><b>{x.name}</b><span>{[x.type, x.port ? ':' + x.port : ''].filter(Boolean).join(' ')}</span><em>{x.status}</em></li>); })}</ul>
    </div>
  );
}

function Grow({d}) {
  const a = (href, text, cls) => <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{text}</a>;
  return (
    <div className="wg wgrow">
      <div className="wtitle">{'Grow it · ' + host(d.url)}</div>
      <div className="gsec">Can AI search find it</div>
      {d.check ? (
        <div className="gcheck"><div className="gscore"><b>{String(d.check.score)}</b><span>{'/100 · ' + d.check.grade}</span></div>
          <div className="gfix">{d.check.fixes.length ? d.check.fixes.map((x) => <p key={x.title}><b>{x.title + ': '}</b>{x.summary}</p>) : <p>ChatGPT, Claude, Perplexity and Google can read and cite this page.</p>}
            {a(d.check.report, 'Full report on Citable')}</div></div>
      ) : <p className="gdim">The check did not answer this time. Try it on citable.flisk.si.</p>}
      <div className="gsec">Who would buy it</div><p>{d.buyers}</p>{d.pitch && <p className="gpitch">{d.pitch}</p>}
      <div className="gsec">Where to find them</div>
      <ul className="gplaces">{d.places.map((p) => <li key={p.name}>{p.url ? a(p.url, p.name) : <b>{p.name}</b>}{p.why && <span>{p.why}</span>}</li>)}</ul>
      <div className="gsec">{'Emails to send (' + d.emails.length + ')'}</div>
      {d.emails.map((e, i) => (
        <div className="gmail" key={i}>{e.to && <div className="gto">{'To: ' + e.to}</div>}<b>{e.subject}</b><div className="gbody">{e.body}</div>
          <div className="gacts">
            <Button size="sm" variant="primary" label="Open in Gmail" href={'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent(e.subject) + '&body=' + encodeURIComponent(e.body)} target="_blank" />
            <Button size="sm" variant="secondary" label="Mail app" href={'mailto:?subject=' + encodeURIComponent(e.subject) + '&body=' + encodeURIComponent(e.body)} />
            <Button size="sm" variant="ghost" label="Copy" onClick={() => navigator.clipboard && navigator.clipboard.writeText(e.subject + '\n\n' + e.body).catch(() => {})} />
          </div></div>))}
      <p className="gdim">Nothing is sent for you: add the address in Gmail and press Send yourself.</p>
      {a('https://grow.flisk.si/?url=' + encodeURIComponent(d.url), 'Full plan on grow.flisk.si: posts and where to list it')}
    </div>
  );
}

export const WIDGETS = {
  web: ({d}) => <div className="wg wgweb"><span>{'Read ' + d.host + (d.count ? ' (' + d.count + ' items)' : '')}</span></div>,
  weather: Weather, chart: Chart, services: Services, grow: Grow,
};

// A widget whose data is not what the drawing expects shows nothing, as on /classic, instead of breaking the whole chat.
class Quiet extends Component {
  constructor(p) { super(p); this.state = {bad: false}; }
  static getDerivedStateFromError() { return {bad: true}; }
  render() { return this.state.bad ? null : this.props.children; }
}

export function Widget({w}) {
  const Draw = WIDGETS[w.kind];
  if (!Draw || !w.data) return null;
  return <Quiet><Draw d={w.data} /></Quiet>;
}

// A Cloudflare Worker the task wrote, running in this tab (fleet's cfworker2browser): type a request, read the answer.
async function runWorker(code) {
  const base = new URL('../cfworker2browser/', BOOT.pod).href;
  const m = await import(/* @vite-ignore */ base + 'src/index.js');
  const entry = URL.createObjectURL(new Blob(['import ' + JSON.stringify(base + 'src/worker-entry.js') + ';'], {type: 'text/javascript'}));
  return m.startWorker({code, entry});
}

export const workerPaths = (code) => {
  const paths = [];
  String(code || '').replace(/["']([/][A-Za-z0-9_\-/.:]*)["']/g, (m, x) => { if (x.length > 1 && !paths.includes(x) && paths.length < 6) paths.push(x); return m; });
  return paths;
};

export function WorkerCard({ev}) {
  const [req, setReq] = useState('GET /');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const wp = useRef(null);
  if (!BOOT.pod) return null;
  const paths = workerPaths(ev.code);
  const send = async (line) => {
    setBusy(true);
    const t0 = performance.now();
    try {
      const parts = line.trim().split(/\s+/);
      const method = parts.length > 1 ? parts[0].toUpperCase() : 'GET';
      const path = parts.length > 1 ? parts[1] : parts[0];
      if (!wp.current) wp.current = runWorker(ev.code);
      const w = await wp.current;
      const init = {method};
      if (!['GET', 'HEAD'].includes(method)) { const b = prompt('Body to send (text, usually JSON)', '{}'); init.body = b == null ? '{}' : b; init.headers = {'content-type': 'application/json'}; }
      const r = await w.fetch('https://worker.local' + (path.startsWith('/') ? path : '/' + path), init);
      let text = await r.text();
      try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* not JSON */ }
      setRes({ok: r.ok, label: r.status + (r.statusText ? ' ' + r.statusText : ''), ms: Math.round(performance.now() - t0), text: text.slice(0, 4000)});
    } catch (e) {
      wp.current = null;
      setRes({ok: false, label: 'Error', ms: Math.round(performance.now() - t0), text: 'Could not run it: ' + String((e && e.message) || e)});
    }
    setBusy(false);
  };
  return (
    <div className="wcard">
      <div className="wctop"><i className="wdot ok" /><b>Live in this tab</b><span>no deploy · no key · free</span></div>
      <div className="wcbody">
        <form className="wrow" onSubmit={(e) => { e.preventDefault(); send(req); }}>
          <input value={req} onChange={(e) => setReq(e.target.value)} aria-label="Request: method and path" spellCheck={false} />
          <Button type="submit" label="Send" variant="primary" size="sm" isDisabled={busy} />
        </form>
        {paths.length > 0 && <div className="wchips">{paths.map((x) => <button key={x} type="button" onClick={() => { setReq('GET ' + x); send('GET ' + x); }}>{x}</button>)}</div>}
        {res && <div className="wrres"><div className="wrmeta"><span className={'wrst' + (res.ok ? '' : ' bad')}>{res.label}</span><span>{res.ms + ' ms'}</span>
          <button type="button" onClick={() => navigator.clipboard && navigator.clipboard.writeText(res.text).catch(() => {})}>Copy</button></div>
          <pre className="wrout">{res.text}</pre></div>}
      </div>
    </div>
  );
}

// Every free model was busy and the answer came from the web alone: a model that inference.flisk.si serves runs in a hidden
// iframe on its origin (WebGPU, weights download once) and writes the answer from the same sources. No server tokens.
export const canWriteInBrowser = (info) => !!(BOOT.inf && typeof navigator !== 'undefined' && navigator.gpu && info && info.results && info.results.length);

function writeInBrowser(info, say, onText) {
  return new Promise((resolve) => {
    const INF = BOOT.inf, f = document.createElement('iframe');
    let started = false, text = '';
    f.src = INF + '/browser-model'; f.setAttribute('allow', 'webgpu'); f.hidden = true; f.title = 'Browser model';
    const finish = (ok) => { window.removeEventListener('message', on); clearTimeout(t0); clearInterval(iv); f.remove(); resolve(ok); };
    const on = (e) => {
      if (e.origin !== INF || e.source !== f.contentWindow) return;
      const d = e.data || {};
      if (d.from !== 'flisk-browser-model') return;
      if (d.ev === 'ready') {
        if (started) return;
        started = true;
        if (!d.webgpu) { say('This browser has no WebGPU'); finish(false); return; }
        const ids = d.models || [], big = (navigator.deviceMemory || 4) >= 8;
        const model = big && ids.includes('flisk-browser-chat') ? 'flisk-browser-chat' : ids.includes('flisk-browser-chat-lite') ? 'flisk-browser-chat-lite' : ids[0];
        if (!model) { say('No browser model is available'); finish(false); return; }
        const src = info.results.map((r, i) => '[' + (i + 1) + '] ' + r.title + ': ' + r.snippet).join('\n');
        f.contentWindow.postMessage({cmd: 'generate', id: 'a1', model, maxTokens: 400, messages: [
          {role: 'system', content: 'Answer the question using only the sources. Cite them as [1], [2]. Reply in the language of the question. Be short and exact. If the sources do not answer it, say so.'},
          {role: 'user', content: 'Sources:\n' + src + '\n\nQuestion: ' + info.question}]}, INF);
      } else if (d.ev === 'progress') say('Loading the model in your browser: ' + Math.round((d.progress || 0) * 100) + '%');
      else if (d.ev === 'delta') { text += d.text; onText(text); say('Writing the answer…'); }
      else if (d.ev === 'done') finish(true);
      else if (d.ev === 'error') { say('The browser model could not run: ' + d.error); finish(false); }
    };
    const t0 = setTimeout(() => { if (!started) { say('The browser model did not start'); finish(false); } }, 20000);
    // The runner cannot know who framed it when the page sends no Referer, so ask it, again until it answers.
    const ask = () => { if (started) return; try { f.contentWindow.postMessage({cmd: 'status'}, INF); } catch (e) { /* not loaded yet */ } };
    const iv = setInterval(() => { if (started) clearInterval(iv); else ask(); }, 700);
    f.addEventListener('load', ask);
    window.addEventListener('message', on);
    document.body.appendChild(f);
  });
}

export function BrowserAnswer({info}) {
  const [label, setLabel] = useState('Write a better answer in my browser (free, about 0.4 GB once)');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [text, setText] = useState('');
  const go = () => {
    setBusy(true);
    writeInBrowser(info, setLabel, setText).then((ok) => { if (ok) { lsSet('chat_browser_model', 'on'); setDone(true); } else setBusy(false); });
  };
  // A visitor who said yes once gets it every time, as on /classic.
  useEffect(() => { if (canWriteInBrowser(info) && lsGet('chat_browser_model') === 'on') go(); }, []);
  if (!canWriteInBrowser(info)) return null;
  return (
    <>
      {text && <Markdown density="compact">{text}</Markdown>}
      {!done && <div><Button label={label} variant="secondary" size="sm" isDisabled={busy} onClick={go} /></div>}
    </>
  );
}
