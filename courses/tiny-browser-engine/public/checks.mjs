import {tokenize,parseCSS,uaRules,copy,defaults,load,flush,click,stable} from './supplier.mjs';
export const specimen=()=>({root:1,nextId:5,revision:0,nodes:[
 {id:1,kind:'element',tag:'main',attrs:{id:'root',class:[]},parent:null,children:[2,4],span:null},
 {id:2,kind:'element',tag:'div',attrs:{id:'card',class:['card']},parent:1,children:[3],span:null},
 {id:3,kind:'text',text:'AB CD',parent:2,children:[],span:null},
 {id:4,kind:'element',tag:'button',attrs:{id:'button',class:[]},parent:1,children:[],span:null}
]});
export function directStyles(doc,overrides={}){return Object.fromEntries(doc.nodes.filter(n=>n.kind==='element').map(n=>[n.id,{values:{...defaults,display:n.tag==='span'?'inline':'block',...(overrides[n.id]??{})},provenance:{},matched:[]}]))}
const eq=(actual,expected)=>stable(actual)===stable(expected);
export function checkStage(engine,unit){
 const results=[];
 function test(id,requirement,input,expected,execute){
  try{const actual=execute();results.push({id,requirement,input,expected,actual,passed:eq(actual,expected),section:unit});}
  catch(error){results.push({id,requirement,input,expected,actual:{error:error.message,code:error.code??'engine_error'},passed:false,section:unit});}
 }
 if(unit==='M1'){
  test('dom-order','Construct one ordered main tree.','main > div > text; then button',['main','div','text','button'],()=>engine.buildDOM(tokenize('<main><div>A</div><button></button></main>')).nodes.map(n=>n.kind==='text'?'text':n.tag));
  test('move-id','A move preserves identity and removes the old relationship.','Move text 3 from div 2 to root 1',[1,[2,4,3],[]],()=>{const d=specimen();engine.mutate(d,{kind:'move',nodeId:3,parentId:1});return[d.nodes.find(n=>n.id===3).parent,d.nodes[0].children,d.nodes[1].children]});
  test('cycle-atomic','Reject a cycle without changing the document.','Move card 2 beneath its text descendant; no change permitted',true,()=>{const d=specimen(),before=stable(d);const r=engine.mutate(d,{kind:'move',nodeId:2,parentId:3});return r.status==='rejected'&&stable(d)===before});
  test('noop','Appending the last child is a no-op.','Move last child 4 to the end of root',['noop',0],()=>{const d=specimen();const r=engine.mutate(d,{kind:'move',nodeId:4,parentId:1});return[r.status,d.revision]});
  test('duplicate','Reject a connected duplicate ID atomically.','Assign root ID to card',true,()=>{const d=specimen(),before=stable(d);return engine.mutate(d,{kind:'setId',nodeId:2,value:'root'}).status==='rejected'&&stable(d)===before});
  test('element-cycle','Reject a genuine element cycle atomically.','Move card under its new nested div',true,()=>{const d=engine.buildDOM(tokenize('<main><div><div></div></div></main>')),before=stable(d);return engine.mutate(d,{kind:'move',nodeId:2,parentId:3}).status==='rejected'&&stable(d)===before});
  test('detach-reattach','Detachment preserves records and identity.','Remove and reattach card 2',[2,1,[2,4]],()=>{const d=specimen();engine.mutate(d,{kind:'remove',nodeId:2});const handle=d.nodes.find(n=>n.attrs?.id==='card').id;engine.mutate(d,{kind:'insert',nodeId:handle,parentId:1,beforeId:4});return[handle,d.nodes.find(n=>n.id===handle).parent,d.nodes[0].children]});
  test('mismatched-close','Reject malformed tree structure.','main then div closed by main',true,()=>{try{engine.buildDOM(tokenize('<main><div></main></div>'));return false}catch{return true}});
 }
 if(unit==='M2'){
  test('specificity','Compare specificity before source order.','#card red precedes .card blue','#aa0000',()=>engine.styles(specimen(),[...uaRules(),...parseCSS('#card {color:#aa0000} .card {color:#0000aa}')])[2].values.color);
  test('inheritance','Only inherited properties propagate.','Root color red and padding 9px',['#aa0000',0],()=>{const s=engine.styles(specimen(),[...uaRules(),...parseCSS('main {color:#aa0000;padding-left:9px}')]);return[s[2].values.color,s[2].values['padding-left']]});
  test('source-order','The last equal-priority declaration wins.','Two card rules','#005500',()=>engine.styles(specimen(),[...uaRules(),...parseCSS('.card {color:#aa0000} .card {color:#005500}')])[2].values.color);
  test('child','Child and descendant combinators differ.','Add nested span under card; main > span differs from main span','#005500',()=>{const d=specimen();d.nodes[1].children=[5];d.nodes.push({id:5,kind:'element',tag:'span',attrs:{class:[]},parent:2,children:[3]});d.nodes[2].parent=5;return engine.styles(d,[...uaRules(),...parseCSS('main > span {color:#aa0000} main span {color:#005500}')])[5].values.color});
  test('winning-provenance','Expose the source of a computed winner.','Earlier ID rule defeats later class rule','r1',()=>engine.styles(specimen(),[...uaRules(),...parseCSS('#card {color:#aa0000} .card {color:#0000aa}')])[2].provenance.color.source);
  test('author-origin','Normal author origin wins before specificity.','UA ID red, author universal green','#005500',()=>{const ua=parseCSS('#card {color:#aa0000}').map(r=>({...r,origin:0,id:'ua-special'}));return engine.styles(specimen(),[...uaRules(),...ua,...parseCSS('* {color:#005500}')])[2].values.color});
 }
 if(unit==='M3'){
  test('box-width','Auto width subtracts padding and both borders.','100px available, padding 4 each side, border 2',[6,88,100],()=>{const d=specimen();d.nodes[1].children=[];const v={display:'block','padding-left':4,'padding-right':4,...Object.fromEntries(['top','right','bottom','left'].map(s=>[`border-${s}-width`,2]))};const b=engine.layout(d,directStyles(d,{2:v}),{width:100,height:100,scrollY:0}).boxes.find(b=>b.nodeId===2);return[b.contentX,b.contentWidth,b.width]});
  test('fixed-height','A fixed content height governs following sibling position.','Card content height 12; following button y',12,()=>{const d=specimen();d.nodes[1].children=[];return engine.layout(d,directStyles(d,{2:{height:12}}),{width:100,height:100,scrollY:0}).boxes.find(b=>b.nodeId===4).y});
  test('hidden-box','Hidden subtrees have no boxes.','Hide card',[1,4],()=>{const d=specimen();return engine.layout(d,directStyles(d,{2:{display:'none'}}),{width:100,height:100,scrollY:0}).boxes.map(b=>b.nodeId)});
  test('border-none','Style none uses zero border width.','Uniform 5px border widths with style none',0,()=>{const d=specimen();d.nodes[1].children=[];const sides=Object.fromEntries(['top','right','bottom','left'].flatMap(side=>[[`border-${side}-width`,5],[`border-${side}-style`,'none']]));return engine.layout(d,directStyles(d,{2:sides}),{width:100,height:100,scrollY:0}).boxes.find(b=>b.nodeId===2).border});
 }
 if(unit==='M4'){
  test('exact-fit','A word fitting the remaining width does not wrap.','AB CD in 40px',[20,1],()=>{const d=specimen(),l=engine.layout(d,directStyles(d),{width:40,height:100,scrollY:0});return[l.boxes.find(b=>b.nodeId===2).contentHeight,new Set(l.glyphs.map(g=>g.line)).size]});
  test('wrap','Wrap at spaces and drop line-edge space.','AB CD in 39px',[40,'ABCD'],()=>{const d=specimen(),l=engine.layout(d,directStyles(d),{width:39,height:100,scrollY:0});return[l.boxes.find(b=>b.nodeId===2).contentHeight,l.glyphs.map(g=>g.char).join('')]});
  test('long-word','A zero-width word overflows once instead of looping.','ABCD in 0px content',[20,4],()=>{const d=specimen();d.nodes[2].text='ABCD';const l=engine.layout(d,directStyles(d,{2:{width:0}}),{width:40,height:100,scrollY:0});return[l.boxes.find(b=>b.nodeId===2).contentHeight,l.glyphs.length]});
  test('collapse','Collapse whitespace before line construction.','Leading, repeated, and trailing spaces','AB CD',()=>{const d=specimen();d.nodes[2].text='  AB \n\t CD  ';return engine.layout(d,directStyles(d),{width:100,height:100,scrollY:0}).glyphs.map(g=>g.char).join('')});
  test('inline-boundary','A span boundary does not split a word.','AB then inline CD in a 24px line',[1,'ABCD',32],()=>{const d=engine.buildDOM(tokenize('<main><p>AB<span>CD</span></p></main>')),l=engine.layout(d,directStyles(d),{width:24,height:100,scrollY:0});return[new Set(l.glyphs.map(g=>g.line)).size,l.glyphs.map(g=>g.char).join(''),Math.max(...l.glyphs.map(g=>g.x+g.width))]});
  test('ancestor-strut','An outer inline line-height contributes despite a smaller inner value.','Outer span 40px, inner span 16px',40,()=>{const d=engine.buildDOM(tokenize('<main><p><span><span>A</span></span></p></main>'));return engine.layout(d,directStyles(d,{3:{'line-height':40},4:{'line-height':16}}),{width:80,height:100,scrollY:0}).boxes.find(b=>b.nodeId===2).contentHeight});
 }
 if(unit==='M4'){
  test('inline-separator','Collapse and retain whitespace-only text between inline spans before wrapping.','EF and GH separated by a space/tab node, exact40px and39px widths',[16,'EF GH',32,'EFGH'],()=>{const d=engine.buildDOM(tokenize('<main><p><span>EF</span> \t<span>GH</span></p></main>')),styles=engine.styles(d,[...uaRules(),...parseCSS('p {line-height:16px}')]),wide=engine.layout(d,styles,{width:40,height:80,scrollY:0}),narrow=engine.layout(d,styles,{width:39,height:80,scrollY:0}),p=d.nodes.find(n=>n.tag==='p').id;return[wide.boxes.find(b=>b.nodeId===p).contentHeight,wide.glyphs.map(g=>g.char).join(''),narrow.boxes.find(b=>b.nodeId===p).contentHeight,narrow.glyphs.map(g=>g.char).join('')]});
 }
 if(unit==='M5'){
  const v={width:30,height:30,scrollY:0};
  test('target-order','Later eligible region wins.','Two overlapping regions',2,()=>engine.target({regions:[{x:0,y:0,width:20,height:20,nodeId:1,clip:{x:0,y:0,width:30,height:30}},{x:5,y:5,width:10,height:10,nodeId:2,clip:{x:0,y:0,width:30,height:30}}]},{x:6,y:6},v));
  test('clip-hit','Clipped-out geometry cannot receive input.','Region extends beyond clip',null,()=>engine.target({regions:[{x:0,y:0,width:20,height:20,nodeId:1,clip:{x:5,y:5,width:5,height:5}}]},{x:2,y:2},v));
  test('edge','Far rectangle edge is excluded.','Point x=10 at right edge',null,()=>engine.target({regions:[{x:0,y:0,width:10,height:10,nodeId:1,clip:{x:0,y:0,width:30,height:30}}]},{x:10,y:2},v));
  test('paint','Emit actual opaque background from layout.','One root box and background red','#aa0000',()=>{const d=specimen();d.nodes[0].children=[];const s=directStyles(d,{1:{'background-color':'#aa0000'}});const l={boxes:[{nodeId:1,x:0,y:0,width:20,height:10,border:0,padding:{}}],glyphs:[]};return engine.display(d,s,l,v).commands[0].color});
 }
 if(unit==='M6'){
  const listeners=[{nodeId:1,capture:true,name:'root capture'},{nodeId:2,capture:true,name:'target capture'},{nodeId:2,capture:false,name:'target bubble'},{nodeId:1,capture:false,name:'root bubble'}];
  test('phases','Dispatch capture, target groups, then bubble.','Target card 2',['root capture','target capture','target bubble','root bubble'],()=>{const seen=[];engine.dispatch(specimen(),2,listeners,{bubbles:true,cancelable:true},l=>{seen.push(l.name);return{}});return seen});
  test('cancel','Cancellation does not stop propagation.','First listener cancels',[4,true],()=>{let count=0;const r=engine.dispatch(specimen(),2,listeners,{bubbles:true,cancelable:true},()=>({cancel:++count===1}));return[count,r.canceled]});
  test('same-group','Ordinary stop preserves remaining current-group listeners.','Root capture group has two listeners',['a','b'],()=>{const seen=[];engine.dispatch(specimen(),2,[{nodeId:1,capture:true,name:'a'},{nodeId:1,capture:true,name:'b'},...listeners.slice(1)],{bubbles:true,cancelable:true},l=>{seen.push(l.name);return {stop:l.name==='a'}});return seen});
  test('frozen-path','A listener cannot rewrite the active event path.','Remove target during capture',['capture','target','bubble'],()=>{const d=specimen(),seen=[];engine.dispatch(d,2,[{nodeId:1,capture:true,name:'capture'},{nodeId:2,capture:false,name:'target'},{nodeId:1,capture:false,name:'bubble'}],{bubbles:true,cancelable:true},l=>{seen.push(l.name);if(l.name==='capture'){d.nodes[0].children=[4];d.nodes[1].parent=null}return{}});return seen});
  test('nonbubbling','Non-bubbling events still capture and run both target groups.','bubbles=false',['root capture','target capture','target bubble'],()=>{const seen=[];engine.dispatch(specimen(),2,listeners,{bubbles:false,cancelable:true},l=>{seen.push(l.name);return{}});return seen});
  test('immediate','Immediate stop prevents the rest of the current group.','Two root capture listeners; first stops immediately',['a'],()=>{const seen=[];engine.dispatch(specimen(),2,[{nodeId:1,capture:true,name:'a'},{nodeId:1,capture:true,name:'b'}],{bubbles:true,cancelable:true},l=>{seen.push(l.name);return{immediate:true}});return seen});
  test('noncancelable','A noncancelable event cannot become canceled.','Listener returns cancel with cancelable=false',false,()=>engine.dispatch(specimen(),2,listeners,{bubbles:true,cancelable:false},()=>({cancel:true})).canceled);
 }
 if(unit==='M7'){
  test('noop-stages','No-op skips every stage.','No-op plan',[false,false,false],()=>{const a=engine.invalidation({phase:'before',type:'noop'}),b=engine.invalidation({phase:'after',type:'noop'});return[a.restyle,b.layout,b.paint]});
  test('color-stages','Paint-only effect preserves layout.','Class change changes only color',[true,false,true],()=>{const a=engine.invalidation({phase:'before',type:'mutation'}),b=engine.invalidation({phase:'after',type:'mutation',geometryChanged:false,paintChanged:true,structureChanged:false,textChanged:false});return[a.restyle,b.layout,b.paint]});
  test('scroll-stages','Scroll preserves document style and layout.','Scroll plan',[false,false,true],()=>{const a=engine.invalidation({phase:'before',type:'scroll'}),b=engine.invalidation({phase:'after',type:'scroll'});return[a.restyle,b.layout,b.paint]});
  test('topology-stages','A move invalidates layout even if styles match.','Topology change with same computed values',true,()=>engine.invalidation({phase:'after',type:'mutation',geometryChanged:false,structureChanged:true}).layout);
 }
 if(unit==='M7'){
  test('resize-reflow','A viewport-width change recomputes geometry even if styles match.','AB CD fits 40px, then wraps after resizing to 39px',[40,16,39,32,true],()=>{const s=load(engine,{html:'<main><p>AB CD</p><button>Next</button></main>',css:'p {line-height:16px} button {height:16px}',viewport:{width:40,height:120,scrollY:0}});flush(engine,s);const root=s.doc.root,button=s.doc.nodes.find(n=>n.tag==='button').id;const beforeWidth=s.frame.layout.boxes.find(b=>b.nodeId===root).width,beforeY=s.frame.layout.boxes.find(b=>b.nodeId===button).y,calls=s.counters.layout;s.viewport={...s.viewport,width:39};flush(engine,s,{type:'resize'});return[beforeWidth,beforeY,s.frame.layout.boxes.find(b=>b.nodeId===root).width,s.frame.layout.boxes.find(b=>b.nodeId===button).y,s.counters.layout>calls]});
 }
 if(unit==='M8'){
  test('transfer-inherit','A new grouping ancestor changes inherited text color.','Fresh page: main > group > button and note',['#112233','#aa4422'],()=>{const p={html:'<main><div id="group"><button id="switch">Change</button><p>Unfamiliar note</p></div></main>',css:'#group {color:#112233} #group.active {color:#aa4422}',listeners:[{id:'switch',action:[{kind:'toggleClass',id:'group',className:'active'}]}],viewport:{width:112,height:160,scrollY:0}};const s=load(engine,p);flush(engine,s);const note=s.doc.nodes.find(n=>n.tag==='p');const before=s.frame.styles[note.id].values.color;click(engine,s,{targetId:s.doc.nodes.find(n=>n.tag==='button').id});return[before,s.frame.styles[note.id].values.color]});
  test('transfer-layout','Text mutation updates later geometry in the same engine.','Fresh long note pushes following button',true,()=>{const s=load(engine,{html:'<main><p id="note">A</p><button>Next</button></main>',css:'',viewport:{width:40,height:200,scrollY:0}});flush(engine,s);const button=s.doc.nodes.find(n=>n.tag==='button'),text=s.doc.nodes.find(n=>n.kind==='text');const before=s.frame.layout.boxes.find(b=>b.nodeId===button.id).y;engine.mutate(s.doc,{kind:'setText',nodeId:text.id,text:'AB CD EF GH'});flush(engine,s,{type:'text'});return s.frame.layout.boxes.find(b=>b.nodeId===button.id).y>before});
  test('transfer-replay','Clean rebuild matches incremental geometry and paint.','Change color, compare to fresh evaluation',true,()=>{const p={html:'<main><div id="x">A B C</div></main>',css:'#x.active {color:#aa0000}',viewport:{width:56,height:120,scrollY:0}};const s=load(engine,p);flush(engine,s);engine.mutate(s.doc,{kind:'setClasses',nodeId:2,classes:['active']});flush(engine,s,{type:'mutation'});const fresh=load(engine,p);engine.mutate(fresh.doc,{kind:'setClasses',nodeId:2,classes:['active']});flush(engine,fresh);return eq(s.frame.layout,fresh.frame.layout)&&eq(s.frame.display,fresh.frame.display)});
 }
 if(!results.length)throw Error(`Unknown module ${unit}.`);
 return {unit,passed:results.every(r=>r.passed),results,scope:'Public finite practice checks. A pass is not certification or evidence of human learning.'};
}
