// Original supplied infrastructure. Browser-engine decisions are learner callbacks.
const PROFILE = 'TBE-1-local-0.1';
const LIMITS = Object.freeze({nodes:512,depth:32,rules:128,text:32768,packet:262144,commands:16384,width:1024,height:768,extent:32768});
const fail = (code, message, detail={}) => { throw Object.assign(new Error(message), {code, detail}); };
const copy = value => structuredClone(value);
const node = (doc,id) => doc.nodes.find(n=>n.id===id) ?? fail('unknown_handle',`Node ${id} does not exist.`);
const connected = (doc,id) => {
  const seen=new Set(); let n=node(doc,id);
  while(n.parent!==null){ if(seen.has(n.id))return false; seen.add(n.id); n=node(doc,n.parent); }
  return n.id===doc.root;
};
const tags = new Set(['main','div','p','span','button']);
const identifier = /^[A-Za-z_][A-Za-z0-9_-]*$/;
function textValue(value){
  if(typeof value!=='string'||value.length>LIMITS.text||/[^\x09\x0a\x0d\x20-\x7e]/.test(value))fail('unsupported_character','Use printable ASCII text, spaces, tabs or line breaks.');
  return value;
}
function decode(s){
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  return textValue(s.replace(/&([^;\s]*);|&/g,(all,name)=>entities[name]??fail('unsupported_entity',`Unsupported entity ${all}.`)));
}
function tokenize(html){
  if(typeof html!=='string'||html.length>LIMITS.packet)fail('packet_limit','HTML is missing or exceeds the packet limit.');
  const result=[]; let pos=0;
  while(pos<html.length){
    const start=pos;
    if(html[pos]!=='<'){
      let end=html.indexOf('<',pos); if(end<0)end=html.length;
      result.push({kind:'text',text:decode(html.slice(pos,end)),span:[start,end]}); pos=end; continue;
    }
    const end=html.indexOf('>',pos); if(end<0)fail('packet_syntax','Unclosed tag.',{offset:pos});
    const raw=html.slice(pos+1,end); pos=end+1;
    const closing=/^\/([a-z]+)\s*$/.exec(raw);
    if(closing){ if(!tags.has(closing[1]))fail('unsupported_tag',`Unsupported tag ${closing[1]}.`); result.push({kind:'end',tag:closing[1],span:[start,pos]}); continue; }
    const match=/^([a-z]+)([\s\S]*)$/.exec(raw);
    if(!match||!tags.has(match[1]))fail('unsupported_tag',`Use main, div, p, span or button.`,{offset:start});
    const attrs={}; let rest=match[2];
    while(rest.trim()){
      const attr=/^\s+(id|class)\s*=\s*("[^"]*"|'[^']*')/.exec(rest);
      if(!attr)fail('packet_syntax','Only quoted id and class attributes are supported.',{offset:start});
      if(Object.hasOwn(attrs,attr[1]))fail('packet_syntax','Duplicate attribute.',{offset:start});
      const value=attr[2].slice(1,-1);
      const words=value.trim().split(/\s+/).filter(Boolean);
      if(words.some(w=>!identifier.test(w))||(attr[1]==='id'&&words.length!==1))fail('invalid_value','IDs/classes must be ASCII identifiers.');
      attrs[attr[1]]=attr[1]==='class'?[...new Set(words)]:words[0]; rest=rest.slice(attr[0].length);
    }
    result.push({kind:'start',tag:match[1],attrs,span:[start,pos]});
  }
  return result;
}
const sides=['top','right','bottom','left'];
const defaults=Object.freeze(Object.fromEntries([
  ['display','inline'],['width','auto'],['height','auto'],['color','#000000'],['background-color','transparent'],['line-height',20],['overflow','visible'],
  ...sides.flatMap(s=>[[`padding-${s}`,0],[`border-${s}-width`,0],[`border-${s}-style`,'solid'],[`border-${s}-color`,'#000000']])
]));
const geometryProperties = ['display','width','height','line-height',...sides.flatMap(s=>[`padding-${s}`,`border-${s}-width`,`border-${s}-style`])];
function valueFor(property,raw){
  if(!Object.hasOwn(defaults,property))fail('unsupported_property',`Unsupported property ${property}.`);
  const v=raw.trim();
  if(['width','height'].includes(property)&&v==='auto')return v;
  if(['width','height','line-height'].includes(property)||property.startsWith('padding-')||property.endsWith('-width')){
    if(!/^\d+px$/.test(v))fail('invalid_value',`${property} needs nonnegative integer px.`);
    const n=Number(v.slice(0,-2)); if(n>LIMITS.extent||(property==='line-height'&&n<16))fail('invalid_value',`${property} is out of range.`); return n;
  }
  if(property==='display'&&['block','inline','none'].includes(v))return v;
  if(property==='overflow'&&['visible','hidden'].includes(v))return v;
  if(property.endsWith('-style')&&['solid','none'].includes(v))return v;
  if((property==='color'||property.endsWith('-color'))&&/^#[0-9a-fA-F]{6}$/.test(v))return v.toLowerCase();
  if(property==='background-color'&&v==='transparent')return v;
  fail('invalid_value',`Unsupported value ${v} for ${property}.`);
}
function parseSelector(source){
  const parts=[]; let pos=0, relation=null;
  while(pos<source.length){
    const ws=/^\s+/.exec(source.slice(pos)); if(ws){pos+=ws[0].length;if(parts.length)relation='descendant';}
    if(pos===source.length)break;
    if(source[pos]==='>'){
      if(!parts.length||parts.at(-1).pending)fail('selector_syntax','Misplaced child combinator.');
      relation='child';pos++; const space=/^\s*/.exec(source.slice(pos))[0];pos+=space.length;
    }
    const atoms=[];
    while(pos<source.length&&!/[\s>]/.test(source[pos])){
      const m=/^(\*|[.#]?[A-Za-z_][A-Za-z0-9_-]*)/.exec(source.slice(pos));
      if(!m)fail('unsupported_selector',`Unsupported selector near ${source.slice(pos)}.`);
      const token=m[0]; const type=token==='*'?'universal':token[0]==='.'?'class':token[0]==='#'?'id':'tag';
      if((type==='tag'||type==='universal')&&atoms.length)fail('selector_syntax','Type selector must begin a compound.');
      atoms.push({type,value:['class','id'].includes(type)?token.slice(1):token});pos+=token.length;
    }
    if(!atoms.length)fail('selector_syntax','Missing selector after combinator.');
    parts.push({atoms,relation:parts.length?relation:null});relation=null;
  }
  if(!parts.length)fail('selector_syntax','Empty selector.');return parts;
}
function parseCSS(css){
  if(typeof css!=='string'||css.length>LIMITS.packet)fail('packet_limit','Stylesheet exceeds limit.');
  const rules=[];let pos=0;
  while(css.slice(pos).trim()){
    const open=css.indexOf('{',pos),close=css.indexOf('}',open+1);
    if(open<0||close<0)fail('css_syntax','Each rule needs { declarations }.');
    const selector=css.slice(pos,open).trim();const body=css.slice(open+1,close);
    const parts=parseSelector(selector);const declarations=[];
    for(const line of body.split(';').filter(s=>s.trim())){
      const m=/^\s*([a-z-]+)\s*:\s*([^:]+?)\s*$/.exec(line);
      if(!m)fail('css_syntax',`Invalid declaration ${line}.`);
      declarations.push({property:m[1],value:valueFor(m[1],m[2]),order:declarations.length});
    }
    rules.push({id:`r${rules.length+1}`,origin:1,order:rules.length,selector,parts,declarations});pos=close+1;
    if(rules.length>LIMITS.rules)fail('rule_limit','Too many style rules.');
  }
  return rules;
}
const uaRules=()=>parseCSS('main {display:block} div {display:block} p {display:block} button {display:block}').map((r,i)=>({...r,id:`ua${i}`,origin:0}));
const intersect=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return{x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)};};
const inside=(r,x,y)=>r.width>0&&r.height>0&&x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height;
function validateViewport(v){
  if(!v||!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<1||v.height<1||v.width>LIMITS.width||v.height>LIMITS.height||!Number.isInteger(v.scrollY??0)||(v.scrollY??0)<0||(v.scrollY??0)>LIMITS.extent)fail('viewport','Invalid integer viewport.');
  return {width:v.width,height:v.height,scrollY:v.scrollY??0};
}
const support={LIMITS,fail,copy,node,connected,tags,identifier,textValue,defaults,geometryProperties,intersect,inside};
const required=['buildDOM','mutate','styles','layout','display','target','dispatch','invalidation'];
function compile(body){
  if(typeof body!=='string'||body.length>131072)fail('source_limit','Source must fit within 128 KiB.');
  const engine=new Function('support',`"use strict";\n${body}`)(support);
  for(const name of required)if(typeof engine?.[name]!=='function')fail('interface',`Return an engine with ${name}().`);
  return engine;
}
function load(engine,packet){
  if(!packet||typeof packet.html!=='string'||typeof packet.css!=='string')fail('packet','Supply html and css strings.');
  if(JSON.stringify(packet).length>LIMITS.packet)fail('packet_limit','Whole packet exceeds 256 KiB.');
  for(const key of ['listeners','defaultActions'])if(packet[key]!==undefined&&(!Array.isArray(packet[key])||packet[key].length>128))fail('binding_limit',`${key} must be an array of at most 128 bindings.`);
  const viewport=validateViewport(packet.viewport??{width:640,height:480,scrollY:0});
  const doc=engine.buildDOM(tokenize(packet.html));const rules=[...uaRules(),...parseCSS(packet.css)];
  const bind=l=>{
    if(!l||typeof l.id!=='string'||!identifier.test(l.id)||!Array.isArray(l.action)||l.action.length>64)fail('listener_binding','A binding needs an element ID and at most 64 actions.');
    const n=doc.nodes.find(n=>n.kind==='element'&&n.attrs.id===l.id);if(!n)fail('listener_binding',`Missing listener ID ${l.id}.`);
    return {...copy(l),nodeId:n.id};
  };
  const bindings=(packet.listeners??[]).map(bind),defaultActions=(packet.defaultActions??[]).map(bind);
  return {doc,rules,viewport,bindings,defaultActions,packet:copy(packet),frame:null,frameId:0,stale:true,counters:{styles:0,layout:0,display:0},events:[]};
}
function flush(engine,session,change={type:'initial'}){
  const trace={change:copy(change),documentRevision:session.doc.revision,viewport:copy(session.viewport),steps:[]};session.lastFlush=trace;
  const compute=(stage,fn)=>{const step={stage,status:'running'};trace.steps.push(step);session.counters[stage]++;try{const value=fn();step.status='computed';return value;}catch(error){step.status='failed';step.code=error.code??'engine_error';throw error;}};
  try{
    const prev=session.frame;
    const pre=engine.invalidation({phase:'before',...change});
    let styles=prev?.styles;
    const restyled=!prev||!!pre.restyle;
    if(restyled)styles=compute('styles',()=>engine.styles(session.doc,session.rules));else trace.steps.push({stage:'styles',status:'reused'});
    const old=prev?.styles??{};let geometryChanged=false,paintChanged=false;
    for(const [id,s]of Object.entries(styles??{})){
      if(!old[id]){geometryChanged=true;paintChanged=true;continue;}
      if(geometryProperties.some(p=>s.values[p]!==old[id].values[p]))geometryChanged=true;
      if(JSON.stringify(s.values)!==JSON.stringify(old[id].values))paintChanged=true;
    }
    if(Object.keys(old).length!==Object.keys(styles??{}).length)geometryChanged=true;
    const shape=JSON.stringify(session.doc.nodes.filter(n=>connected(session.doc,n.id)).map(n=>[n.id,n.parent,n.children]));
    const textSignature=JSON.stringify(session.doc.nodes.filter(n=>connected(session.doc,n.id)&&n.kind==='text').map(n=>[n.id,n.text]));
    const post=engine.invalidation({phase:'after',...change,geometryChanged,paintChanged,structureChanged:prev?.shape!==shape,textChanged:prev?.textSignature!==textSignature});
    trace.decisions={before:pre,after:post,geometryChanged,paintChanged,structureChanged:prev?.shape!==shape,textChanged:prev?.textSignature!==textSignature};
    let layout=prev?.layout,display=prev?.display;
    const laidOut=!prev||!!post.layout,painted=!prev||!!post.paint;
    if(laidOut)layout=compute('layout',()=>engine.layout(session.doc,styles,session.viewport));else trace.steps.push({stage:'layout',status:'reused'});
    if(painted)display=compute('display',()=>engine.display(session.doc,styles,layout,session.viewport));else trace.steps.push({stage:'display',status:'reused'});
    if(!styles||!layout||!display)fail('schedule','Invalidation omitted a required product.');
    const version=(stage,computed)=>({generation:(prev?.stages?.[stage]?.generation??0)+(computed?1:0),builtAtDocumentRevision:computed?session.doc.revision:prev.stages[stage].builtAtDocumentRevision,validatedForDocumentRevision:session.doc.revision,computedThisFrame:computed,viewportDependency:stage==='layout'?{width:session.viewport.width}:stage==='display'?copy(session.viewport):null});
    const stages={styles:version('styles',restyled),layout:version('layout',laidOut),display:version('display',painted)};trace.status='published';
    session.frame={id:++session.frameId,documentRevision:session.doc.revision,viewport:copy(session.viewport),shape,textSignature,styles,layout,display,stages,schedule:copy(trace)};
    session.stale=false;session.error=null;return session.frame;
  }catch(error){trace.status='failed';session.stale=true;session.error={code:error.code??'engine_error',message:error.message};throw error;}
}
function runAction(engine,session,action){
  const flags={stop:false,immediate:false,cancel:false};
  for(const command of action??[]){
    if(command.kind==='stop'){flags.stop=true;continue;}
    if(command.kind==='immediate'){flags.immediate=true;flags.stop=true;continue;}
    if(command.kind==='cancel'){flags.cancel=true;continue;}
    let op=copy(command);
    if(op.id){const n=session.doc.nodes.find(n=>n.attrs?.id===op.id&&connected(session.doc,n.id));if(!n)fail('action_target',`Missing connected action target ${op.id}.`);op.nodeId=n.id;delete op.id;}
    if(op.kind==='toggleClass'){const n=node(session.doc,op.nodeId),classes=n.attrs.class??[];op={kind:'setClasses',nodeId:n.id,classes:classes.includes(op.className)?classes.filter(c=>c!==op.className):[...classes,op.className]};}
    const result=engine.mutate(session.doc,op);if(result.status==='applied')session.stale=true;logEvent(session,{kind:'mutation',operation:op,result});
    if(result.status==='rejected'){flags.error=result;break;}
  }
  return flags;
}
function click(engine,session,{x,y,targetId}={}){
  if(session.stale||!session.frame)fail('stale_input','Render the current document before activating the page.');
  const target=targetId??engine.target(session.frame.display,{x,y:y+session.viewport.scrollY},session.viewport);
  if(target===null)return {target:null,trace:[],canceled:false};
  if(!connected(session.doc,target))fail('detached_target','The activation target is detached.');
  const revision=session.doc.revision;
  const result=engine.dispatch(session.doc,target,session.bindings,{bubbles:true,cancelable:true},listener=>runAction(engine,session,listener.action));
  logEvent(session,{kind:'dispatch',target,...result});
  if(!result.canceled)for(const action of session.defaultActions??[]){if(action.nodeId!==target)continue;const outcome=runAction(engine,session,action.action);if(outcome.error)result.defaultFailed=true;logEvent(session,{kind:'default-action',target,outcome});}
  flush(engine,session,{type:session.doc.revision===revision?'noop':'mutation'});return result;
}
function logEvent(session,event){if(session.events.length>=512)fail('event_limit','This run reached 512 trace events. Export the trace and render a fresh session.');session.events.push(event);}
function applyOperation(engine,session,operation){
 if(!session.frame)fail('stale_input','Establish an initial frame before interactive mutation.');
 const repairing=session.stale;
 const result=engine.mutate(session.doc,copy(operation));if(result.status==='applied')session.stale=true;logEvent(session,{kind:'operation',operation:copy(operation),result});
 flush(engine,session,{type:repairing?'initial':result.status==='applied'?(operation.kind==='setText'?'text':'mutation'):'noop'});return result;
}
const stable=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
async function digest(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}

// Original hand-specified 5x7 diagnostic glyphs in an 8x16 cell.
// Lowercase uses the explicit corresponding small-cap glyph; no native font fallback.
const FONT_ID='tbe-original-smallcaps-5x7-v1';
const p={
 A:'01110/10001/10001/11111/10001/10001/10001',B:'11110/10001/10001/11110/10001/10001/11110',C:'01111/10000/10000/10000/10000/10000/01111',
 D:'11110/10001/10001/10001/10001/10001/11110',E:'11111/10000/10000/11110/10000/10000/11111',F:'11111/10000/10000/11110/10000/10000/10000',
 G:'01111/10000/10000/10111/10001/10001/01111',H:'10001/10001/10001/11111/10001/10001/10001',I:'11111/00100/00100/00100/00100/00100/11111',
 J:'00111/00010/00010/00010/10010/10010/01100',K:'10001/10010/10100/11000/10100/10010/10001',L:'10000/10000/10000/10000/10000/10000/11111',
 M:'10001/11011/10101/10101/10001/10001/10001',N:'10001/11001/11001/10101/10011/10011/10001',O:'01110/10001/10001/10001/10001/10001/01110',
 P:'11110/10001/10001/11110/10000/10000/10000',Q:'01110/10001/10001/10001/10101/10010/01101',R:'11110/10001/10001/11110/10100/10010/10001',
 S:'01111/10000/10000/01110/00001/00001/11110',T:'11111/00100/00100/00100/00100/00100/00100',U:'10001/10001/10001/10001/10001/10001/01110',
 V:'10001/10001/10001/10001/10001/01010/00100',W:'10001/10001/10001/10101/10101/11011/10001',X:'10001/10001/01010/00100/01010/10001/10001',
 Y:'10001/10001/01010/00100/00100/00100/00100',Z:'11111/00001/00010/00100/01000/10000/11111',
 '0':'01110/10001/10011/10101/11001/10001/01110','1':'00100/01100/00100/00100/00100/00100/01110','2':'01110/10001/00001/00010/00100/01000/11111',
 '3':'11110/00001/00001/01110/00001/00001/11110','4':'00010/00110/01010/10010/11111/00010/00010','5':'11111/10000/10000/11110/00001/00001/11110',
 '6':'01110/10000/10000/11110/10001/10001/01110','7':'11111/00001/00010/00100/01000/01000/01000','8':'01110/10001/10001/01110/10001/10001/01110','9':'01110/10001/10001/01111/00001/00001/01110',
 ' ':'00000/00000/00000/00000/00000/00000/00000','!':'00100/00100/00100/00100/00100/00000/00100','"':'01010/01010/01010/00000/00000/00000/00000',
 '#':'01010/01010/11111/01010/11111/01010/01010','$':'00100/01111/10100/01110/00101/11110/00100','%':'11001/11010/00100/00100/01000/10110/00110',
 '&':'01100/10010/10100/01000/10101/10010/01101',"'":'00100/00100/01000/00000/00000/00000/00000','(':'00010/00100/01000/01000/01000/00100/00010',')':'01000/00100/00010/00010/00010/00100/01000',
 '*':'00000/10101/01110/11111/01110/10101/00000','+':'00000/00100/00100/11111/00100/00100/00000',',':'00000/00000/00000/00000/00110/00100/01000','-':'00000/00000/00000/11111/00000/00000/00000',
 '.':'00000/00000/00000/00000/00000/00110/00110','/':'00001/00010/00010/00100/01000/01000/10000',':':'00000/00110/00110/00000/00110/00110/00000',';':'00000/00110/00110/00000/00110/00100/01000',
 '<':'00010/00100/01000/10000/01000/00100/00010','=':'00000/00000/11111/00000/11111/00000/00000','>':'01000/00100/00010/00001/00010/00100/01000','?':'01110/10001/00001/00010/00100/00000/00100',
 '@':'01110/10001/10111/10101/10111/10000/01111','[':'01110/01000/01000/01000/01000/01000/01110','\\':'10000/01000/01000/00100/00010/00010/00001',']':'01110/00010/00010/00010/00010/00010/01110',
 '^':'00100/01010/10001/00000/00000/00000/00000','_':'00000/00000/00000/00000/00000/00000/11111','`':'01000/00100/00010/00000/00000/00000/00000',
 '{':'00011/00100/00100/01000/00100/00100/00011','|':'00100/00100/00100/00100/00100/00100/00100','}':'11000/00100/00100/00010/00100/00100/11000','~':'00000/00000/01001/10110/00000/00000/00000'
};
for(let c=97;c<=122;c++)p[String.fromCharCode(c)]=p[String.fromCharCode(c-32)];
const glyphs=Object.freeze(Object.fromEntries(Object.entries(p).map(([c,rows])=>[c,rows.split('/').map(r=>parseInt(r,2))])));

const rgb=s=>{if(!/^#[0-9a-f]{6}$/i.test(s))fail('raster_color','Use #RRGGBB colors.');return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16));};
function validRect(r){if(!r||!['x','y','width','height'].every(k=>Number.isSafeInteger(r[k]))||r.width<0||r.height<0)fail('raster_geometry','Raster rectangles must have integer coordinates and nonnegative extents.');}
function raster(display,rawViewport){
  const v=validateViewport(rawViewport),output=new Uint8ClampedArray(v.width*v.height*4).fill(255);
  if(!Array.isArray(display?.commands)||display.commands.length>LIMITS.commands)fail('command_limit','Invalid display command count.');
  const viewport={x:0,y:v.scrollY,width:v.width,height:v.height};
  function rect(r,color,clip){
    validRect(r);validRect(clip);const bounds=intersect(intersect(r,clip),viewport),c=rgb(color);
    for(let y=bounds.y;y<bounds.y+bounds.height;y++)for(let x=bounds.x;x<bounds.x+bounds.width;x++){
      const i=((y-v.scrollY)*v.width+x)*4;output[i]=c[0];output[i+1]=c[1];output[i+2]=c[2];output[i+3]=255;
    }
  }
  for(const cmd of display.commands){
    if(cmd.kind==='rect'){rect(cmd,cmd.color,cmd.clip);continue;}
    if(cmd.kind!=='glyph')fail('raster_command','Unknown display command.');
    if(!Number.isInteger(cmd.x)||!Number.isInteger(cmd.y)||!Object.hasOwn(glyphs,cmd.char))fail('raster_glyph','Glyph position or supplied glyph is invalid.');
    const rows=glyphs[cmd.char];for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(rows[y]&(1<<(4-x)))rect({x:cmd.x+x+1,y:cmd.y+y*2+1,width:1,height:2},cmd.color,cmd.clip);
  }
  return output;
}

const specimen=()=>({root:1,nextId:5,revision:0,nodes:[
 {id:1,kind:'element',tag:'main',attrs:{id:'root',class:[]},parent:null,children:[2,4],span:null},
 {id:2,kind:'element',tag:'div',attrs:{id:'card',class:['card']},parent:1,children:[3],span:null},
 {id:3,kind:'text',text:'AB CD',parent:2,children:[],span:null},
 {id:4,kind:'element',tag:'button',attrs:{id:'button',class:[]},parent:1,children:[],span:null}
]});
function directStyles(doc,overrides={}){return Object.fromEntries(doc.nodes.filter(n=>n.kind==='element').map(n=>[n.id,{values:{...defaults,display:n.tag==='span'?'inline':'block',...(overrides[n.id]??{})},provenance:{},matched:[]}]))}
const eq=(actual,expected)=>stable(actual)===stable(expected);
function checkStage(engine,unit){
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
  const thrown=f=>{try{f();return 'accepted'}catch(e){if(e?.code==='not_implemented')return 'not_implemented';return typeof e?.code==='string'&&e.code!=='engine_error'&&!(e instanceof TypeError)&&!(e instanceof RangeError)?'diagnostic':'crash'}};
  test('mismatched-close','Reject malformed tree structure with a located diagnostic.','main then div closed by main; also without the trailing </div>',['diagnostic','diagnostic'],()=>[thrown(()=>engine.buildDOM(tokenize('<main><div></main></div>'))),thrown(()=>engine.buildDOM(tokenize('<main><div></main>')))]);
  // CONTRACT.md:23 buildDOM rejections and whitespace retention.
  test('unclosed','Reject an element still open at end of input.','main > div never closed','diagnostic',()=>thrown(()=>engine.buildDOM(tokenize('<main><div></div>'))));
  test('multiple-roots','Reject a second root element.','two main roots','diagnostic',()=>thrown(()=>engine.buildDOM(tokenize('<main></main><main></main>'))));
  test('root-not-main','Reject a root other than main.','div as root','diagnostic',()=>thrown(()=>engine.buildDOM(tokenize('<div></div>'))));
  test('text-outside-root','Reject non-whitespace outside the root.','x after main','diagnostic',()=>thrown(()=>engine.buildDOM(tokenize('<main></main>x'))));
  test('build-duplicate-id','Reject duplicate connected HTML IDs during construction.','div#a and p#a','diagnostic',()=>thrown(()=>engine.buildDOM(tokenize('<main><div id="a"></div><p id="a"></p></main>'))));
  test('whitespace-kept','Keep whitespace text inside the tree.','div containing one space',['main','div','text:" "'],()=>engine.buildDOM(tokenize('<main><div> </div></main>')).nodes.map(n=>n.kind==='text'?'text:'+JSON.stringify(n.text):n.tag));
  // CONTRACT.md:37 no-op list.
  test('noop-before-self','Inserting before itself is a no-op.','Move card 2 before itself',['noop',0,[2,4]],()=>{const d=specimen();const r=engine.mutate(d,{kind:'move',nodeId:2,parentId:1,beforeId:2});return[r.status,d.revision,d.nodes[0].children]});
  test('noop-remove-detached','Removing an already detached node is a no-op.','Remove card 2 twice',['applied','noop',1],()=>{const d=specimen();const a=engine.mutate(d,{kind:'remove',nodeId:2}),b=engine.mutate(d,{kind:'remove',nodeId:2});return[a.status,b.status,d.revision]});
  // CONTRACT.md:34 setText requires a text node; CONTRACT.md:37 rejections are atomic.
  test('settext-element','setText on an element is rejected without change.','setText on card 2',true,()=>{const d=specimen(),before=stable(d);return engine.mutate(d,{kind:'setText',nodeId:2,text:'x'}).status==='rejected'&&stable(d)===before});
  test('bad-anchor','A non-child anchor is rejected without change.','Move button 4 into card 2 before root 1, which is not a child of card',true,()=>{const d=specimen(),before=stable(d);return engine.mutate(d,{kind:'move',nodeId:4,parentId:2,beforeId:1}).status==='rejected'&&stable(d)===before});
  test('attach-id-collision','Attaching a detached subtree with a connected ID is rejected.','Create div, give it id "card" while detached, attach under root',['applied','applied','rejected',null],()=>{const d=specimen();const c=engine.mutate(d,{kind:'createElement',tag:'div'});const s=engine.mutate(d,{kind:'setId',nodeId:c.created,value:'card'});const before=stable(d);const r=engine.mutate(d,{kind:'insert',nodeId:c.created,parentId:1});return[c.status,s.status,r.status,stable(d)===before?null:'changed']});
  // CONTRACT.md:37 resource limits; detached records count toward the node budget (LIMITS.nodes is 512 in this profile).
  test('node-budget','Detached records count toward the node budget.','Create detached text nodes up to 512 records, then one more',['applied','rejected',512],()=>{const d=specimen();let last;for(let i=d.nodes.length;i<512;i++)last=engine.mutate(d,{kind:'createText',text:'x'});const over=engine.mutate(d,{kind:'createText',text:'x'});return[last.status,over.status,d.nodes.length]});
  test('move-depth-limit','A move that exceeds the depth limit is rejected without change.','Two 20-deep div chains; move one under the other (limit 32)',true,()=>{const chain='<div>'.repeat(20)+'</div>'.repeat(20);const d=engine.buildDOM(tokenize('<main>'+chain+chain+'</main>'));const tops=d.nodes[0].children.filter(id=>d.nodes.find(n=>n.id===id).kind==='element');let deep=tops[0];for(;;){const n=d.nodes.find(x=>x.id===deep);const next=n.children.find(id=>d.nodes.find(x=>x.id===id).kind==='element');if(next===undefined)break;deep=next;}const before=stable(d);return engine.mutate(d,{kind:'move',nodeId:tops[1],parentId:deep}).status==='rejected'&&stable(d)===before});
 }
 if(unit==='M2'){
  test('specificity','Compare specificity before source order.','#card red precedes .card blue','#aa0000',()=>engine.styles(specimen(),[...uaRules(),...parseCSS('#card {color:#aa0000} .card {color:#0000aa}')])[2].values.color);
  test('inheritance','Only inherited properties propagate.','Root color red and padding 9px',['#aa0000',0],()=>{const s=engine.styles(specimen(),[...uaRules(),...parseCSS('main {color:#aa0000;padding-left:9px}')]);return[s[2].values.color,s[2].values['padding-left']]});
  test('source-order','The last equal-priority declaration wins.','Two card rules','#005500',()=>engine.styles(specimen(),[...uaRules(),...parseCSS('.card {color:#aa0000} .card {color:#005500}')])[2].values.color);
  test('child','Child and descendant combinators differ.','Add nested span under card; main > span differs from main span','#005500',()=>{const d=specimen();d.nodes[1].children=[5];d.nodes.push({id:5,kind:'element',tag:'span',attrs:{class:[]},parent:2,children:[3]});d.nodes[2].parent=5;return engine.styles(d,[...uaRules(),...parseCSS('main > span {color:#aa0000} main span {color:#005500}')])[5].values.color});
  test('winning-provenance','Expose the source of a computed winner.','Earlier ID rule defeats later class rule','r1',()=>engine.styles(specimen(),[...uaRules(),...parseCSS('#card {color:#aa0000} .card {color:#0000aa}')])[2].provenance.color.source);
  test('author-origin','Normal author origin wins before specificity.','UA ID red, author universal green','#005500',()=>{const ua=parseCSS('#card {color:#aa0000}').map(r=>({...r,origin:0,id:'ua-special'}));return engine.styles(specimen(),[...uaRules(),...ua,...parseCSS('* {color:#005500}')])[2].values.color});
  // CONTRACT.md:45 lexicographic [ID,class,type] counts, then rule and declaration order.
  test('specificity-columns','Specificity compares columns; eleven classes do not beat one ID.','#card before an 11-class rule','#aa0000',()=>{const d=specimen();d.nodes[1].attrs.class=['a','b','c','d','e','f','g','h','i','j','k'];return engine.styles(d,[...uaRules(),...parseCSS('#card {color:#aa0000} .a.b.c.d.e.f.g.h.i.j.k {color:#0000aa}')])[2].values.color});
  test('declaration-order','Within one rule the later declaration wins.','Two color declarations in one rule','#005500',()=>engine.styles(specimen(),[...uaRules(),...parseCSS('.card {color:#aa0000; color:#005500}')])[2].values.color);
  // CONTRACT.md:41 relation child vs descendant.
  test('child-only','A child combinator does not match a grandchild.','main > span with span under card','#000000',()=>{const d=specimen();d.nodes[1].children=[5];d.nodes.push({id:5,kind:'element',tag:'span',attrs:{class:[]},parent:2,children:[3]});d.nodes[2].parent=5;return engine.styles(d,[...uaRules(),...parseCSS('main > span {color:#aa0000}')])[5].values.color});
  // CONTRACT.md:43 include all connected elements, even under display none; matched lists matching rule IDs.
  test('hidden-styled','Elements under display none still receive style records.','card hidden; nested span',true,()=>{const d=specimen();d.nodes[1].children=[5];d.nodes.push({id:5,kind:'element',tag:'span',attrs:{class:[]},parent:2,children:[3]});d.nodes[2].parent=5;const s=engine.styles(d,[...uaRules(),...parseCSS('.card {display:none}')]);return s[5]!==undefined&&s[5].values.display==='inline'});
  test('matched-ids','matched lists every matching rule ID.','card matched by UA div rule and two author rules',['r1','r2','ua1'],()=>[...engine.styles(specimen(),[...uaRules(),...parseCSS('#card {color:#aa0000} div {padding-left:1px} p {color:#0000aa}')])[2].matched].sort());
  // CONTRACT.md:45 keep auto symbolic.
  test('auto-symbolic','Computed width and height keep auto symbolic.','Default height and explicit width:auto',['auto','auto'],()=>{const s=engine.styles(specimen(),[...uaRules(),...parseCSS('.card {width:auto}')]);return[s[2].values.width,s[2].values.height]});
  // Lesson M2 section 1 (content.mjs): a class selector checks class membership. Not stated in CONTRACT.md; see PROPOSAL.md.
  test('class-membership','A class atom tests membership, not a substring.','Rule .car against class card','#000000',()=>engine.styles(specimen(),[...uaRules(),...parseCSS('.car {color:#aa0000}')])[2].values.color);
 }
 if(unit==='M3'){
  test('box-width','Auto width subtracts padding and both borders.','100px available, padding 4 each side, border 2',[6,88,100],()=>{const d=specimen();d.nodes[1].children=[];const v={display:'block','padding-left':4,'padding-right':4,...Object.fromEntries(['top','right','bottom','left'].map(s=>[`border-${s}-width`,2]))};const b=engine.layout(d,directStyles(d,{2:v}),{width:100,height:100,scrollY:0}).boxes.find(b=>b.nodeId===2);return[b.contentX,b.contentWidth,b.width]});
  test('fixed-height','A fixed content height governs following sibling position.','Card content height 12; following button y',12,()=>{const d=specimen();d.nodes[1].children=[];return engine.layout(d,directStyles(d,{2:{height:12}}),{width:100,height:100,scrollY:0}).boxes.find(b=>b.nodeId===4).y});
  test('hidden-box','Hidden subtrees have no boxes.','Hide card',[1,4],()=>{const d=specimen();return engine.layout(d,directStyles(d,{2:{display:'none'}}),{width:100,height:100,scrollY:0}).boxes.map(b=>b.nodeId)});
  test('border-none','Style none uses zero border width.','Uniform 5px border widths with style none',0,()=>{const d=specimen();d.nodes[1].children=[];const sides=Object.fromEntries(['top','right','bottom','left'].flatMap(side=>[[`border-${side}-width`,5],[`border-${side}-style`,'none']]));return engine.layout(d,directStyles(d,{2:sides}),{width:100,height:100,scrollY:0}).boxes.find(b=>b.nodeId===2).border});
  // CONTRACT.md:53 auto width floored at zero; explicit height does not grow.
  const thrown=f=>{try{f();return 'accepted'}catch(e){if(e?.code==='not_implemented')return 'not_implemented';return typeof e?.code==='string'&&e.code!=='engine_error'&&!(e instanceof TypeError)&&!(e instanceof RangeError)?'diagnostic':'crash'}};
  test('width-floor','Auto content width is floored at zero.','100px available, padding 60 each side',0,()=>{const d=specimen();d.nodes[1].children=[];return engine.layout(d,directStyles(d,{2:{'padding-left':60,'padding-right':60}}),{width:100,height:100,scrollY:0}).boxes.find(b=>b.nodeId===2).contentWidth});
  test('fixed-height-overflow','An explicit height does not grow with overflowing text.','Card height 4 containing one 20px line',[4,4],()=>{const d=specimen();const l=engine.layout(d,directStyles(d,{2:{height:4}}),{width:100,height:100,scrollY:0});const b=l.boxes.find(b=>b.nodeId===2);return[b.contentHeight,l.boxes.find(b=>b.nodeId===4).y]});
  // CONTRACT.md:51 uniform borders, otherwise unsupported geometry.
  test('nonuniform-border','Non-uniform border widths are reported as unsupported geometry.','Top border 3, others 1','diagnostic',()=>thrown(()=>{const d=specimen();d.nodes[1].children=[];engine.layout(d,directStyles(d,{2:{'border-top-width':3,'border-right-width':1,'border-bottom-width':1,'border-left-width':1}}),{width:100,height:100,scrollY:0})}));
  // CONTRACT.md:53 reject visible mixed block/inline content and block content inside an inline element.
  test('mixed-content','Visible mixed block and inline content is rejected.','main with text and a block div','diagnostic',()=>thrown(()=>{const d=engine.buildDOM(tokenize('<main>x<div></div></main>'));engine.layout(d,directStyles(d),{width:100,height:100,scrollY:0})}));
  test('block-in-inline','Block content inside an inline element is rejected.','span containing a block div','diagnostic',()=>thrown(()=>{const d=engine.buildDOM(tokenize('<main><p><span><div></div></span></p></main>'));engine.layout(d,directStyles(d),{width:100,height:100,scrollY:0})}));
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
  // CONTRACT.md:57 collapse across inline boundaries; keep the first whitespace's source.
  test('collapse-across','Whitespace collapses across inline boundaries and keeps the first source.','"AB " then span " CD"',['AB CD',3,2],()=>{const d=engine.buildDOM(tokenize('<main><p>AB <span> CD</span></p></main>'));const l=engine.layout(d,directStyles(d),{width:100,height:100,scrollY:0});const sp=l.glyphs.find(g=>g.char===' ');return[l.glyphs.map(g=>g.char).join(''),sp.nodeId,sp.offset]});
  // CONTRACT.md:57 center 16-pixel glyph cells vertically with odd spare space below.
  test('glyph-centering','Glyphs are centred with odd spare space below.','line-height 21: spare 5, 2 above',[2,21],()=>{const d=specimen();const l=engine.layout(d,directStyles(d,{2:{'line-height':21}}),{width:100,height:100,scrollY:0});const b=l.boxes.find(b=>b.nodeId===2);return[l.glyphs[0].y-b.contentY,b.contentHeight]});
  // CONTRACT.md:57 no line for whitespace-only content.
  test('whitespace-only','Whitespace-only content makes no line.','card text of three spaces',[0,0],()=>{const d=specimen();d.nodes[2].text='   ';const l=engine.layout(d,directStyles(d),{width:100,height:100,scrollY:0});return[l.boxes.find(b=>b.nodeId===2).contentHeight,l.glyphs.length]});
  // CONTRACT.md:55 nodeId/offset locate the original decoded text.
  test('glyph-offset','Glyph nodeId and offset point into the original text node.','AB then span CD: glyph C',[5,0],()=>{const d=engine.buildDOM(tokenize('<main><p>AB<span>CD</span></p></main>'));const g=engine.layout(d,directStyles(d),{width:100,height:100,scrollY:0}).glyphs.find(g=>g.char==='C');return[g.nodeId,g.offset]});
  // CONTRACT.md:53 a hidden subtree generates no geometry (inline case).
  test('hidden-inline','A hidden inline subtree produces no glyphs.','AB then hidden span CD','AB',()=>{const d=engine.buildDOM(tokenize('<main><p>AB<span>CD</span></p></main>'));return engine.layout(d,directStyles(d,{4:{display:'none'}}),{width:100,height:100,scrollY:0}).glyphs.map(g=>g.char).join('')});
 }
 // ---- Public checks. Fixtures are written by hand so that one module's cases do not
 // depend on the learner's earlier methods. Each case quotes the CONTRACT.md rule it enforces.
 // Same half-open membership as support.inside, repeated here so that the import line is not touched.
 const inside=(r,x,y)=>r.width>0&&r.height>0&&x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height;
 const zero=()=>({top:0,right:0,bottom:0,left:0});
 const pad=(top,right,bottom,left)=>({'padding-top':top,'padding-right':right,'padding-bottom':bottom,'padding-left':left});
 const borders=(width,color='#000000')=>Object.fromEntries(['top','right','bottom','left'].flatMap(s=>[[`border-${s}-width`,width],[`border-${s}-style`,'solid'],[`border-${s}-color`,color]]));
 // True when the call is refused by the engine itself: it throws, and not because the method is still a stub.
 const refuses=run=>{try{run();return false}catch(error){return error?.code!=='not_implemented'}};
 const element=(id,tag,parent,children,attrs={})=>({id,kind:'element',tag,attrs:{class:[],...attrs},parent,children,span:null});
 const textNode=(id,text,parent)=>({id,kind:'text',text,parent,children:[],span:null});
 const tree=(...nodes)=>({root:1,nextId:nodes.length+1,revision:0,nodes});
 // main 1 > div#card 2 > span 3 > "AB" 4, with a hand-written layout: card border box (4,4) 30x24, border 2.
 const paintDoc=()=>tree(element(1,'main',null,[2],{id:'root'}),element(2,'div',1,[3],{id:'card'}),element(3,'span',2,[4]),textNode(4,'AB',3));
 const paintLayout=()=>({height:40,boxes:[
  {nodeId:1,x:0,y:0,width:60,height:40,contentX:4,contentY:4,contentWidth:52,contentHeight:32,border:0,padding:{top:4,right:4,bottom:4,left:4}},
  {nodeId:2,x:4,y:4,width:30,height:24,contentX:6,contentY:6,contentWidth:26,contentHeight:20,border:2,padding:zero()}],
  glyphs:[0,1].map(i=>({char:'AB'[i],nodeId:4,offset:i,ownerId:3,blockId:2,line:0,x:6+8*i,y:8,width:8,height:16,ancestors:[3]}))});
 const paintStyles=(d,card={})=>directStyles(d,{1:{'background-color':'#eeeeee',...pad(4,4,4,4)},2:{'background-color':'#aa0000',color:'#111111',...borders(2,'#0000aa'),...card},3:{color:'#005500'}});
 const paintView={width:60,height:40,scrollY:0};
 // The colour the rect commands leave at a point, by painter order and clip. Glyphs are not consulted.
 const shown=(commands,x,y)=>{let color=null;for(const c of commands)if(c.kind==='rect'&&inside(c,x,y)&&inside(c.clip,x,y))color=c.color;return color};
 // The node a point reaches in a region list, independent of the learner's target().
 const reached=(regions,x,y)=>{let id=null;for(const r of regions)if(inside(r,x,y)&&inside(r.clip,x,y))id=r.nodeId;return id};
 // specimen plus a span 5 under the card, so a target has two ancestors.
 const deep=()=>{const d=specimen();d.nodes[1].children=[3,5];d.nodes.push(element(5,'span',2,[]));d.nextId=6;return d};
 const chain=()=>[{nodeId:1,capture:false,name:'b1'},{nodeId:5,capture:false,name:'t2'},{nodeId:2,capture:true,name:'c2'},{nodeId:2,capture:false,name:'b2'},{nodeId:1,capture:true,name:'c1'},{nodeId:5,capture:true,name:'t1'}];
 const ordinary={bubbles:true,cancelable:true};
 if(unit==='M5'){
  const v={width:30,height:30,scrollY:0};
  test('target-order','Later eligible region wins.','Two overlapping regions',2,()=>engine.target({regions:[{x:0,y:0,width:20,height:20,nodeId:1,clip:{x:0,y:0,width:30,height:30}},{x:5,y:5,width:10,height:10,nodeId:2,clip:{x:0,y:0,width:30,height:30}}]},{x:6,y:6},v));
  test('clip-hit','Clipped-out geometry cannot receive input.','Region extends beyond clip',null,()=>engine.target({regions:[{x:0,y:0,width:20,height:20,nodeId:1,clip:{x:5,y:5,width:5,height:5}}]},{x:2,y:2},v));
  test('edge','Far rectangle edge is excluded.','Point x=10 at right edge',null,()=>engine.target({regions:[{x:0,y:0,width:10,height:10,nodeId:1,clip:{x:0,y:0,width:30,height:30}}]},{x:10,y:2},v));
  test('paint','Emit actual opaque background from layout.','One root box and background red','#aa0000',()=>{const d=specimen();d.nodes[0].children=[];const s=directStyles(d,{1:{'background-color':'#aa0000'}});const l={boxes:[{nodeId:1,x:0,y:0,width:20,height:10,border:0,padding:{}}],glyphs:[]};return engine.display(d,s,l,v).commands[0].color});
  // (a) display: "Emit block background and border before descendants. The background fills the border box. Border strips must not leave gaps."
  test('paint-rects','Backgrounds fill border boxes in painter order; border strips leave no gap.','Grey root; red card at (4,4) 30x24 with a 2px blue border: colour outside the card twice, then the count of border pixels not blue and of inner pixels not red',['#eeeeee','#eeeeee',0,0],()=>{const d=paintDoc(),c=engine.display(d,paintStyles(d),paintLayout(),paintView).commands;let ring=0,inner=0;for(let x=4;x<34;x++)for(let y=4;y<28;y++){const edge=x<6||x>=32||y<6||y>=26;if(shown(c,x,y)!==(edge?'#0000aa':'#aa0000'))edge?ring++:inner++}return[shown(c,1,1),shown(c,34,28),ring,inner]});
  // "{kind:'glyph',char,x,y,color,...}"; a glyph stores "geometry and ownership, not cached paint color", so display takes the colour from its owner element.
  test('paint-glyphs','Emit one glyph command per fragment, coloured by its owner element, after the block rectangles.','AB owned by a green span inside the red card',[[['A',6,8,'#005500'],['B',14,8,'#005500']],true],()=>{const d=paintDoc(),c=engine.display(d,paintStyles(d),paintLayout(),paintView).commands,g=c.filter(x=>x.kind==='glyph');return[g.map(x=>[x.char,x.x,x.y,x.color]),c.findIndex(x=>x.kind==='glyph')>c.map(x=>x.kind).lastIndexOf('rect')&&c.some(x=>x.kind==='rect')]});
  // "An overflow-hidden element clips descendants at its padding edge, not its own border."
  test('paint-clip','An overflow-hidden block clips its descendants at its padding edge and is not clipped by itself.','Card overflow hidden: clip of each glyph, then the colour at the card corner (4,4)',[[{x:6,y:6,width:26,height:20},{x:6,y:6,width:26,height:20}],'#0000aa'],()=>{const d=paintDoc(),c=engine.display(d,paintStyles(d,{overflow:'hidden'}),paintLayout(),paintView).commands;return[c.filter(x=>x.kind==='glyph').map(x=>({x:x.clip.x,y:x.clip.y,width:x.clip.width,height:x.clip.height})),shown(c,4,4)]});
  // "Intersect with ancestor/viewport clips."
  test('paint-clip-viewport','A clip is intersected with the viewport.','Same card, overflow hidden, in a viewport only 20px wide: clip of the first glyph',{x:6,y:6,width:14,height:20},()=>{const d=paintDoc(),g=engine.display(d,paintStyles(d,{overflow:'hidden'}),paintLayout(),{width:20,height:40,scrollY:0}).commands.find(x=>x.kind==='glyph');return{x:g.clip.x,y:g.clip.y,width:g.clip.width,height:g.clip.height}});
  // "transparent background emits no fill."
  test('paint-transparent','A transparent background emits no fill.','No background and no border anywhere',0,()=>{const d=paintDoc(),l=paintLayout();l.boxes[1].border=0;return engine.display(d,directStyles(d),l,paintView).commands.filter(x=>x.kind==='rect').length});
  // "Export block border boxes and inline glyph/fragment intervals, including transparent regions. A glyph region targets ownerId."
  test('regions','Regions cover block border boxes and glyphs, transparent or not; a glyph region targets its owner.','Transparent card; probes: root, card border, glyph, card beyond the text, outside',[1,2,3,2,null],()=>{const d=paintDoc(),r=engine.display(d,paintStyles(d,{'background-color':'transparent'}),paintLayout(),paintView).regions;return[[1,1],[5,5],[7,10],[28,10],[70,10]].map(([x,y])=>reached(r,x,y))});
  // "changing one border color can make borders nonuniform without a geometry change ... Reject rather than silently approximating it."
  test('paint-profile','Painting refuses a visible nonuniform border even when the geometry is reused.','Same layout; left border colour differs from the other three',true,()=>refuses(()=>{const d=paintDoc();engine.display(d,paintStyles(d,{'border-left-color':'#00aa00'}),paintLayout(),paintView)}));
  // target: "Enforce viewport bounds too. Left/top edges are included; right/bottom excluded; zero-area rectangles contain no point."
  const view={width:30,height:30,scrollY:0},wide={x:0,y:0,width:100,height:100};
  test('viewport-hit','A point outside the viewport reaches nothing.','Region and clip 100px wide, viewport 30px, point x=40',null,()=>engine.target({regions:[{x:0,y:0,width:100,height:20,nodeId:1,clip:wide}]},{x:40,y:2},view));
  test('bottom-and-empty','The bottom edge is excluded and a zero-width region contains no point.','y=10 on a 10px-high region; then x=5 on a zero-width region at x=5',[null,null],()=>[engine.target({regions:[{x:0,y:0,width:10,height:10,nodeId:1,clip:wide}]},{x:2,y:10},view),engine.target({regions:[{x:5,y:0,width:0,height:10,nodeId:1,clip:wide}]},{x:5,y:2},view)]);
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
  // (b) "Visit ancestor capture groups root-first, target capture, target noncapture, then ancestor noncapture groups nearest-first".
  test('ancestor-order','With two ancestors, capture runs root-first and bubble nearest-first.','Target span 5 under card 2 under root 1; listeners registered out of order',['c1','c2','t1','t2','b2','b1'],()=>{const seen=[];engine.dispatch(deep(),5,chain(),ordinary,l=>{seen.push(l.name);return{}});return seen});
  // "Build the initial target-to-root path"; "Return {path,trace,canceled,failed}; each trace row names target, currentTarget, phase"; "Both target groups report phase target".
  test('path-and-trace','Return the target-to-root path and one trace row per callback with its phase.','Same dispatch; read path, then target/currentTarget/phase of each row, then failed',[[5,2,1],[[5,1,'capture'],[5,2,'capture'],[5,5,'target'],[5,5,'target'],[5,2,'bubble'],[5,1,'bubble']],false],()=>{const r=engine.dispatch(deep(),5,chain(),ordinary,()=>({}));return[r.path,r.trace.map(row=>[row.target,row.currentTarget,row.phase]),r.failed]});
  // "Catch a callback failure into evidence; it must not look like a successful dispatch."
  test('callback-failure','A callback that throws is recorded as a failed dispatch, not thrown onward.','Listener c2 throws',true,()=>{try{return engine.dispatch(deep(),5,chain(),ordinary,l=>{if(l.name==='c2')throw Error('listener broke');return{}}).failed===true}catch{return false}});
  // "Stop prevents later groups ... Immediate stop also ends the current group."
  test('immediate-later-groups','Immediate stop also prevents every later group.','First of two root capture listeners stops immediately; later groups exist',['a'],()=>{const seen=[];engine.dispatch(deep(),5,[{nodeId:1,capture:true,name:'a'},{nodeId:1,capture:true,name:'b'},...chain()],ordinary,l=>{seen.push(l.name);return{immediate:l.name==='a'}});return seen});
 }
 if(unit==='M7'){
  test('noop-stages','No-op skips every stage.','No-op plan',[false,false,false],()=>{const a=engine.invalidation({phase:'before',type:'noop'}),b=engine.invalidation({phase:'after',type:'noop'});return[a.restyle,b.layout,b.paint]});
  test('color-stages','Paint-only effect preserves layout.','Class change changes only color',[true,false,true],()=>{const a=engine.invalidation({phase:'before',type:'mutation'}),b=engine.invalidation({phase:'after',type:'mutation',geometryChanged:false,paintChanged:true,structureChanged:false,textChanged:false});return[a.restyle,b.layout,b.paint]});
  test('scroll-stages','Scroll preserves document style and layout.','Scroll plan',[false,false,true],()=>{const a=engine.invalidation({phase:'before',type:'scroll'}),b=engine.invalidation({phase:'after',type:'scroll'});return[a.restyle,b.layout,b.paint]});
  test('topology-stages','A move invalidates layout even if styles match.','Topology change with same computed values',true,()=>engine.invalidation({phase:'after',type:'mutation',geometryChanged:false,structureChanged:true}).layout);
 }
 if(unit==='M7'){
  test('resize-reflow','A viewport-width change recomputes geometry even if styles match.','AB CD fits 40px, then wraps after resizing to 39px',[40,16,39,32,true],()=>{const s=load(engine,{html:'<main><p>AB CD</p><button>Next</button></main>',css:'p {line-height:16px} button {height:16px}',viewport:{width:40,height:120,scrollY:0}});flush(engine,s);const root=s.doc.root,button=s.doc.nodes.find(n=>n.tag==='button').id;const beforeWidth=s.frame.layout.boxes.find(b=>b.nodeId===root).width,beforeY=s.frame.layout.boxes.find(b=>b.nodeId===button).y,calls=s.counters.layout;s.viewport={...s.viewport,width:39};flush(engine,s,{type:'resize'});return[beforeWidth,beforeY,s.frame.layout.boxes.find(b=>b.nodeId===root).width,s.frame.layout.boxes.find(b=>b.nodeId===button).y,s.counters.layout>calls]});
  // (c) "Initial load requires all stages. A text or structure change and a viewport-width resize require layout and paint."
  const after=(type,flags)=>{const r=engine.invalidation({phase:'after',type,geometryChanged:false,paintChanged:false,structureChanged:false,textChanged:false,...flags});return[r.layout,r.paint]};
  test('geometry-stages','A computed geometry change lays out and paints.','Mutation; geometryChanged only',[true,true],()=>after('mutation',{geometryChanged:true}));
  test('structure-paints','Layout after a structure change is followed by paint.','Mutation; structureChanged only, computed values equal',[true,true],()=>after('mutation',{structureChanged:true}));
  test('text-stages','A text change lays out and paints.','Text change; textChanged only',[true,true],()=>after('text',{textChanged:true}));
  test('initial-stages','Initial load requires every stage.','Initial plan',[true,true,true],()=>[engine.invalidation({phase:'before',type:'initial'}).restyle,...after('initial',{geometryChanged:true,paintChanged:true,structureChanged:true,textChanged:true})]);
 }
 if(unit==='M8'){
  test('transfer-inherit','A new grouping ancestor changes inherited text color.','Fresh page: main > group > button and note',['#112233','#aa4422'],()=>{const p={html:'<main><div id="group"><button id="switch">Change</button><p>Unfamiliar note</p></div></main>',css:'#group {color:#112233} #group.active {color:#aa4422}',listeners:[{id:'switch',action:[{kind:'toggleClass',id:'group',className:'active'}]}],viewport:{width:112,height:160,scrollY:0}};const s=load(engine,p);flush(engine,s);const note=s.doc.nodes.find(n=>n.tag==='p');const before=s.frame.styles[note.id].values.color;click(engine,s,{targetId:s.doc.nodes.find(n=>n.tag==='button').id});return[before,s.frame.styles[note.id].values.color]});
  test('transfer-layout','Text mutation updates later geometry in the same engine.','Fresh long note pushes following button',true,()=>{const s=load(engine,{html:'<main><p id="note">A</p><button>Next</button></main>',css:'',viewport:{width:40,height:200,scrollY:0}});flush(engine,s);const button=s.doc.nodes.find(n=>n.tag==='button'),text=s.doc.nodes.find(n=>n.kind==='text');const before=s.frame.layout.boxes.find(b=>b.nodeId===button.id).y;engine.mutate(s.doc,{kind:'setText',nodeId:text.id,text:'AB CD EF GH'});flush(engine,s,{type:'text'});return s.frame.layout.boxes.find(b=>b.nodeId===button.id).y>before});
  test('transfer-replay','Clean rebuild matches incremental geometry and paint.','Change color, compare to fresh evaluation',true,()=>{const p={html:'<main><div id="x">A B C</div></main>',css:'#x.active {color:#aa0000}',viewport:{width:56,height:120,scrollY:0}};const s=load(engine,p);flush(engine,s);engine.mutate(s.doc,{kind:'setClasses',nodeId:2,classes:['active']});flush(engine,s,{type:'mutation'});const fresh=load(engine,p);engine.mutate(fresh.doc,{kind:'setClasses',nodeId:2,classes:['active']});flush(engine,fresh);return eq(s.frame.layout,fresh.frame.layout)&&eq(s.frame.display,fresh.frame.display)});
  // (e) end to end with the learner's own styles(), layout(), display(), target(), dispatch() and invalidation().
  test('transfer-pointer','A pointer click travels through regions, hit testing, dispatch, restyle and repaint.','Fresh padded page; click one pixel inside the first glyph of the button; read the note\'s painted colour before and after',[10,'#112233',true,'#aa4422'],()=>{const s=load(engine,{html:'<main><div id="group"><button id="switch">Go</button><p>Note</p></div></main>',css:'main {padding-left:6px;padding-top:6px} #group {color:#112233} #group.active {color:#aa4422} button {padding-top:4px;padding-left:4px}',listeners:[{id:'switch',action:[{kind:'toggleClass',id:'group',className:'active'}]}],viewport:{width:120,height:160,scrollY:0}});flush(engine,s);const button=s.doc.nodes.find(n=>n.tag==='button').id,note=s.doc.nodes.find(n=>n.tag==='p').id;const painted=()=>{const g=s.frame.layout.glyphs.find(g=>g.blockId===note);return s.frame.display.commands.find(c=>c.kind==='glyph'&&c.x===g.x&&c.y===g.y)?.color};const g=s.frame.layout.glyphs.find(g=>g.blockId===button),before=painted();const r=click(engine,s,{x:g.x+1,y:g.y+1});return[g.x,before,r.path?.[0]===button,painted()]});
  test('transfer-border','A border and padding from the stylesheet reach layout and paint.','Fresh page: main padding 5px; div with a 3px border; colour at the div\'s corner and just inside it',[[5,5],'#0000aa','#ffeecc'],()=>{const s=load(engine,{html:'<main><div id="box">Hi</div></main>',css:'main {padding-top:5px;padding-left:5px} #box {background-color:#ffeecc;border-top-width:3px;border-right-width:3px;border-bottom-width:3px;border-left-width:3px;border-top-color:#0000aa;border-right-color:#0000aa;border-bottom-color:#0000aa;border-left-color:#0000aa}',viewport:{width:80,height:80,scrollY:0}});flush(engine,s);const b=s.frame.layout.boxes.find(b=>b.nodeId===s.doc.nodes.find(n=>n.attrs?.id==='box').id);return[[b.x,b.y],shown(s.frame.display.commands,5,5),shown(s.frame.display.commands,8,8)]});
 }
 if(!results.length)throw Error(`Unknown module ${unit}.`);
 return {unit,passed:results.every(r=>r.passed),results,scope:'Public finite practice checks. A pass is not certification or evidence of human learning.'};
}


// Supplier-owned fixtures contain data, not implementations of learner stages.
const blockPacket={name:'M3 block geometry bench',html:'<main><div id="header"></div><div id="card"></div><button id="next"></button></main>',css:'main {padding-left:8px;padding-right:8px} #header {height:20px;background-color:#cbdde5} #card {height:36px;padding-top:4px;padding-bottom:4px;background-color:#e8bc73} #next {height:16px;background-color:#286273}',viewport:{width:160,height:120,scrollY:0}};
function inspectStage(engine,unit,packet){
 const number=Number(unit.slice(1));if(number<1||number>8)throw Error('Unknown stage.');
 if(number>=7){const s=load(engine,packet);flush(engine,s);return {unit,stage:'scheduled frame',input:packet,doc:s.doc,styles:s.frame.styles,layout:s.frame.layout,display:s.frame.display,viewport:s.viewport,counters:s.counters};}
 const viewport=validateViewport(packet.viewport),tokens=tokenize(packet.html),doc=engine.buildDOM(tokens);
 const result={unit,stage:'document',input:packet,tokens,doc,viewport};if(number===1)return result;
 const rules=[...uaRules(),...parseCSS(packet.css)];result.styles=engine.styles(doc,rules);result.stage='computed styles';if(number===2)return result;
 result.layout=engine.layout(doc,result.styles,viewport);result.stage='layout';if(number<=4)return result;
 result.display=engine.display(doc,result.styles,result.layout,viewport);result.stage='display';if(number===5)return result;
 // M6 uses a simple full rebuild after dispatch. The learner replaces this
 // scheduling policy in M7; no invalidation answer is supplied here.
 const session={doc,events:[]},bindings=(packet.listeners??[]).map(l=>({...copy(l),nodeId:doc.nodes.find(n=>n.attrs?.id===l.id)?.id}));
 if(bindings.some(l=>l.nodeId===undefined))throw Error('Packet listener has no matching element.');
 if(bindings.length){const target=bindings[0].nodeId;result.event=engine.dispatch(doc,target,bindings,{bubbles:true,cancelable:true},l=>runAction(engine,session,l.action));if(!result.event.canceled)for(const action of packet.defaultActions??[]){if(doc.nodes.find(n=>n.attrs?.id===action.id)?.id===target)runAction(engine,session,action.action);}result.mutations=session.events;result.styles=engine.styles(doc,rules);result.layout=engine.layout(doc,result.styles,viewport);result.display=engine.display(doc,result.styles,result.layout,viewport);result.stage='one activation and full rebuild';}
 return result;
}

const projects={
 M1:{title:'An owned, editable tree',steps:['Build the strict tree from the packet tokens. Print each handle, parent and ordered children.','Create a detached note, attach it, then move it. Preserve its handle and show both changed parent lists.','Attempt a cycle and a duplicate ID. Preserve before/after snapshots showing rejection is atomic.'],evidence:'A tree snapshot, operation results, and one repaired failing case. The inspector runs buildDOM alone.',failure:'Detach before validating the destination; demonstrate what becomes lost, then repair the ordering.'},
 M2:{title:'An explainable style decision',steps:['Add selector matching and declaration priority to your existing tree.','Make a high-specificity rule appear before a lower-specificity rule. Explain the winner from its provenance.','Change an ancestor class and show inherited color changing in a nested span. Keep padding uninherited.'],evidence:'Computed values with a winning-source record for each property, plus an inheritance example.',failure:'Use source order as the only priority, or copy every parent property. Choose an input that exposes the mistake.'},
 M3:{title:'A geometry-only reference board',steps:['Use the supplied empty-box packet in the stage inspector. Implement block widths and sibling positions.','Add padding and a uniform border. Predict the content origin and outside width before inspecting.','Set a fixed height smaller than future content. Preserve the box height and position the next sibling from that height.'],evidence:'Content and border-box records with explicit expected coordinates. M3 does not require text layout.',failure:'Subtract padding twice, or let a fixed height grow. Repair the shared sizing rule.'},
 M4:{title:'Readable notes with source-owned fragments',steps:['Switch to the guided reference board and add text/inline layout.','Use a 40px and 39px line for AB CD. Predict the boundary decision, then compare actual glyph positions.','Split a word across nested spans, vary line height, and include whitespace between nodes. Retain source offsets.'],evidence:'Lines and glyph fragments tied to the original text node and decoded-text offset.',failure:'Wrap each text node independently or retain a space at a new line. Preserve a minimal reproducer.'},
 M5:{title:'P1 — display commands for a reference page',steps:['Turn your boxes and glyphs into ordered display commands and geometric hit regions.','Inspect your display commands and geometric regions with the M5 stage command. Transparent boxes still require targetable regions.','Clip overflowing text and compare a hit inside the clip with one outside it. Explain the far-edge rule.'],evidence:'At M5, retain stage JSON with the display list and geometric regions. After M7 enables full terminal sessions, add a PNG and a table of at least four actual hit results to complete P1.',failure:'Select hits by pixel opacity or ignore ancestor clipping. Show why the visible image alone is insufficient.'},
 M6:{title:'A reference page that changes when activated',steps:['Add capture, target groups and bubbling over a frozen path. The inspector supplies one activation.','Use the reference-board action to reveal notes, then inspect the changed tree and rebuilt output.','Detach a target during capture; distinguish ordinary stop, immediate stop and default cancellation.'],evidence:'At M6, retain the ordered dispatch trace and before/after DOM and display data, including one canceled supplied default action. Add corresponding PNGs after M7 enables full terminal sessions.',failure:'Recompute the ancestor chain after each callback or equate cancellation with stopping propagation.'},
 M7:{title:'P2 — an honest incremental engine',steps:['Implement the before/after invalidation interface and use the full runnable workbench.','Record counters for a no-op, a paint-only class change, text expansion and scrolling.','Compare each incremental result to a clean full evaluation and to one hand-calculated geometric or pixel anchor.'],evidence:'The same engine responds repeatedly with valid frames; stage counters prove the minimum reuse contract.',failure:'Cache paint color in layout or skip descendants after an ancestor changes. Preserve the first mismatch and repair.'},
 M8:{title:'P3 — transfer to an unfamiliar reference system',steps:['Freeze and export your working engine and its practice record before opening a transfer packet.','Use the field-reference packet as rehearsal, then have a reviewer supply a new packet combining nested groups, clipping, moved controls and new text.','Locate the first divergent stage, repair the general engine rule, replay old and new cases, and write what remains unsupported.'],evidence:'Frozen first attempt, supplied unfamiliar packet, exact action log, minimal reproducer, repaired source, regression report and diagnosis. The visible rehearsal is not a blind final assessment.',failure:'Patch a particular ID, screenshot or word count. Change topology and viewport to show whether the rule transfers.'}
};

// Bundled with original supplied modules by tools/build.mjs. No author code.
let activeEngine=null,activeSession=null;
self.onmessage=({data})=>{
 const send=(value,transfer=[])=>self.postMessage({requestId:data.requestId,...value},transfer);
 try{
  if(data.kind==='check'){const e=compile(data.source);const result=checkStage(e,data.unit);send({kind:'checks',result});return;}
  if(data.kind==='inspect'){const result=inspectStage(compile(data.source),data.unit,data.packet);const pixels=result.display?raster(result.display,result.viewport):null;if(JSON.stringify(result).length>16777216)throw Error('Stage output exceeds 16 MiB.');send({kind:'stage',result,pixels:pixels?.buffer},pixels?[pixels.buffer]:[]);return;}
  if(data.kind==='hit'){
   if(!activeSession?.frame||activeSession.stale)throw Error('Render a current frame before probing input.');
   const point={x:data.point.x,y:data.point.y+activeSession.viewport.scrollY};const target=activeEngine.target(activeSession.frame.display,point,activeSession.viewport);send({kind:'hit',target,point,frame:activeSession.frame.id});return;
  }
  if(data.kind==='start'){activeEngine=compile(data.source);activeSession=load(activeEngine,data.packet);flush(activeEngine,activeSession);}
  if(data.kind==='click'){
   if(!activeSession)throw Error('Render your engine first.');click(activeEngine,activeSession,data.point);
  }
  if(data.kind==='scroll'){
   if(!activeSession)throw Error('Render your engine first.');activeSession.viewport=validateViewport({...activeSession.viewport,scrollY:data.scrollY});flush(activeEngine,activeSession,{type:'scroll'});
  }
  if(data.kind==='resize'){
   if(!activeSession)throw Error('Render your engine first.');activeSession.viewport=validateViewport({...activeSession.viewport,width:data.width,height:data.height});flush(activeEngine,activeSession,{type:'resize'});
  }
  if(data.kind==='mutate'){
   if(!activeSession)throw Error('Render your engine first.');applyOperation(activeEngine,activeSession,data.operation);
  }
  if(!['start','click','scroll','resize','mutate'].includes(data.kind))throw Error('Unknown worker operation.');
  const pixels=raster(activeSession.frame.display,activeSession.viewport);
  const state={doc:activeSession.doc,frame:activeSession.frame,counters:activeSession.counters,events:activeSession.events,lastFlush:activeSession.lastFlush,stale:activeSession.stale};
  if(JSON.stringify(state).length>16777216)throw Error('Trace exceeds 16 MiB; reduce this packet.');
  send({kind:'frame',state,pixels:pixels.buffer},[pixels.buffer]);
 }catch(error){const recoverable=!!activeEngine&&!!activeSession?.frame;send({kind:'error',recoverable,state:recoverable?{doc:activeSession.doc,frame:activeSession.frame,counters:activeSession.counters,events:activeSession.events,lastFlush:activeSession.lastFlush,stale:activeSession.stale}:null,code:error.code??'engine_error',message:String(error.message??error).slice(0,2000)});}
};
