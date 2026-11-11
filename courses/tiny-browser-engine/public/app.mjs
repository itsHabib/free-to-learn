import {modules} from './content.mjs';
import {pages} from './pages.mjs';
import {digest,copy} from './supplier.mjs';
import {raster} from './raster.mjs';
import {fresh,validate,append,updateDraft,merge} from './notebook.mjs';
import {projects,blockPacket} from './progression.mjs';
import {explainNode,frameDifference,overlayShapes} from './diagnostics.mjs';
const $=id=>document.getElementById(id),KEY='tiny-browser-engine-local-v1';
let book=fresh(),lastRaw=null,unreadable=null,memoryOnly=!navigator.locks,activeWorker=null,activeState=null,liveAttempt=null,unit='M1',busy=false,request=0,timer=null,saveTimer=null;
function status(message){$('save-status').textContent=message;}
try{lastRaw=localStorage.getItem(KEY);if(lastRaw)book=validate(JSON.parse(lastRaw));}catch(e){unreadable=lastRaw;memoryOnly=true;status(`Saved data was not overwritten: ${e.message}`);$('export-stored').hidden=false;}
async function persist(){
 const raw=JSON.stringify(book);
 if(memoryOnly){status('Memory-only notebook. Export before closing this page.');return;}
 try{
  await navigator.locks.request(KEY,async()=>{
   if(localStorage.getItem(KEY)!==lastRaw){memoryOnly=true;status('Another tab changed storage. This tab is memory-only; export it.');return;}
   localStorage.setItem(KEY,raw);lastRaw=raw;status('Notebook saved in this browser. Export a backup before closing.');
  });
 }catch(e){memoryOnly=true;status(`Memory-only notebook: ${e.message}. Export before closing.`);}
}
function history(){const starts=book.events.filter(e=>e.kind==='submit').length;$('history').textContent=`${starts} committed source attempt${starts===1?'':'s'} and ${book.events.length} evidence events retained. Repairs are separate attempts.`;}
async function record(event){book=append(book,event);const id=book.events.at(-1).id;await persist();history();return id;}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function setBusy(value){busy=value;for(const id of ['check','stage-inspect','render','scroll-apply','resize-apply','mutation-apply','probe-point'])$(id).disabled=value;for(const b of $('actions').querySelectorAll('button'))b.disabled=value||!activeWorker||activeState?.stale;}
function invalidate(){activeWorker?.terminate();activeWorker=null;if(activeState){$('render-status').textContent='Source or packet changed. The displayed frame is stale; render again to activate it.';for(const b of $('actions').querySelectorAll('button'))b.disabled=true;}}
function showLesson(id){
 unit=id;const m=modules.find(m=>m.id===id);$('lesson').replaceChildren();
 const top=document.createElement('div');top.innerHTML=`<p class="eyebrow">${m.id} / 8</p><h2>${m.title}</h2><p>${m.goal}</p><p class="needs"><strong>Uses:</strong> ${m.needs}</p><p class="artifact"><strong>Your artifact:</strong> ${m.artifact}</p>`;$('lesson').append(top);
 m.sections.forEach((s,index)=>{
  const section=document.createElement('section');section.innerHTML=`<h3>${s.title}</h3>${s.body}`;
  const form=document.createElement('form');form.className='practice';const field=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=s.question;field.append(legend);
  s.options.forEach((option,i)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name=`${id}-${index}`;input.value=i;input.required=true;label.append(input,document.createTextNode(` ${option}`));field.append(label);});
  const submit=document.createElement('button');submit.textContent='Commit answer';const feedback=document.createElement('p');feedback.className='feedback';feedback.hidden=true;feedback.setAttribute('role','status');
  form.append(field,submit,feedback);form.onsubmit=async event=>{
   event.preventDefault();const selected=Number(new FormData(form).get(`${id}-${index}`));
   try{const prior=book.events.some(e=>e.kind==='quiz'&&e.module===id&&e.item===index);await record({kind:'quiz',module:id,item:index,selected,correct:selected===s.answer,attemptType:prior?'revisit-after-feedback':'first-attempt',assistance:$('assistance').value});feedback.textContent=`${selected===s.answer?'Matches the requirement.':'Revise this decision.'} ${s.reason}${prior?' This is a revisit after feedback, not a fresh transfer attempt.':''}`;feedback.hidden=false;}catch(e){status(e.message);}
  };section.append(form);$('lesson').append(section);
 });
 const project=projects[id],exercise=document.createElement('section');exercise.className='project';
 const title=document.createElement('h3');title.textContent=project.title;const steps=document.createElement('ol');for(const text of project.steps){const li=document.createElement('li');li.textContent=text;steps.append(li);}const evidence=document.createElement('p');evidence.textContent=`Keep this evidence: ${project.evidence}`;const fault=document.createElement('p');fault.textContent=`Failure/repair experiment: ${project.failure}`;exercise.append(title,steps,evidence,fault);$('lesson').append(exercise);
 for(const b of $('modules').querySelectorAll('button'))b.setAttribute('aria-current',String(b.dataset.id===id));
 $('check').textContent=`Commit source & check ${id}`;
 $('stage-inspect').textContent=`Inspect my ${id} stage`;
}
for(const m of modules){const b=document.createElement('button');b.dataset.id=m.id;b.textContent=`${m.id} · ${m.title}`;b.onclick=()=>showLesson(m.id);$('modules').append(b);}
function inspect(){
 if(!activeState)return;const key=$('inspect').value;const value=['doc','events','counters','lastFlush'].includes(key)?activeState[key]:activeState.frame[key];
 $('state').textContent=JSON.stringify(value,null,2);
}
function frame(result){
 const previous=activeState;activeState=result.state;const v=activeState.frame.viewport,canvas=$('pixels');canvas.width=v.width;canvas.height=v.height;
 const bytes=new Uint8ClampedArray(result.pixels);if(bytes.length!==v.width*v.height*4)throw Error('Worker returned an invalid pixel buffer.');
 canvas.getContext('2d').putImageData(new ImageData(bytes,v.width,v.height),0,0);inspect();$('actions').replaceChildren();
 for(const n of activeState.doc.nodes.filter(n=>n.tag==='button'&&activeState.frame.display.regions.some(r=>r.nodeId===n.id))){const b=document.createElement('button');b.textContent=`Activate ${n.attrs.id??`button ${n.id}`}`;b.onclick=()=>interact({kind:'click',point:{targetId:n.id}});$('actions').append(b);}
 const c=activeState.counters;$('render-status').textContent=`Your engine · frame ${activeState.frame.id}, document revision ${activeState.frame.documentRevision}. Stage calls: style ${c.styles}, layout ${c.layout}, display ${c.display}.`;
 $('frame-diff').textContent=JSON.stringify(frameDifference(previous,activeState),null,2);
 const selected=$('node-select').value;$('node-select').replaceChildren();for(const n of activeState.doc.nodes){const option=document.createElement('option');option.value=n.id;option.textContent=`${n.id} · ${n.tag??'text'}${n.attrs?.id?` #${n.attrs.id}`:''}`;$('node-select').append(option);}if([...$('node-select').options].some(o=>o.value===selected))$('node-select').value=selected;nodeDetails();
}
function nodeDetails(){if(!activeState)return;const id=Number($('node-select').value);$('node-detail').textContent=JSON.stringify(explainNode(activeState,id),null,2);const overlay=$('geometry-overlay'),v=activeState.frame.viewport;overlay.width=v.width;overlay.height=v.height;const ctx=overlay.getContext('2d');ctx.clearRect(0,0,v.width,v.height);if(!$('show-geometry').checked)return;for(const r of overlayShapes(activeState,id)){ctx.strokeStyle=r.color;ctx.lineWidth=1;ctx.setLineDash(r.label==='content box'?[3,2]:[]);ctx.strokeRect(r.x+.5,r.y+.5,Math.max(0,r.width-1),Math.max(0,r.height-1));}}
function workerRequest(worker,message){
 const requestId=++request;setBusy(true);
 return new Promise((resolve,reject)=>{
  const finish=(error,result)=>{clearTimeout(timer);timer=null;worker.onmessage=null;worker.onerror=null;if(error){if(!error.recoverable){worker.terminate();if(activeWorker===worker)activeWorker=null;}reject(error);return;}resolve(result);};
  timer=setTimeout(()=>finish(Error('Worker exceeded 5 seconds. Your committed source is preserved; no successful result was recorded.')),5000);
  worker.onerror=e=>{e.preventDefault();finish(Error('The worker stopped. Check syntax and the supplied server response policy.'));};
  worker.onmessage=({data})=>{if(data?.requestId!==requestId)return;if(data.kind==='error'){finish(Object.assign(Error(`${data.code}: ${data.message}`),{recoverable:data.recoverable,state:data.state}));return;}finish(null,data);};
  worker.postMessage({requestId,...message});
 });
}
async function commit(mode,packetOverride){
 const module=unit;
 book=updateDraft(book,$('source').value,$('diagnosis').value);const source=book.draft;
 const packet=packetOverride??JSON.parse($('packet').value);const sourceHash=await digest(source),packetHash=await digest(JSON.stringify(packet));
 const id=await record({kind:'submit',mode,module,source,sourceHash,packet,packetHash,assistance:$('assistance').value});return {id,source,packet,module};
}
function showChecks(report){
 $('check-results').replaceChildren();
 for(const r of report.results){const block=document.createElement('div');block.className=r.passed?'pass':'';const title=document.createElement('strong');title.textContent=`${r.passed?'Pass':'Needs repair'} · ${r.requirement}`;const details=document.createElement('pre');details.textContent=JSON.stringify({input:r.input,observed:r.actual,required:r.expected},null,2);const link=document.createElement('a');link.href='#lesson';link.textContent=`Review ${r.section}, then repair your source`;link.onclick=()=>showLesson(r.section);block.append(title,details,link);$('check-results').append(block);}
 $('check-results').focus();
}
$('check').onclick=async()=>{
 if(busy)return;setBusy(true);let attempt,worker;
 try{attempt=await commit('check');worker=new Worker('worker.js');const r=await workerRequest(worker,{kind:'check',source:attempt.source,unit:attempt.module});if(r.kind!=='checks')throw Error('Invalid check response.');await record({kind:'result',forSubmit:attempt.id,output:r.result});showChecks(r.result);}
 catch(e){$('check-results').textContent=e.message;if(attempt)await record({kind:'result',forSubmit:attempt.id,output:{status:'error',message:e.message}}).catch(()=>{});}
 finally{worker?.terminate();setBusy(false);}
};
$('stage-inspect').onclick=async()=>{
 if(busy)return;setBusy(true);let attempt,worker;
 try{attempt=await commit('inspect',unit==='M3'?blockPacket:undefined);worker=new Worker('worker.js');const r=await workerRequest(worker,{kind:'inspect',source:attempt.source,unit:attempt.module,packet:attempt.packet});if(r.kind!=='stage')throw Error('Invalid stage response.');$('stage-state').textContent=JSON.stringify(r.result,null,2);$('stage-state').focus();if(r.pixels){const c=$('stage-pixels'),v=r.result.viewport;c.width=v.width;c.height=v.height;c.hidden=false;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.pixels),v.width,v.height),0,0);}else $('stage-pixels').hidden=true;await record({kind:'result',forSubmit:attempt.id,output:{status:'inspected',stage:r.result.stage}});}
 catch(e){$('stage-state').textContent=e.message;if(attempt)await record({kind:'result',forSubmit:attempt.id,output:{status:'error',message:e.message}}).catch(()=>{});}finally{worker?.terminate();setBusy(false);}
};
$('render').onclick=async()=>{
 if(busy)return;setBusy(true);let attempt;
 try{attempt=await commit('render');activeWorker?.terminate();activeWorker=new Worker('worker.js');const r=await workerRequest(activeWorker,{kind:'start',source:attempt.source,packet:attempt.packet});activeState=null;frame(r);liveAttempt=attempt.id;$('frame-source').textContent=`Source attempt ${attempt.id} · SHA-256 ${await digest(attempt.source)}`;await record({kind:'result',forSubmit:attempt.id,output:{status:'rendered',frame:activeState.frame.id,counters:activeState.counters,nodeCount:activeState.doc.nodes.length}});}
 catch(e){$('render-status').textContent=`No current runnable frame: ${e.message}`;if(attempt)await record({kind:'result',forSubmit:attempt.id,output:{status:'error',message:e.message}}).catch(()=>{});}finally{setBusy(false);}
};
async function interact(message){
 if(busy||!activeWorker||!liveAttempt)return;setBusy(true);let inputId;
 try{inputId=await record({kind:'interaction',forSubmit:liveAttempt,input:message});const r=await workerRequest(activeWorker,message);if(r.kind==='hit'){if(r.target!==null){$('node-select').value=String(r.target);nodeDetails();}$('hit-result').textContent=`Document point (${r.point.x}, ${r.point.y}) targets ${r.target===null?'nothing':`handle ${r.target}`} in frame ${r.frame}. No event was dispatched.`;await record({kind:'interaction-result',forInteraction:inputId,output:{status:'hit-probed',target:r.target,point:r.point,frame:r.frame}});}else{frame(r);await record({kind:'interaction-result',forInteraction:inputId,output:{status:'rendered',frame:activeState.frame.id,counters:activeState.counters}});}}catch(e){if(e.state){activeState=e.state;inspect();}else if(activeState)activeState.stale=true;$('render-status').textContent=`Input failed: ${e.message}${e.recoverable?' The session is retained. Inspect the DOM and submit a repair operation; stale frames cannot receive clicks.':' Render again to start a fresh session.'}`;if(inputId)await record({kind:'interaction-result',forInteraction:inputId,output:{status:'error',message:e.message}}).catch(()=>{});for(const b of $('actions').querySelectorAll('button'))b.disabled=true;}finally{setBusy(false);}
}
$('pixels').onclick=e=>{const c=$('pixels'),r=c.getBoundingClientRect();interact({kind:$('probe-mode').checked?'hit':'click',point:{x:Math.floor((e.clientX-r.left-c.clientLeft)*c.width/c.clientWidth),y:Math.floor((e.clientY-r.top-c.clientTop)*c.height/c.clientHeight)}});};
$('probe-point').onclick=()=>interact({kind:'hit',point:{x:Math.floor(Number($('probe-x').value)),y:Math.floor(Number($('probe-y').value))}});
$('scroll-apply').onclick=()=>interact({kind:'scroll',scrollY:Number($('scroll').value)});
$('resize-apply').onclick=()=>interact({kind:'resize',width:Number($('viewport-width').value),height:Number($('viewport-height').value)});
$('mutation-apply').onclick=()=>{try{interact({kind:'mutate',operation:JSON.parse($('operation').value)});}catch(e){$('render-status').textContent=`Operation not sent: ${e.message}`;}};
$('inspect').onchange=inspect;
$('node-select').onchange=nodeDetails;
$('show-geometry').onchange=nodeDetails;
$('export-png').onclick=()=>{if(!activeState){status('Render a frame first.');return;}$('pixels').toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`tiny-browser-frame-${activeState.frame.id}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});};
$('source').oninput=()=>{invalidate();clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{book=updateDraft(book,$('source').value,$('diagnosis').value);await persist();}catch(e){status(e.message)}},400);};
$('packet').oninput=invalidate;
$('page-select').onchange=()=>{$('packet').value=JSON.stringify(pages[$('page-select').value],null,2);$('scroll').value=0;invalidate();};
$('save-note').onclick=async()=>{try{book=updateDraft(book,$('source').value,$('diagnosis').value);await record({kind:'note',module:unit,text:$('diagnosis').value});}catch(e){status(e.message)}};
$('export-source').onclick=()=>download('my-tiny-browser.body.js',$('source').value,'text/javascript');
$('export').onclick=()=>{try{book=updateDraft(book,$('source').value,$('diagnosis').value);download('tiny-browser-notebook.json',JSON.stringify(book,null,2));status('Notebook exported with exact source attempts, packets and actions. Use Export frame separately for the current trace.');}catch(e){status(e.message)}};
$('export-frame').onclick=()=>{if(activeState)download('tiny-browser-frame.json',JSON.stringify({kind:'frame-evidence',forSubmit:liveAttempt,state:activeState},null,2));else status('Render a frame before exporting its trace.');};
$('export-stored').onclick=()=>download('tiny-browser-unreadable-original.json',unreadable??lastRaw??'null');
$('import-source').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>131072)throw Error('Source exceeds 128 KiB.');const source=await f.text();await record({kind:'note',text:'Draft preserved before source import.',draftBackup:$('source').value});$('source').value=source;book=updateDraft(book,source);await persist();invalidate();}catch(error){status(error.message)}};
$('import').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  if(f.size>8000000)throw Error('Notebook file exceeds import limit.');const incoming=validate(JSON.parse(await f.text()));
  for(const event of incoming.events.filter(e=>e.kind==='submit'))if(await digest(event.source)!==event.sourceHash||await digest(JSON.stringify(event.packet))!==event.packetHash)throw Error('Imported source or packet does not match its recorded hash.');
  book=merge(updateDraft(book,$('source').value,$('diagnosis').value),incoming);$('source').value=book.draft;$('diagnosis').value=book.notes;await persist();history();invalidate();status('Imported history merged with retained local history. Imported outcomes are unverified local records.');
 }catch(error){status(`Import did not replace your notebook: ${error.message}`);}
};
$('reveal').onclick=async()=>{
 try{const prediction=$('prediction').value.trim();if(!prediction)throw Error('Write a prediction before revealing this recorded example.');await record({kind:'prediction',text:prediction});const response=await fetch('demo.json');if(!response.ok)throw Error('No author recording is packaged.');const demo=await response.json(),v=demo.after.frame.viewport;const bytes=raster(demo.after.frame.display,v),c=$('demo-pixels');c.width=v.width;c.height=v.height;c.getContext('2d').putImageData(new ImageData(bytes,v.width,v.height),0,0);$('demo-description').textContent=`Your prediction: ${prediction}\nRecorded consequence: the button adds class open to the notes. Style changes display from none to block; layout creates note boxes and moves the footer; display/raster produce the new frame.\nThis is an author recording, not your engine.\n${JSON.stringify({before:demo.before.counters,after:demo.after.counters},null,2)}`;}catch(e){$('demo-description').textContent=e.message;}
};
window.addEventListener('beforeunload',e=>{if(memoryOnly&&(book.events.length||book.draft||book.notes)||$('source').value!==book.draft&&book.draft!==''||$('diagnosis').value!==book.notes){e.preventDefault();e.returnValue='';}});
$('source').value=book.draft||await (await fetch('starter.body.js')).text();$('diagnosis').value=book.notes;$('packet').value=JSON.stringify(pages.board,null,2);showLesson('M1');history();if(!unreadable)await persist();
