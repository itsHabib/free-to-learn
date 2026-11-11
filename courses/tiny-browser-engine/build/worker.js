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
