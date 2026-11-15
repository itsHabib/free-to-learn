// Records a run of your engine and writes a page that replays it, for
// "node lab.mjs watch". The page is one file with no network use.
import { setTap, GROUND, WIDTH, HEIGHT } from './host.mjs';

const r1 = (v) => Math.round(v * 10) / 10;

// Runs fn with every game it makes recorded. Returns one scene per game.
// A scene holds one row per frame and a list of events, each [frame, kind, value]:
// a key press carries the index of the first frame ticked after it, so the frame
// before that index is what the game showed when the key went down.
export async function record(fn) {
  const scenes = [];
  let label = '', latency = null;
  setTap({
    start({ game, mode, seed, truth }) {
      const x = truth.exports, lob = game === 'lob';
      const scene = { game, mode, seed, label, latency, cannonX: lob ? r1(x.r_cannon_x()) : null, frames: [], events: [], reads: 0, writes: 0, presses: 0, truth, line: '', msg: '', flying: false };
      scenes.push(scene);
      return scene;
    },
    read(s) { s.reads++; },
    write(s) { s.writes++; },
    press(s, key) { s.presses++; s.events.push([s.frames.length, 'key', key]); },
    frame(s) {
      const t = s.truth, x = t.exports, lob = s.game === 'lob', flying = t.flying();
      s.frames.push([r1(t.angle()), t.power(), r1(t.targetX()), flying ? 1 : 0, lob ? r1(x.r_px()) : 0, lob ? r1(x.r_py()) : 0, lob ? r1(x.r_cloud()) : 0]);
      const line = t.line(), msg = t.message();
      if (line !== s.line) { s.line = line; s.events.push([s.frames.length - 1, 'line', line]); }
      if (msg !== s.msg) { s.msg = msg; s.events.push([s.frames.length - 1, 'msg', msg]); }
      if (s.flying && !flying) s.events.push([s.frames.length - 1, 'land', r1(t.impactX())]);
      s.flying = flying;
    },
  });
  const setLabel = (text, frames = null) => { label = text; latency = frames; };
  try { await fn(setLabel); } finally { setTap(null); }
  return scenes.filter((s) => s.frames.length >= 40).map(({ truth, line, msg, flying, ...keep }) => keep);
}

