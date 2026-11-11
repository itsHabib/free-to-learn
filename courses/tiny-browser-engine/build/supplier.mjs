// Original supplied infrastructure. Browser-engine decisions are learner callbacks.
export const PROFILE = 'TBE-1-local-0.1';
export const LIMITS = Object.freeze({nodes:512,depth:32,rules:128,text:32768,packet:262144,commands:16384,width:1024,height:768,extent:32768});
export const fail = (code, message, detail={}) => { throw Object.assign(new Error(message), {code, detail}); };
export const copy = value => structuredClone(value);
export const node = (doc,id) => doc.nodes.find(n=>n.id===id) ?? fail('unknown_handle',`Node ${id} does not exist.`);
export const connected = (doc,id) => {
  const seen=new Set(); let n=node(doc,id);
  while(n.parent!==null){ if(seen.has(n.id))return false; seen.add(n.id); n=node(doc,n.parent); }
  return n.id===doc.root;
};
export const tags = new Set(['main','div','p','span','button']);
export const identifier = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export function textValue(value){
  if(typeof value!=='string'||value.length>LIMITS.text||/[^\x09\x0a\x0d\x20-\x7e]/.test(value))fail('unsupported_character','Use printable ASCII text, spaces, tabs or line breaks.');
  return value;
}
function decode(s){
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  return textValue(s.replace(/&([^;\s]*);|&/g,(all,name)=>entities[name]??fail('unsupported_entity',`Unsupported entity ${all}.`)));
}
export function tokenize(html){
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
export const defaults=Object.freeze(Object.fromEntries([
  ['display','inline'],['width','auto'],['height','auto'],['color','#000000'],['background-color','transparent'],['line-height',20],['overflow','visible'],
  ...sides.flatMap(s=>[[`padding-${s}`,0],[`border-${s}-width`,0],[`border-${s}-style`,'solid'],[`border-${s}-color`,'#000000']])
]));
export const geometryProperties = ['display','width','height','line-height',...sides.flatMap(s=>[`padding-${s}`,`border-${s}-width`,`border-${s}-style`])];
export function valueFor(property,raw){
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
export function parseSelector(source){
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
export function parseCSS(css){
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
export const uaRules=()=>parseCSS('main {display:block} div {display:block} p {display:block} button {display:block}').map((r,i)=>({...r,id:`ua${i}`,origin:0}));
export const intersect=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return{x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)};};
export const inside=(r,x,y)=>r.width>0&&r.height>0&&x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height;
export function validateViewport(v){
  if(!v||!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<1||v.height<1||v.width>LIMITS.width||v.height>LIMITS.height||!Number.isInteger(v.scrollY??0)||(v.scrollY??0)<0||(v.scrollY??0)>LIMITS.extent)fail('viewport','Invalid integer viewport.');
  return {width:v.width,height:v.height,scrollY:v.scrollY??0};
}
export const support={LIMITS,fail,copy,node,connected,tags,identifier,textValue,defaults,geometryProperties,intersect,inside};
export const required=['buildDOM','mutate','styles','layout','display','target','dispatch','invalidation'];
export function compile(body){
  if(typeof body!=='string'||body.length>131072)fail('source_limit','Source must fit within 128 KiB.');
  const engine=new Function('support',`"use strict";\n${body}`)(support);
  for(const name of required)if(typeof engine?.[name]!=='function')fail('interface',`Return an engine with ${name}().`);
  return engine;
}
export function load(engine,packet){
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
export function flush(engine,session,change={type:'initial'}){
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
export function runAction(engine,session,action){
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
export function click(engine,session,{x,y,targetId}={}){
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
export function logEvent(session,event){if(session.events.length>=512)fail('event_limit','This run reached 512 trace events. Export the trace and render a fresh session.');session.events.push(event);}
export function applyOperation(engine,session,operation){
 if(!session.frame)fail('stale_input','Establish an initial frame before interactive mutation.');
 const repairing=session.stale;
 const result=engine.mutate(session.doc,copy(operation));if(result.status==='applied')session.stale=true;logEvent(session,{kind:'operation',operation:copy(operation),result});
 flush(engine,session,{type:repairing?'initial':result.status==='applied'?(operation.kind==='setText'?'text':'mutation'):'noop'});return result;
}
export const stable=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export async function digest(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
