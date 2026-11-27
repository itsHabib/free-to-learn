// The local browser view: lessons, practice and the API page, served on 127.0.0.1 only.
// A lesson is split at each {{gate:ID}} line. The lesson page is served holding only the text
// before the first gate, and its script fetches the part after a gate once every question of
// practice item ID has a committed answer in this browser. A gate paces the page; it is not a lock: the server
// keeps no record of commits and serves /lesson/NN/part/K to any request for it.
// Practice answers are graded here, so an item's answer and its feedback reach the page only
// in the reply to a commit.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderCode } from './reader/code-example.mjs';

const root = dirname(fileURLToPath(import.meta.url));
// The shared listing style, copied into reader/ by the repository's example sync.
const CODE_CSS = readFileSync(join(root, 'reader', 'code-example.css'), 'utf8');
const config = JSON.parse(readFileSync(join(root, 'course.json'), 'utf8'));

export const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = s => escape(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
// A heading's id, so feedback after a miss can link to the section that teaches the item.
export const slug = s => String(s).toLowerCase().replace(/[`'’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Split lesson markdown into segments at {{gate:ID}} lines.
export function splitLesson(md) {
  const segments = [{ gate: null, lines: [] }];
  for (const line of md.split('\n')) {
    const m = line.match(/^\{\{gate:([a-z0-9-]+)\}\}\s*$/);
    if (m) segments.push({ gate: m[1], lines: [] });
    else segments.at(-1).lines.push(line);
  }
  return segments.map(s => ({ gate: s.gate, text: s.lines.join('\n') }));
}

// Markdown subset used by the lessons and API.md. Consecutive text lines join into one
// paragraph (or one list item); code blocks are kept exactly, line for line. A fence with
// an info string (```js {"file":...}) goes through the shared code display, which labels
// the listing with its file and region; a bare fence stays a plain block. The comment
// lines that mark a listing extracted from a source file are not shown.
export const exampleMarker = line => /^<!-- (code-example \{.*\}|\/code-example) -->$/.test(line);
export function renderMarkdown(md, practice) {
  const parts = [];
  let code = null, info = '', para = null, list = null, item = null;
  const block = () => info ? renderCode(code.join('\n'), info) : '<pre class="code"><code>' + escape(code.join('\n')) + '</code></pre>';
  const flushItem = () => { if (item !== null) { list.items.push(item.join(' ')); item = null; } };
  const flushList = () => { flushItem(); if (list) { parts.push(`<${list.tag}>` + list.items.map(x => '<li>' + inline(x) + '</li>').join('') + `</${list.tag}>`); list = null; } };
  const flushPara = () => { if (para) { parts.push('<p>' + inline(para.join(' ')) + '</p>'); para = null; } };
  for (const line of md.split('\n')) {
    if (code) {
      if (line.startsWith('```')) { parts.push(block()); code = null; }
      else code.push(line);
      continue;
    }
    if (line.startsWith('```')) { flushPara(); flushList(); code = []; info = line.slice(3).trim(); continue; }
    if (exampleMarker(line)) continue;
    if (!line.trim()) { flushPara(); flushItem(); continue; }
    const h = line.match(/^(#{1,4}) (.*)$/);
    if (h) { flushPara(); flushList(); parts.push(`<h${h[1].length} id="${slug(h[2])}">${inline(h[2])}</h${h[1].length}>`); continue; }
    const fg = line.match(/^\{\{figure:([a-z0-9-]+)\}\}$/);
    if (fg) { flushPara(); flushList(); parts.push(figureHtml(fg[1])); continue; }
    const p = line.match(/^\{\{practice:([a-z0-9-]+)\}\}$/);
    if (p) { flushPara(); flushList(); parts.push(practiceHtml(p[1], practice)); continue; }
    const li = line.match(/^(?:[-*]|(\d+)\.) (.*)$/);
    if (li) {
      flushPara();
      const tag = li[1] ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      flushItem();
      list ??= { tag, items: [] };
      item = [li[2]];
      continue;
    }
    if (item !== null) { item.push(line.trim()); continue; }
    flushList();
    (para ??= []).push(line.trim());
  }
  flushPara();
  flushList();
  if (code) parts.push(block());
  return parts.join('\n');
}

// figureDesc(name): the figure's <desc>, what it shows in words, or null when the file is missing.
// The terminal lesson (node lab.mjs lesson) prints it where the page shows the drawing.
export function figureDesc(name) {
  const file = join(root, 'lessons', 'figures', `${name}.svg`);
  if (!existsSync(file)) return null;
  return ((readFileSync(file, 'utf8').match(/<desc[^>]*>([\s\S]*?)<\/desc>/) ?? [])[1] ?? '').trim();
}
// A figure is an SVG file in lessons/figures with a <title> (its short name) and a
// <desc> (what it shows, in words). The caption under it is the desc's opening sentence, or
// sentences until it reaches 40 characters; the whole desc stays the figure's description for
// screen readers (aria-describedby), with the title as its name, so it is read once.
function figureHtml(name) {
  const file = join(root, 'lessons', 'figures', `${name}.svg`);
  if (!existsSync(file)) return `<p><em>Figure ${escape(name)} is missing.</em></p>`;
  let svg = readFileSync(file, 'utf8').replace(/<\?xml[^>]*\?>\s*/, '');
  const desc = figureDesc(name);
  const sentences = desc.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [desc];
  let caption = '';
  for (const x of sentences) { caption += (caption ? ' ' : '') + x.trim(); if (caption.length >= 40) break; }
  svg = svg.replace(/aria-labelledby="([\w-]+) ([\w-]+)"/, 'aria-labelledby="$1" aria-describedby="$2"');
  return `<figure>${svg}<figcaption>${caption}</figcaption></figure>`;
}

function practiceHtml(id, practice) {
  const items = practice[id];
  if (!items) return `<p><em>Practice item ${escape(id)} is missing.</em></p>`;
  const prompts = items.map((it, v) => `<div class="variant" data-variant="${v}"${v ? ' hidden' : ''}><p class="prompt">${inline(it.prompt)}</p>
<label>Your answer (${answerLabel(it.answer)}) <input name="answer" autocomplete="off"></label> <button type="button" class="commit">Commit answer</button>
<p class="feedback" aria-live="polite" tabindex="-1"></p></div>`).join('\n');
  const kind = practiceKind(id);
  return `<section class="practice" data-practice="${escape(id)}" data-variants="${items.length}"><h3 class="kind">${kind}</h3>${prompts}${items.length > 1 ? '<button type="button" class="next" hidden>Another question like this</button>' : ''}</section>`;
}

// Ids starting with p and a digit are predictions; the rest are practice.
export const practiceKind = id => /^p\d/.test(id) ? 'Predict, then commit' : 'Practice';

// ----- answers (same rules as the example course kit) -----
// The browser view and the terminal commands (node lab.mjs question and answer) both grade here.
export function answerFormat(expected) {
  if (typeof expected === 'boolean') return 'Answer yes or no.';
  if (typeof expected === 'number') return 'Answer with a number.';
  if (Array.isArray(expected)) return 'Answer with a list of numbers, such as 1, 2, 3.';
  return 'Answer with one word.';
}
export const answerLabel = e => typeof e === 'boolean' ? 'yes or no' : typeof e === 'number' ? 'a number' : Array.isArray(e) ? 'numbers separated by commas' : 'one word';
export function parseAnswer(text, expected) {
  // A minus sign may be typed as the typographic one the lessons print (U+2212) or as an en
  // dash. Before a digit either is a minus sign, so "\u20135" is never read as 5.
  const raw = String(text ?? '').trim().replace(/[\u2212\u2013]\s*(?=[\d.])/g, '-');
  const problem = () => ({ ok: false, hint: `That answer could not be read. ${answerFormat(expected)} Nothing was recorded; correct it and commit again.` });
  if (!raw) return problem();
  // A word may come wrapped in punctuation, brackets, quotes or backticks: "A.", "(a)", "`ArrowLeft`".
  // A sign in front of a digit stays, so a number typed where a word is the key is still read as typed.
  const word = raw.replace(/^[^\p{L}\p{N}_]*?(?=[-+]?\.?\d|[\p{L}_])/u, '').replace(/[^\p{L}\p{N}_]+$/u, '').toLowerCase();
  if (typeof expected === 'boolean') {
    if (word === 'yes' || word === 'true') return { ok: true, value: true };
    if (word === 'no' || word === 'false') return { ok: true, value: false };
    return problem();
  }
  const numbers = /[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?/gi;
  if (typeof expected === 'number') {
    // Words around the number are fine as long as there is exactly one number: "word 3", "30 paces".
    // Commas that group thousands are dropped first, so 1,973,696 is one number.
    const found = raw.replace(/(\d),(?=\d{3}(?!\d))/g, '$1').match(numbers) ?? [];
    return found.length === 1 ? { ok: true, value: Number(found[0]) } : problem();
  }
  if (Array.isArray(expected)) {
    const parts = raw.match(numbers) ?? [];
    return parts.length ? { ok: true, value: parts.map(Number) } : problem();
  }
  return word && !/\s/.test(word) ? { ok: true, value: word } : problem();
}
const sameAnswer = (a, b) => JSON.stringify(typeof b === 'string' ? String(a).toLowerCase() : a) === JSON.stringify(typeof b === 'string' ? b.toLowerCase() : b);
// A more precise answer counts when it rounds to the key at the key's own precision, so 0.8333
// answers 0.83. A whole-number key needs the whole number itself, so 101.5 does not answer 102,
// unless the item is marked round: true (a question that asks for a rounded value), and then
// 656.06 answers 656. Rounding is tried only after the exact key and the listed wrong answers.
// The key's precision is its last written decimal place, exponent included (5.96046448e-8 is
// written to the 16th place), and the only slack beyond half a unit there is a millionth of it,
// for binary rounding, so a less precise answer such as 6e-8 or 0.0166666667 never counts.
const places = (n) => { const [m, e] = String(n).toLowerCase().split('e'); return Math.max(0, (m.split('.')[1] ?? '').length - Number(e ?? 0)); };
const closeTo = (a, key, round) => { if (typeof a !== 'number' || typeof key !== 'number') return false; if (Number.isInteger(key) && !round) return a === key; const tol = 0.5 * 10 ** -places(key); return Math.abs(a - key) <= tol * (1 + 1e-6); };
const roundsTo = (a, b, round) => (typeof b === 'number' ? closeTo(a, b, round) : Array.isArray(b) && Array.isArray(a) && a.length === b.length && b.every((x, i) => closeTo(a[i], x, round)));

// Whether the section a miss points to goes on in text that opens only after item id: the
// item's own gate falls inside that section, or before it. Re-reading such a section before
// the item's questions are answered shows nothing new, so the pointer says when it opens.
const sectionCache = new Map();
export function explainedAfterGate(id, objective, section) {
  const key = `${id}|${objective}|${section}`;
  if (sectionCache.has(key)) return sectionCache.get(key);
  let after = false;
  const file = lessonFile(objective);
  if (file && existsSync(file)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let fence = false, start = -1, end = lines.length, gate = -1;
    lines.forEach((line, n) => {
      if (line.startsWith('```')) fence = !fence;
      if (!fence && line.startsWith('## ')) { if (line.slice(3).trim() === section) start = n; else if (start >= 0 && n > start && end === lines.length) end = n; }
      if (line.trim() === `{{gate:${id}}}`) gate = n;
    });
    after = gate >= 0 && start >= 0 && gate < end;
  }
  sectionCache.set(key, after);
  return after;
}

export function grade(practice, id, variant, text) {
  const item = practice[id]?.[variant];
  if (!item) return { ok: false, hint: 'Unknown practice item.' };
  const parsed = parseAnswer(text, item.answer);
  if (!parsed.ok) return parsed;
  // anyOrder: a list answer where the order carries no meaning.
  const inOrder = (v) => (item.anyOrder && Array.isArray(v) ? [...v].sort((a, b) => a - b) : v);
  const exact = sameAnswer(inOrder(parsed.value), inOrder(item.answer));
  const wrong = exact ? null : (item.wrong ?? []).find(w => sameAnswer(inOrder(parsed.value), inOrder(w.answer)));
  const correct = exact || (!wrong && roundsTo(inOrder(parsed.value), inOrder(item.answer), item.round === true));
  const shown = Array.isArray(item.answer) ? item.answer.join(', ') : typeof item.answer === 'boolean' ? (item.answer ? 'yes' : 'no') : String(item.answer);
  // Feedback that opens by stating the answer would say it twice.
  const why = (wrong ? wrong.feedback : item.feedback).replace(new RegExp(`^${shown.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\s+`), '');
  // The page sets the verdict apart from the reason, and links the section a miss points to.
  const verdict = correct ? 'Right.' : `Not quite: the answer is ${shown}.`;
  // The page and the terminal show an item's questions in order, so another one comes next
  // only before the last. A committed answer is never replaced, so there is no second try.
  const another = variant < (practice[id]?.length ?? 1) - 1;
  const opensAfter = Boolean(item.section) && explainedAfterGate(id, item.objective, item.section);
  const pointer = !correct && item.section ? { text: `lesson ${item.objective}, under "${item.section}"`, href: `/lesson/${item.objective}#${slug(item.section)}`, section: item.section, objective: item.objective, opensAfter, opensNow: opensAfter && !another } : null;
  const when = !pointer?.opensAfter ? '' : another ? ', in the text that opens once every question of this item has an answer' : ', in the text this answer opens';
  return {
    ok: true, correct, verdict, pointer,
    text: correct ? `${verdict} ${item.feedback}` : `${verdict} ${why}${pointer ? ` This is taught in ${pointer.text}${when}.` : ''}${another ? ' The next question of this item is on the same idea.' : ''}`,
  };
}

// Light only: the page declares a light colour scheme and has no dark styles, so it stays
// light when the system asks for dark. Prose is held to a reading width; code blocks may
// run wider than the column where the window has room, and scroll sideways where it has not.
const CSS = `:root{color-scheme:only light;--bg:#fff;--ink:#1b1f24;--muted:#57606a;--line:#d8dee4;--accent:#3553d4;--soft:#f6f8fa}
body{background:var(--bg);color:var(--ink);font:17px/1.6 system-ui,sans-serif;margin:0}main{max-width:46rem;margin:0 auto;padding:1.5rem 16px 4rem}
main :is(p,ul,ol,h1,h2,h3,h4,figcaption){max-width:38rem}
a{color:var(--accent)}.code-example pre{width:auto;min-width:0}code{background:var(--soft);padding:0 .25em;border-radius:3px;font-size:.9em;overflow-wrap:anywhere}pre{box-sizing:border-box;width:max-content;min-width:100%;max-width:calc(100% + (100vw - 100%) / 2 - 32px);padding:.75rem;overflow-x:auto;border-radius:6px;line-height:1.45;font-size:.9rem;background:linear-gradient(to right,var(--soft) 30%,rgba(246,248,250,0)) left/40px 100% no-repeat local,linear-gradient(to left,var(--soft) 30%,rgba(246,248,250,0)) right/40px 100% no-repeat local,radial-gradient(farthest-side at 0 50%,rgba(0,0,0,.2),transparent) left/12px 100% no-repeat scroll,radial-gradient(farthest-side at 100% 50%,rgba(0,0,0,.2),transparent) right/12px 100% no-repeat scroll,var(--soft)}pre code{background:none;padding:0;font-size:1em}.scroll-cue{margin:-.9rem 0 1rem;font-size:.8rem;color:var(--muted)}@media (max-width:480px){pre{font-size:.72rem;padding:.5rem}}
.practice{border:1px solid var(--line);border-radius:8px;padding:.75rem 1rem;margin:1.25rem 0;background:var(--soft)}.practice .kind{margin:0 0 .25rem;color:var(--muted);font-size:.85rem;text-transform:uppercase;letter-spacing:.04em}.variant+.variant{border-top:1px solid var(--line);margin-top:.75rem;padding-top:.5rem}figure{margin:1.25rem 0}figure svg{width:100%;height:auto;display:block}figcaption{color:var(--muted);font-size:.9rem;margin-top:.35rem}
input{font:inherit;padding:.2rem .4rem;max-width:100%}input:disabled{color:var(--ink);-webkit-text-fill-color:var(--ink);opacity:1;background:#fff;border:1px solid var(--line);border-radius:3px}button{font:inherit;padding:.2rem .7rem;cursor:pointer}.feedback{color:var(--muted)}.feedback:empty{margin:0}.verdict{color:var(--ink);font-weight:700}.gate-note{color:var(--muted);font-style:italic}nav a{margin-right:1rem}.after{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--line);font-weight:600}`;

// A code block that is wider than its box scrolls sideways, takes keyboard focus and says so
// in a line under it. All three are taken back when the block fits again after a resize.
const WIDE = '<script>function markWide(root){for(const p of root.querySelectorAll("pre")){if(p.closest(".code-example"))continue;const over=p.scrollWidth>p.clientWidth+2,n=p.nextElementSibling,cue=n&&n.classList.contains("scroll-cue")?n:null;if(over){p.tabIndex=0;p.setAttribute("role","region");p.setAttribute("aria-label","Code, scrolls sideways");if(!cue){const c=document.createElement("p");c.className="scroll-cue";c.textContent="This block is wider than the column: scroll it sideways.";p.after(c)}}else{if(document.activeElement!==p)p.removeAttribute("tabindex");p.removeAttribute("role");p.removeAttribute("aria-label");if(cue)cue.remove()}}}addEventListener("load",()=>markWide(document));addEventListener("resize",()=>markWide(document));</script>';
function page(title, body, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="only light"><title>${escape(title)}</title><style>${CSS}\n${CODE_CSS}</style></head><body><main><nav><a href="/">Course</a><a href="/api">API</a></nav>${body}</main>${WIDE}${script}</body></html>`;
}

// The lesson page's script. A committed answer is kept in this browser's storage with the
// reply it got, so a reload shows it again and reopens the gates it opened.
const CLIENT = `<script type="module">
const key='sightline-practice';let store={};try{store=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
const save=()=>{try{localStorage.setItem(key,JSON.stringify(store));return true}catch{return false}};
const lesson=document.body.dataset.lesson,gates=JSON.parse(document.body.dataset.gates||'[]');let next=1,first=true;
// The verdict is set in bold with a mark before it; the section a miss points to is a link.
function say(fb,r){const head=r.verdict||(r.text.match(/^(Right[.]|Not quite:)/)||[''])[0],rest=r.text.slice(head.length);
 const b=document.createElement('strong');b.className='verdict';b.textContent=(r.correct?'✓ ':'✗ ')+head;fb.replaceChildren(b);
 const at=r.pointer?rest.indexOf(r.pointer.text):-1;if(at<0){fb.append(rest);return}
 const a=document.createElement('a');a.href=r.pointer.href;a.textContent=r.pointer.text;fb.append(rest.slice(0,at),a,rest.slice(at+r.pointer.text.length));}
function wire(scope){for(const sec of scope.querySelectorAll('.practice')){const id=sec.dataset.practice,nx=sec.querySelector('.next'),vs=[...sec.querySelectorAll('.variant')],gated=gates.includes(id);
 // Another question is offered only while one is left and every question shown has its answer.
 // A prediction that a gate waits on shows its questions one after another instead, and the
 // gate opens only once every one has an answer, so no question is asked below text that answers it.
 const answered=()=>vs.every(x=>x.hidden||x.querySelector('input').disabled);
 const offer=()=>{if(gated){const v=vs.find(x=>x.hidden);if(v&&answered())v.hidden=false;if(nx)nx.hidden=true;return}if(nx)nx.hidden=!(vs.some(x=>x.hidden)&&answered())};
 for(const v of vs){const btn=v.querySelector('.commit'),inp=v.querySelector('input'),fb=v.querySelector('.feedback'),k=id+':'+v.dataset.variant;let busy=false;
  const lock=()=>{inp.disabled=true;btn.disabled=true};
  const commit=async()=>{if(busy||btn.disabled)return;busy=true;let r;try{r=await fetch('/practice/'+id+'/'+v.dataset.variant,{method:'POST',body:inp.value}).then(r=>r.json())}catch{r={ok:false,hint:'The course server did not answer. Check that it is still running, then commit again.'}}busy=false;
   if(!r.ok){fb.textContent=r.hint;return;}
   // An answer counts as committed only once it is saved; one that cannot be saved stays editable.
   const before=store[k];store[k]={answer:inp.value,text:r.text,correct:r.correct,verdict:r.verdict,pointer:r.pointer};
   if(!save()){if(before===undefined)delete store[k];else store[k]=before;fb.textContent='This browser could not save your answer, so it is not committed. Allow this page to store data (or free some space), then commit again. Answers saved earlier are kept.';return;}
   lock();say(fb,r);fb.focus();offer();openGates();};
  btn.onclick=commit;inp.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();commit()}};
  const done=store[k];if(done){inp.value=done.answer;lock();say(fb,done);v.hidden=false;}}
 offer();
 if(nx)nx.onclick=()=>{const v=vs.find(x=>x.hidden);if(v){v.hidden=false;v.querySelector('input').focus();}offer();};}}
const committed=id=>{const sec=document.querySelector('.practice[data-practice="'+id+'"]'),n=sec?+sec.dataset.variants:1;for(let v=0;v<n;v++)if(!store[id+':'+v])return false;return true};
async function openGates(){const gates=JSON.parse(document.body.dataset.gates);
 while(next<=gates.length&&committed(gates[next-1])){const html=await fetch('/lesson/'+lesson+'/part/'+next).then(r=>r.text());
  const div=document.createElement('div');div.innerHTML=html;document.getElementById('note')?.remove();document.getElementById('lesson').append(div);wire(div);if(window.markWide)markWide(div);next++;}
 if(next<=gates.length&&!document.getElementById('note')){const p=document.createElement('p');p.id='note';p.className='gate-note';p.textContent='Commit an answer to each question above to continue the lesson.';document.getElementById('lesson').append(p);}
 // The link onward appears once the whole lesson is open.
 if(next>gates.length)document.getElementById('after').hidden=false;
 // A link from another page to a section lands on it once the parts before it are open.
 if(first){first=false;if(location.hash.length>1)document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();}}
wire(document);openGates();
</script>`;

export async function loadPractice() {
  const mod = await import(pathToFileURL(join(root, 'lessons', 'practice.mjs')).href);
  return mod.practice;
}

export function lessonFile(id) {
  const l = config.lessons.find(x => x.id === id);
  return l ? join(root, l.file) : null;
}

export async function createCourseServer() {
  const practice = await loadPractice();
  const server = createServer((req, res) => {
    const send = (status, type, body) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body); };
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const path = url.pathname;
      if (req.method === 'POST') {
        const m = path.match(/^\/practice\/([a-z0-9-]+)\/(\d+)$/);
        if (!m) return send(404, 'text/plain', 'Not found');
        let body = '';
        req.on('data', d => { if (body.length < 2000) body += d; });
        req.on('end', () => send(200, 'application/json', JSON.stringify(grade(practice, m[1], Number(m[2]), body))));
        return;
      }
      if (path === '/') {
        const items = config.lessons.map(l => `<li><a href="/lesson/${l.id}">${escape(l.id)} · ${escape(l.title)}</a></li>`).join('');
        return send(200, 'text/html', page(config.title, `<h1>${escape(config.title)}</h1><p>${escape(config.lead)}</p><ol>${items}</ol><p>Start your work folder with <code>node lab.mjs start ./work</code>, check a module with <code>node lab.mjs check 01 ./work</code>, and play a level with <code>node lab.mjs level 1 ./work</code>.</p>`));
      }
      if (path === '/api') return send(200, 'text/html', page('API', renderMarkdown(readFileSync(join(root, 'API.md'), 'utf8'), practice)));
      const lm = path.match(/^\/lesson\/(\d\d)(?:\/part\/(\d+))?$/);
      if (lm && lessonFile(lm[1]) && existsSync(lessonFile(lm[1]))) {
        const segments = splitLesson(readFileSync(lessonFile(lm[1]), 'utf8'));
        if (lm[2] !== undefined) {
          const k = Number(lm[2]);
          if (!(k >= 1 && k < segments.length)) return send(404, 'text/plain', 'No such part');
          return send(200, 'text/html', renderMarkdown(segments[k].text, practice));
        }
        const gates = JSON.stringify(segments.slice(1).map(s => s.gate));
        const at = config.lessons.findIndex(x => x.id === lm[1]), following = config.lessons[at + 1];
        const onward = following ? `<a href="/lesson/${following.id}">Next: ${escape(following.id)} · ${escape(following.title)}</a>` : '<a href="/">Back to the course page</a>';
        const html = page(`Lesson ${lm[1]}: ${config.lessons[at].title}`, `<div id="lesson">${renderMarkdown(segments[0].text, practice)}</div><nav id="after" class="after" hidden>${onward}</nav>`, CLIENT)
          .replace('<body>', `<body data-lesson="${lm[1]}" data-gates='${escape(gates)}'>`);
        return send(200, 'text/html', html);
      }
      return send(404, 'text/plain', 'Not part of the course pages');
    } catch (error) {
      return send(500, 'text/plain', 'The page could not be built: ' + error.message);
    }
  });
  return server;
}
