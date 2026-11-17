// The reasoning box above an answer: one header (spinner, what it is doing, how long, a chevron) that folds a timeline of
// what happened: dim text for what it is thinking about, a dot per step, and pills for the commands, files and searches.
// REASONING_CSS goes into the page style; REASONING_JS defines reasoning(turn) in the page script (it uses the page's node(),
// SI icons and down()). Corner radius stays var(--radius): the radius check allows nothing else.
export const REASONING_CSS = String.raw`
.rsn{margin:2px 0 6px;font-size:14px;color:var(--dim)}
.rsn-top{display:flex;align-items:center;gap:8px}
.rsn-h{all:unset;box-sizing:border-box;flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;color:var(--dim)}
.rsn-h:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.rsn-title{color:var(--ink);font-weight:500;white-space:nowrap}
.rsn-sub{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rsn-sub:not(:empty)::before{content:'\00b7';margin-right:8px}
.rsn-chev{margin-left:auto;width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .15s;flex:none;margin-right:4px}
.rsn.shut .rsn-chev{transform:rotate(-135deg)}
.rsn.empty .rsn-chev{display:none}
.rsn-spin{width:16px;height:16px;border-radius:50%;border:2px solid var(--line2);border-top-color:var(--green);animation:spin .8s linear infinite;flex:none}
.rsn.done .rsn-spin{animation:none;border-color:var(--green);background:var(--green) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/12px no-repeat}
.rsn.fail .rsn-spin{animation:none;border-color:var(--red);background:var(--red)}
.rsn-b{margin:2px 0 0 7px;padding-left:16px;border-left:2px solid var(--line)}
.rsn.shut .rsn-b,.rsn.empty .rsn-b{display:none}
.rsn-l{list-style:none;margin:0;padding:2px 0;display:flex;flex-direction:column;gap:2px}
.rsn-i{position:relative;padding:5px 0;line-height:1.45;animation:rise .2s ease-out;overflow-wrap:anywhere}
.rsn-i::before{content:'';position:absolute;left:-22px;top:12px;width:8px;height:8px;border-radius:50%;background:var(--line2);box-shadow:0 0 0 3px var(--bg)}
.rsn-i.live::before{background:#D9A441;animation:pulse 1.2s ease-in-out infinite}
.rsn-i.ok::before{background:var(--green)}
.rsn-i.bad::before{background:var(--red)}
.rsn-i.txt{color:var(--dim)}
.rsn-i code,.rsn-pill{display:inline-flex;align-items:center;gap:6px;max-width:100%;font:12.5px var(--mono);color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:2px 8px;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rsn-pill svg{width:13px;height:13px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:var(--dim)}
.rsn-i pre{margin:6px 0 0;font:12px/1.5 var(--mono);color:var(--dim);background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:8px 10px;max-height:160px;overflow:auto;white-space:pre-wrap}
.rsn-i .pg{margin-top:6px}
@media (prefers-reduced-motion:reduce){.rsn-spin,.rsn-i{animation:none}}
`;

export const REASONING_JS = String.raw`
// reasoning(turn) -> { root, wt (title), ws (what it is doing now), actions, step(), text(), pill(), out(), end() }
function reasoning(turn){
  const root=node('div','rsn empty'),top=node('div','rsn-top'),head=node('button','rsn-h'),spin=node('span','rsn-spin'),
    wt=node('span','rsn-title',''),ws=node('span','rsn-sub','Thinking'),chev=node('span','rsn-chev'),
    actions=node('span','rsn-act'),body=node('div','rsn-b'),list=node('ol','rsn-l');
  head.type='button';head.setAttribute('aria-expanded','true');head.append(spin,wt,ws,chev);
  top.append(head,actions);body.appendChild(list);root.append(top,body);turn.appendChild(root);
  let live=null,count=0,open=true;
  const fold=(o)=>{open=o;root.classList.toggle('shut',!o);head.setAttribute('aria-expanded',String(o));};
  head.onclick=()=>fold(!open);
  const settle=(cls)=>{if(live&&live.classList.contains('live')){live.classList.remove('live');live.classList.add(cls||'ok');}};
  const add=(li,cls)=>{settle('ok');li.className='rsn-i '+(cls||'live');list.appendChild(li);root.classList.remove('empty');count++;live=cls==='txt'?null:li;down();return li;};
  // A step: its text (html already escaped by the caller), an icon name for the pill, and the pill text when it has one.
  const step=(html,cls,ic,pillText)=>{const li=node('li','');const t=node('span','t');t.innerHTML=html;li.appendChild(t);if(pillText)li.append(' ',pill(pillText,ic));return add(li,cls||'live');};
  const pill=(text,ic)=>{const p=node('span','rsn-pill');if(ic&&SI[ic]){const s=document.createElement('span');s.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+SI[ic]+'</svg>';p.appendChild(s.firstChild);}p.appendChild(document.createTextNode(text));return p;};
  // Plain dim text: what it is thinking about. No state, no icon.
  const text=(s)=>{const li=node('li','',s);return add(li,'txt');};
  const out=(s,bad)=>{if(!live||!s)return;live.appendChild(node('pre','',s.length>1500?s.slice(0,1500)+'\n…':s));if(bad){live.classList.remove('live','ok');live.classList.add('bad');}down();};
  const end=(ok,title)=>{settle(ok?'ok':'bad');root.classList.add(ok?'done':'fail');wt.textContent=title;ws.textContent='';if(ok&&count)fold(false);};
  return {root,wt,ws,actions,list,step,text,pill,out,end,get count(){return count;},get live(){return live;}};
}
`;