// The page. `counted` is how many of the last shots the level scores; when it is left
// out it is read from the summary sentence ("... of its last 10 shots ..."), and the
// table then separates those shots from the practice and check shots before them.
export function page(title, summary, scenes, { counted } = {}) {
  const lastN = Number(counted ?? (String(summary).match(/\blast (\d+) shots\b/) ?? [])[1]) || 0;
  const data = JSON.stringify({ title, summary, scenes, counted: lastN, W: WIDTH, H: HEIGHT, G: GROUND }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="only light">
<title>${title.replace(/[<&]/g, '')}</title>
<style>
:root{color-scheme:only light;--ink:#1b1f24;--muted:#57606a;--line:#d8dee4;--accent:#3553d4;--soft:#f6f8fa}
body{margin:0;background:#fff;color:var(--ink);font:16px/1.5 system-ui,sans-serif}
main{max-width:60rem;margin:0 auto;padding:1.25rem 16px 3rem}
h1{font-size:1.35rem;margin:0 0 .25rem}h2{font-size:1.05rem;margin:1.5rem 0 .25rem}p{margin:.25rem 0;color:var(--muted)}
#status{font:600 1rem/1.4 ui-monospace,Menlo,monospace;color:var(--ink);margin-top:.75rem;overflow-wrap:anywhere}
#last{color:var(--ink);min-height:1.5em;margin-top:.5rem}
canvas{display:block;width:auto;height:auto;max-width:100%;max-height:70vh;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;margin-top:.5rem}@media (max-height:600px){canvas{max-height:60vh}}
.row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:.6rem}
button,select{font:inherit;padding:.3rem .75rem;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);cursor:pointer}
button[aria-pressed=true]{border:2px solid var(--accent);font-weight:700}
button:focus-visible,select:focus-visible,input:focus-visible,.wrap:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
input[type=range]{flex:1;min-width:10rem;accent-color:var(--accent)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:.5rem;margin-top:.75rem}
.stat{background:var(--soft);border-radius:8px;padding:.5rem .75rem}.stat b{display:block;font-size:1.15rem}.stat span{color:var(--muted);font-size:.85rem}
.wrap{overflow-x:auto;background:linear-gradient(to right,#fff 30%,rgba(255,255,255,0)) left/40px 100% no-repeat local,linear-gradient(to left,#fff 30%,rgba(255,255,255,0)) right/40px 100% no-repeat local,radial-gradient(farthest-side at 0 50%,rgba(0,0,0,.2),transparent) left/12px 100% no-repeat scroll,radial-gradient(farthest-side at 100% 50%,rgba(0,0,0,.2),transparent) right/12px 100% no-repeat scroll}
table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{text-align:left;padding:.3rem .6rem;border-bottom:1px solid var(--line);white-space:nowrap}
thead th{color:var(--muted);font-weight:600;vertical-align:bottom}tr.now td{background:var(--soft);font-weight:700}
tr.group th{padding-top:.7rem;color:var(--ink);font-weight:700}tr.group span{position:sticky;left:.6rem}
#cue{font-size:.85rem}
</style></head><body><main>
<h1 id="title"></h1><p id="summary"></p>
<div class="row"><button id="play">Play</button><button id="prev">Previous shot</button><button id="next">Next shot</button><select id="scene" aria-label="Run"></select></div>
<div class="row"><span id="speedlabel">Speed</span><span role="group" aria-labelledby="speedlabel"><button class="speed" data-s="1" aria-pressed="false">1×</button> <button class="speed" data-s="4" aria-pressed="true">4×</button> <button class="speed" data-s="16" aria-pressed="false">16×</button></span>
<input id="seek" type="range" min="0" value="0" aria-label="Frame"></div>
<p id="motion" hidden>Your system asks for reduced motion, so Play does not animate: it steps from one landing to the next. The speed sets how long each landing stays.</p>
<p id="status" aria-label="The game's status line"></p>
<canvas id="c" width="960" height="580" role="img" aria-label="The game field, replayed. Every shot is also described in the sentence under it and listed in the table below."></canvas>
<p id="last" aria-live="polite"></p>
<p id="note"></p>
<div class="stats"><div class="stat"><b id="hits">0</b><span>hits, all shots so far</span></div><div class="stat"><b id="shots">0</b><span>shots landed</span></div>
<div class="stat"><b id="keys">0</b><span>keys pressed</span></div><div class="stat"><b id="frame">0</b><span>frame</span></div></div>
<h2 id="tablehead">Every shot in this run</h2>
<p id="cue" hidden>This table is wider than the screen: scroll it sideways. Result is the second column.</p>
<div class="wrap" id="wrap"><table aria-labelledby="tablehead"><thead><tr id="head"></tr></thead><tbody id="rows"></tbody></table></div>
</main><script>
const D=${data};
const $=id=>document.getElementById(id),cv=$('c'),g=cv.getContext('2d'),G=D.G,W=D.W,INK='#1b1f24',SLATE='#334155',GREEN='#166534';
const one=v=>Number(v).toFixed(1);
const calm=matchMedia('(prefers-reduced-motion: reduce)');
let sc=D.scenes[0],shots=[],moving=false,f=0,playing=false,speed=4,acc=0,then=0,timer=0,shown=-2,T=24;
$('title').textContent=D.title;$('summary').textContent=D.summary;
D.scenes.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.label||('Run '+(i+1));$('scene').append(o)});
if(D.scenes.length<2)$('scene').hidden=true;
const end=()=>sc.frames.length-1;
// One entry per shot that landed. A shot starts on the first frame its shell is in the air,
// which is the frame the fire key's event carries; the frame before it is what the game
// showed when the key was pressed, so that is where the flag was when the shot was fired.
function shotsOf(s){const out=[],fires=[];let keys=0;
 for(const [at,kind,v] of s.events){
  if(kind==='key'){keys++;if(v==='Space')fires.push(at)}
  else if(kind==='land'){let start=at;while(start>0&&s.frames[start-1][3])start--;
   const key=fires.filter(k=>k<=start).pop(),from=key!==undefined&&start-key<=1?key:start,was=s.frames[Math.max(0,from-1)][2];
   const flag=s.frames[at][2],d=v-flag,said=s.events.find(e=>e[1]==='msg'&&e[0]>=at&&e[0]<=at+1&&e[2]&&!e[2].startsWith('ROUND'));
   const hit=said?said[2].startsWith('HIT'):Math.abs(d)<=12,side=d<0?'short':'long',dx=flag-was;
   out.push({start:from,land:at,angle:s.frames[from][0],power:s.frames[from][1],x:v,flag,was,dx,hit,keys,
    result:hit?'HIT':one(Math.abs(d))+' paces '+side,label:hit?'HIT':one(Math.abs(d))+' '+side,
    moved:Math.abs(dx)<0.05?'0.0':one(Math.abs(dx))+(dx>0?' right':' left')})}}
 return out}
function pick(i){sc=D.scenes[i];shots=shotsOf(sc);f=0;shown=-2;$('seek').max=end();
 // The flag moves on this level when any shot found it somewhere else at landing than at firing.
 moving=shots.some(s=>Math.abs(s.dx)>=0.05);
 const cols=['Shot','Result<br>(paces)','Angle','Power','Landed at<br>(paces)'].concat(moving?['Flag when fired<br>(paces)','Flag at landing<br>(paces)','Flag moved in flight<br>(paces)']:['Flag at landing<br>(paces)']);
 $('head').innerHTML=cols.map(c=>'<th scope="col">'+c+'</th>').join('');
 const first=i===0&&D.counted>0&&shots.length>D.counted?shots.length-D.counted:-1;
 const group=t=>'<tr class="group"><th colspan="'+cols.length+'" scope="rowgroup"><span>'+t+'</span></th></tr>';
 $('rows').innerHTML=shots.map((s,k)=>(first>0&&k===0?group('Not counted: practice and check shots'):'')+(k===first?group('Counted by the level: the last '+D.counted+' shots'):'')
  +'<tr data-k="'+k+'"><td>'+(k+1)+'</td><td>'+s.label+'</td><td>'+one(s.angle)+'</td><td>'+s.power+'</td><td>'+one(s.x)+'</td>'+(moving?'<td>'+one(s.was)+'</td>':'')+'<td>'+one(s.flag)+'</td>'+(moving?'<td>'+s.moved+'</td>':'')+'</tr>').join('');
 $('note').textContent=(sc.game==='lob2'?'Lob II shows only what its screen draws: the flag, and where each shell lands. ':'')
  +(moving?'On this level the flag moves while the shell is in the air. The dashed outline marks where the flag was when the shot was fired, the solid outline where it was when the shell landed, and the arrow between them shows which way it went. ':'')
  +'A filled circle is a hit and an X is a miss; hollow, fainter marks are earlier shots.'
  +(sc.latency>1?' In this run every decision arrives '+sc.latency+' frames late.':'');
 wide()}
function line(upto){let t='';for(const [at,kind,v] of sc.events){if(at>upto)break;if(kind==='line')t=v}return t}
// Text on the canvas is sized from the width the canvas is shown at, so it reads at about
// the same size on a phone as on a desk. k scales the marks and lines with it.
function type(){g.font='600 '+T+'px system-ui,sans-serif';g.textAlign='left'}
function place(text,x,gap){const w=g.measureText(text).width;let left=x+gap;if(left+w>W-8)left=x-gap-w;return Math.max(8,left)}
function mark(s,strong){const k=T/24,x=Math.max(14*k,Math.min(W-14*k,s.x)),off=s.x<0||s.x>W,c=s.hit?GREEN:SLATE;
 g.save();g.strokeStyle=c;g.fillStyle=c;g.lineCap='round';
 if(!strong)g.globalAlpha=.5;
 if(s.hit){g.lineWidth=2.5*k;g.beginPath();g.arc(x,G-2,(strong?9:7)*k,0,7);if(strong)g.fill();else g.stroke()}
 else{const r=(strong?8:6)*k;g.lineWidth=(strong?4:2.5)*k;g.beginPath();g.moveTo(x-r,G-2-r);g.lineTo(x+r,G-2+r);g.moveTo(x+r,G-2-r);g.lineTo(x-r,G-2+r);g.stroke()}
 if(strong){type();const text=(off?'off the field, ':'')+s.label;g.fillText(text,place(text,x,16*k),G+10+T*.85)}
 g.restore()}
// A flag drawn as an outline only: dashed for where it was at firing, solid for where it was at landing.
function outline(x,dashed){const k=T/24;g.save();g.strokeStyle=SLATE;g.lineWidth=Math.max(2,1.5*k);g.setLineDash(dashed?[6,5]:[]);
 g.strokeRect(x+2,G-47,19,11);g.beginPath();g.moveTo(x,G-48);g.lineTo(x,G);g.stroke();g.restore()}
// A label on a thin staff that stands on the flag's pole at x.
function tag(text,x,y,dashed){const k=T/24;g.save();g.strokeStyle=SLATE;g.lineWidth=Math.max(1.5,1.5*k);g.setLineDash(dashed?[6*k,5*k]:[]);
 g.beginPath();g.moveTo(x,y-T*.8);g.lineTo(x,G-48);g.stroke();g.setLineDash([]);
 type();g.fillStyle=INK;g.fillText(text,place(text,x,7*k),y);g.restore()}
function arrow(x0,x1,y){const k=T/24,dir=Math.sign(x1-x0);if(Math.abs(x1-x0)<26*k)return;
 g.save();g.strokeStyle=SLATE;g.fillStyle=SLATE;g.lineWidth=Math.max(2,2*k);
 g.beginPath();g.moveTo(x0+dir*4*k,y);g.lineTo(x1-dir*12*k,y);g.stroke();
 g.beginPath();g.moveTo(x1-dir*3*k,y);g.lineTo(x1-dir*15*k,y-6*k);g.lineTo(x1-dir*15*k,y+6*k);g.closePath();g.fill();g.restore()}
function draw(){const fr=sc.frames[f],[angle,power,tx,flying,px,py,cloud]=fr,k=T/24;
 const done=shots.filter(s=>s.land<=f),cur=done.length-1,last=done[cur];
 const air=flying?shots.find(s=>s.start<=f&&f<s.land):null;
 g.setTransform(1,0,0,1,0,0);g.fillStyle='#d6ebff';g.fillRect(0,0,W,G);g.fillStyle='#efe7d4';g.fillRect(0,G,W,cv.height-G);
 if(sc.game==='lob'){g.fillStyle='#fff';g.beginPath();g.ellipse(cloud,90,46,16,0,0,7);g.ellipse(cloud+30,80,30,14,0,0,7);g.fill();
  const cx=sc.cannonX,a=angle*Math.PI/180;g.strokeStyle=SLATE;g.lineWidth=7;g.lineCap='round';g.beginPath();g.moveTo(cx,G-18);g.lineTo(cx+30*Math.cos(a),G-18-30*Math.sin(a));g.stroke();g.lineCap='butt';
  g.fillStyle='#475569';g.beginPath();g.arc(cx,G-10,12,0,7);g.fill();
  // The flight path: of the shell in the air, or else of the last shot, kept until the next one is fired.
  let a0=-1,a1=-1;if(flying){a1=f;a0=air?air.start:f;while(!air&&a0>0&&sc.frames[a0-1][3])a0--}else if(last){a0=last.start;a1=last.land-1}
  if(a1>=a0&&a0>=0){const d=Math.max(3,3*k);g.fillStyle='rgba(51,65,85,.5)';for(let i=a1;i>=a0;i-=3)if(sc.frames[i][3])g.fillRect(sc.frames[i][4]-d/2,G-sc.frames[i][5]-d/2,d,d)}}
 done.slice(-5,-1).forEach(s=>mark(s,false));
 if(last)mark(last,true);
 // Where the flag was: for the shell in the air, at firing; for the last shot landed, at firing
 // and at landing, kept until the next shot is fired.
 const yLand=G-48-24*k,yFired=yLand-T*1.3;
 if(moving&&air){outline(air.was,true);tag('flag when fired',air.was,yFired,true)}
 else if(moving&&last&&!flying){outline(last.was,true);outline(last.flag,false);arrow(last.was,last.flag,G-48-11*k);
  tag('flag when fired',last.was,yFired,true);tag('flag at landing',last.flag,yLand,false)}
 g.fillStyle='#475569';g.fillRect(tx-1,G-48,2,48);g.fillStyle='#e5484d';g.fillRect(tx+1,G-48,20,13);
 if(sc.game==='lob'&&flying){g.fillStyle='#0f172a';g.beginPath();g.arc(px,G-py,Math.max(5,4*k),0,7);g.fill()}
 $('status').textContent=line(f)||'\\u00a0';
 $('hits').textContent=done.filter(s=>s.hit).length;$('shots').textContent=done.length;$('keys').textContent=last?last.keys:0;$('frame').textContent=f+' of '+end();$('seek').value=f;
 if(cur!==shown){shown=cur;
  $('last').textContent=last?'Shot '+(cur+1)+' of '+shots.length+': '+last.result+'. Angle '+one(last.angle)+', power '+last.power+', landed at '+one(last.x)+' paces with the flag at '+one(last.flag)+'.'
   +(moving?' The flag was at '+one(last.was)+' when the shot was fired'+(last.moved==='0.0'?' and had not moved when the shell landed.':' and moved '+last.moved.replace(' ',' paces ')+' while the shell flew.'):'')
   :'No shot has landed yet. Press Play, or Next shot to step.';
  for(const r of $('rows').querySelectorAll('tr[data-k]')){const now=Number(r.dataset.k)===cur;r.classList.toggle('now',now);if(now)r.setAttribute('aria-current','true');else r.removeAttribute('aria-current')}}}
function fit(){const w=cv.clientWidth||W,t=Math.round(Math.max(24,Math.min(46,13*W/w)));if(t!==T)T=t;draw()}
// The table scrolls sideways inside its own box when it is wider than the page, and says so.
function wide(){const w=$('wrap'),over=w.scrollWidth>w.clientWidth+2;$('cue').hidden=!over;
 if(over){w.tabIndex=0;w.setAttribute('role','region');w.setAttribute('aria-label','Table of every shot, scrolls sideways')}
 else{if(document.activeElement!==w)w.removeAttribute('tabindex');w.removeAttribute('role');w.removeAttribute('aria-label')}}
function stop(){playing=false;clearTimeout(timer);$('play').textContent=f>=end()?'Replay':'Play'}
// Animated play: frames advance with the clock. With reduced motion asked for, Play
// instead jumps from one landing to the next on a timer and draws nothing in between.
function run(now){if(!playing||calm.matches)return;acc+=speed*Math.max(0,Math.min(100,now-then))*.06;then=now;const n=Math.floor(acc);acc-=n;f=Math.min(end(),f+n);draw();if(f>=end())stop();else requestAnimationFrame(run)}
function hop(){if(!playing)return;const s=shots.find(s=>s.land>f);f=s?s.land:end();draw();if(!s||f>=end())stop();else timer=setTimeout(hop,{1:3000,4:1500,16:700}[speed])}
$('play').onclick=()=>{if(playing){stop();return}if(f>=end())f=0;playing=true;$('play').textContent='Pause';
 if(calm.matches)hop();else{acc=0;then=performance.now();requestAnimationFrame(run)}};
$('next').onclick=()=>{const s=shots.find(s=>s.land>f);stop();if(s)f=s.land;$('play').textContent='Play';draw()};
$('prev').onclick=()=>{const s=[...shots].reverse().find(s=>s.land<f);stop();f=s?s.land:0;$('play').textContent='Play';draw()};
$('seek').oninput=e=>{f=Number(e.target.value);stop();draw()};
$('scene').onchange=e=>{pick(Number(e.target.value));stop();draw()};
for(const b of document.querySelectorAll('.speed'))b.onclick=()=>{speed=Number(b.dataset.s);document.querySelectorAll('.speed').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))};
const quiet=()=>{$('motion').hidden=!calm.matches;if(playing)stop()};calm.addEventListener('change',quiet);quiet();
pick(0);{const h=location.hash.match(/^#(?:(\\d+):)?(\\d+)$/);if(h){if(h[1]){pick(Math.min(D.scenes.length-1,Number(h[1])));$('scene').value=D.scenes.indexOf(sc)}f=Math.min(end(),Number(h[2]))}}
addEventListener('resize',()=>{fit();wide()});if(window.ResizeObserver)new ResizeObserver(fit).observe(cv);fit();
</script></body></html>
`;
}
