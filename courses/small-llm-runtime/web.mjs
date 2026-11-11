import {renderMarkdown,escape} from './render.mjs';
import {PUBLIC_FILES} from './manifest.mjs';
import {practice,parseAnswer,answerFormat,describeAnswer} from './practice.mjs';
import {REQUIREMENTS,cases,formatResult} from './checks.mjs';
import {zipFiles} from './zip.mjs';
const $=id=>document.getElementById(id),read=async name=>{const r=await fetch(name);if(!r.ok)throw new Error(`Read ${name}: ${r.status}`);return r.text();};
const readBytes=async name=>{const r=await fetch(name);if(!r.ok)throw new Error(`Read ${name}: ${r.status}`);return new Uint8Array(await r.arrayBuffer());};
const config=JSON.parse(await read('course.json')),manifest=JSON.parse(await read('package-manifest.json')),key='ivy-cpu-'+config.id;
const blank=()=>({schema:'ivy-cpu-workspace-v1',course:config.id,revision:0,draft:{source:'',project:'',help:'none declared'},attempts:[],practice:[],savedDrafts:[],referenceSupport:[]});
let raw=null,state=blank(),unsafe=false,running=false;
try{raw=localStorage.getItem(key);}catch(error){unsafe=true;$('status').textContent='Browser storage could not be read. Existing saved work was not replaced. This draft stays in memory only; export it before closing. Checks are stopped. '+error.message;}
function valid(x){if(x?.schema!=='ivy-cpu-workspace-v1'||x.course!==config.id||typeof x.draft?.source!=='string'||typeof x.draft?.project!=='string'||!Array.isArray(x.attempts)||!Array.isArray(x.practice)||!Array.isArray(x.savedDrafts)||!Number.isSafeInteger(x.revision)||(x.referenceSupport!==undefined&&!Array.isArray(x.referenceSupport)))throw new Error('workspace schema/course/draft/history mismatch');for(const a of x.attempts)if(typeof a.id!=='string'||typeof a.source!=='string'||typeof a.project!=='string'||typeof a.lesson!=='string'||typeof a.help!=='string'||!a.identity)throw new Error('invalid preserved attempt');return x;}
try{if(raw)state=valid(JSON.parse(raw));}catch(e){unsafe=true;$('status').textContent='Saved work is unreadable. It remains unchanged. Export recovery before editing or restoring. '+e.message;}
function save(next){
 try{if(localStorage.getItem(key)!==raw)throw new Error('Another tab changed this workspace. Export this tab before restoring.');if(unsafe)throw new Error('Saving is blocked; export recovery first.');valid(next);next.revision++;const text=JSON.stringify(next);localStorage.setItem(key,text);raw=text;state=next;}
 catch(e){state=next;unsafe=true;$('status').textContent='Work was not saved; checks stopped. This draft stays in memory only. Export this workspace before closing. '+e.message;throw e;}
}
function download(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const historyBuild=record=>record?.identity?.inputHash===manifest.inputHash&&record?.identity?.sourceRevision===manifest.sourceRevision?'This build.':'Earlier or unidentified build; kept as historical evidence.';
const historyRecognized=r=>r!==null&&typeof r==='object'&&!Array.isArray(r)&&typeof r.id==='string'&&r.id!==''&&typeof r.pass==='boolean';
function historyResult(record){
 if(record?.state==='pending')return 'pending; no result stored';
 if(record?.result?.kind!=='check')return record?.result?.message?'execution error recorded':'no check result stored';
 const report=record.result.report,rows=report?.results,flag='recorded pass flag '+(typeof report?.pass==='boolean'?report.pass:report?.pass===undefined?'missing':'not true/false');
 if(!Array.isArray(rows)||!rows.length)return 'incomplete report: no usable public case results; '+flag;
 const known=rows.filter(historyRecognized),passed=known.filter(r=>r.pass).length;
 if(known.length<rows.length||typeof report.pass!=='boolean')return `incomplete report: ${rows.length-known.length} of ${rows.length} result rows unrecognized; recognized cases ${passed} passed, ${known.length-passed} failed; ${flag}`;
 return `${passed}/${rows.length} public cases passed; module ${report.pass?'passed':'failed'}`;
}
function historyExact(record){
 const detail=document.createElement('details'),label=document.createElement('summary'),pre=document.createElement('pre');
 detail.className='history-exact';label.textContent='Exact stored record (includes submitted code when present)';
 detail.addEventListener('toggle',()=>{if(detail.open&&!pre.hasChildNodes())pre.textContent=JSON.stringify(record,null,2)??String(record);});
 detail.append(label,pre);return detail;
}
function historyItem(record,kind){
 const item=document.createElement('li'),detail=document.createElement('details'),label=document.createElement('summary'),meta=document.createElement('p');
 const at=String(record?.at??'time not recorded');meta.className='history-meta';
 if(kind==='Code attempts'){
  label.textContent=`Module ${String(record?.lesson??'unknown')} · ${historyResult(record)} · ${at}`;
  const matches=record?.source===$('source').value&&record?.project===$('project').value;
  meta.textContent=historyBuild(record)+' '+(matches?'Recorded code matches the current draft.':'Recorded code differs from the current draft.')+'\nHelp recorded for this attempt: '+String(record?.help??'not recorded');
 }
 if(kind==='Practice records'){
  label.textContent=`Practice ${String(record?.item??'unrecognized record')} · ${typeof record?.feedback==='string'?'feedback saved':'no feedback stored'} · ${at}`;
  meta.textContent=historyBuild(record)+'\nQuestion: '+String(record?.question??'not recorded')+'\nAnswer: '+String(record?.answer??'not recorded')+'\nHelp: '+String(record?.help??'not recorded')+'\nFeedback: '+String(record?.feedback??'not stored');
 }
 if(kind==='Reference support'){
  label.textContent=`Earlier-layer reference for module ${String(record?.lesson??'unknown')} · ${at}`;
  meta.textContent=historyBuild(record)+'\nSupplied modules: '+(Array.isArray(record?.providedModules)?record.providedModules.join(', '):'not recorded')+'. The displaced code remains in this record and the workspace export.';
 }
 detail.append(label,meta,historyExact(record));item.append(detail);return item;
}
function showHistory(){
 const host=$('history'),intro=document.createElement('p');
 intro.textContent=`${state.attempts.length} code attempts, ${state.practice.length} practice records and ${(state.referenceSupport??[]).length} reference-support records retained. Open a summary to inspect its recorded evidence. Complete workspace exports keep the full records.`;
 host.replaceChildren(intro);
 for(const [kind,records]of [['Code attempts',state.attempts],['Practice records',state.practice],['Reference support',state.referenceSupport??[]]]){
  const heading=document.createElement('h3'),list=document.createElement('ol');heading.textContent=kind;list.className='history-list';
  for(const record of records)list.append(historyItem(record,kind));
  host.append(heading,list);
 }
}
$('title').textContent=config.title;$('lead').textContent=config.lead;$('entry').textContent=config.prerequisites;$('scope').textContent=config.scope;$('runtime').textContent=config.runtime;
$('identity').textContent='Build '+manifest.inputHash.slice(0,16)+' · source '+manifest.sourceRevision.slice(0,12);document.title=config.title;
$('map').innerHTML=config.lessons.map(l=>`<a href="#lesson-${l.id}">${escape(l.id+' · '+l.title)}</a>`).join('');
const lessonTexts=Object.fromEntries(await Promise.all(config.lessons.map(async l=>[l.id,await read(l.file)])));
$('lessons').innerHTML=config.lessons.map(l=>`<article id="lesson-${l.id}"><p class="eyebrow">Module ${l.id} · depends on ${escape(l.dependencies.join(', ')||'entry skills')}</p>${renderMarkdown(lessonTexts[l.id])}<p><button type="button" data-lesson="${l.id}">Work on module ${l.id}</button></p></article>`).join('');
$('lesson').innerHTML=config.lessons.map(l=>`<option value="${l.id}">${escape(l.id+' · '+l.title)}</option>`).join('')+'<option value="all">All modules</option>';
if(!raw){state.draft.source=await read(config.starter);if(!unsafe)try{save(state);}catch{}}
$('source').value=state.draft.source;$('project').value=state.draft.project;$('help').value=state.draft.help;
for(const id of ['source','project','help'])$(id).addEventListener('input',()=>{const next=structuredClone(state);next.draft={source:$('source').value,project:$('project').value,help:$('help').value};try{save(next);$('status').textContent='Draft saved. Previous results describe their recorded code; run again for this draft.';}catch{}showHistory();});
document.querySelectorAll('[data-lesson]').forEach(b=>b.addEventListener('click',()=>{$('lesson').value=b.dataset.lesson;$('workbench').scrollIntoView();$('source').focus();}));
$('reference-support').addEventListener('click',async()=>{
 if(running)return;
 try{const lesson=$('lesson').value,index=JSON.parse(await read('reference-support/index.json')),item=index.modules[lesson];if(!item)throw new Error('Choose module 02..08; module 01 uses the entry skills.');const source=await read(item.file),next=structuredClone(state),record={id:crypto.randomUUID(),at:new Date().toISOString(),lesson,providedModules:item.providedModules,file:item.file,sourceBefore:$('source').value,identity:manifest};next.savedDrafts.push({at:record.at,draft:{source:$('source').value,project:$('project').value,help:$('help').value},identity:manifest});next.referenceSupport??=[];next.referenceSupport.push(record);next.draft={source,project:$('project').value,help:'supplied earlier-layer reference for module '+lesson+'; '+$('help').value};$('source').value=source;$('help').value=next.draft.help;save(next);$('status').textContent='Earlier modules '+item.providedModules.join(', ')+' supplied. Current module remains unfinished. Original draft and reference assistance retained; run fresh checks.';showHistory();}catch(error){$('status').textContent='Reference support was not saved: '+error.message;}
});
$('check').addEventListener('click',async()=>{
 if(running)return;
 const lesson=$('lesson').value,question={modules:config.lessons.filter(l=>lesson==='all'||l.id===lesson).map(l=>({...l,text:lessonTexts[l.id]})),criteria:cases.filter(c=>lesson==='all'||c.lesson===lesson).map(c=>({id:c.id,lesson:c.lesson,input:c.input,requirement:REQUIREMENTS[c.lesson]}))};
 const attempt={id:crypto.randomUUID(),at:new Date().toISOString(),lesson,question,help:$('help').value,referenceSupport:structuredClone(state.referenceSupport??[]),source:$('source').value,project:$('project').value,identity:manifest,state:'pending'};
 const next=structuredClone(state);next.attempts.push(attempt);
 try{save(next);}catch{return;}
 running=true;$('check').disabled=true;$('status').textContent='Attempt saved; running public checks.';
 const worker=new Worker(new URL('./checker-worker.mjs',import.meta.url),{type:'module'});
 let finished=false;const finish=result=>{if(finished)return;finished=true;worker.terminate();clearTimeout(timer);const update=structuredClone(state),a=update.attempts.find(x=>x.id===attempt.id);a.result=result;a.state='finished';try{save(update);}catch{}$('results').textContent=formatResult(result,{lesson,footer:'The exact stored record, including the machine-readable result, is under Keep and move your work, Attempt history.'});if(!unsafe)$('status').textContent=result.kind==='check'?(result.report.pass?'Public checks agree with this attempt. Review the rubric and changed-problem task.':'Some public criteria failed. Read each input, observed result and repair pointer.'):'Execution failed; correct the error and rerun. Original attempt preserved.';running=false;$('check').disabled=false;showHistory();};
 const timer=setTimeout(()=>finish({kind:'execution-error',message:'Five-second execution limit reached. Check loops, repair and retry.'}),5000);
 worker.onmessage=e=>finish(e.data);worker.onerror=e=>finish({kind:'execution-error',message:e.message});worker.postMessage(attempt);
});
const exportableWorkspace=()=>unsafe?{...state,recoveryRaw:raw}:state;
$('export-state').addEventListener('click',()=>{download(config.id+'-workspace.json',JSON.stringify(exportableWorkspace(),null,2));$('status').textContent=unsafe?'Workspace download requested. This draft remains in memory only; confirm the file was saved before closing.':'Complete workspace download requested; confirm the file was saved in your browser.';});
$('restore').addEventListener('change',async e=>{
 try{if(running)throw new Error('Wait for this check before restoring.');const file=e.target.files[0];if(!file)return;const incoming=valid(JSON.parse(await file.text())),merged=structuredClone(state),seen=new Map(merged.attempts.map(a=>[a.id,JSON.stringify(a)]));
 for(const a of incoming.attempts){if(seen.has(a.id)&&seen.get(a.id)!==JSON.stringify(a))throw new Error('conflicting attempt identity; nothing replaced');if(!seen.has(a.id))merged.attempts.push(a);}
 merged.referenceSupport??=[];for(const record of incoming.referenceSupport??[]){const existing=merged.referenceSupport.find(r=>r.id===record.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(record))throw new Error('conflicting reference-assistance identity');if(!existing)merged.referenceSupport.push(record);}
 merged.practice.push(...incoming.practice);merged.savedDrafts.push({at:new Date().toISOString(),draft:state.draft,identity:manifest},...incoming.savedDrafts);merged.draft=incoming.draft;save(merged);$('source').value=state.draft.source;$('project').value=state.draft.project;$('help').value=state.draft.help;$('status').textContent='Restored drafts; current drafts and all attempts retained. Run fresh checks.';showHistory();
 }catch(error){$('status').textContent='Restore refused before replacement: '+error.message;}
});
$('export-project').addEventListener('click',async()=>{
 try{const files=await Promise.all(PUBLIC_FILES.map(async name=>[name,await readBytes(name)]));for(const name of config.support){if(!PUBLIC_FILES.includes(name))throw new Error('support dependency is outside the learner package: '+name);files.push(['work/'+name,files.find(([path])=>path===name)[1]]);}files.push(['package-manifest.json',JSON.stringify(manifest,null,2)],['work/'+config.entry,$('source').value],['work/workspace.json',JSON.stringify(exportableWorkspace(),null,2)],['work/course-work.json',JSON.stringify({course:config.id,format:'ivy-course-work-v1'})]);if($('project').value.trim())files.push(['work/project.mjs',$('project').value]);download('my-'+config.id+'.zip',zipFiles(files),'application/zip');$('status').textContent=(unsafe?'Export prepared. This draft stays in memory only; browser storage was not updated. ':'Export prepared from current code and preserved history. ')+'Unzip and run node lab.mjs check all work --help-used "exported work".';}catch(e){$('status').textContent='Export failed; work remains available: '+e.message;}
});
$('prompt').value=await read('PROMPT.md');showHistory();
const practiceSameBuild=r=>r?.identity?.inputHash===manifest.inputHash&&r?.identity?.sourceRevision===manifest.sourceRevision;
const practiceLatest=records=>records.reduce((best,r)=>!best||String(r.at)>=String(best.at)?r:best,null);
const practiceLabel=(r,variants)=>!practiceSameBuild(r)?'earlier build '+String(r?.identity?.sourceRevision??'unknown').slice(0,12)+', not current':!Number.isInteger(r?.variant)||r.variant<0||r.variant>=variants.length||typeof r.question!=='string'?'unrecognized question or case, not current':variants[r.variant].prompt!==r.question?'question text changed since, not current':'this build, case '+(r.variant+1);
for(const host of document.querySelectorAll('[data-practice]')){
 const base=host.dataset.practice,variants=practice[base];if(!variants)throw new Error('unknown practice '+base);
 const records=()=>state.practice.filter(r=>r?.item===base),matches=r=>practiceSameBuild(r)&&Number.isInteger(r.variant)&&r.variant>=0&&r.variant<variants.length&&typeof r.question==='string'&&variants[r.variant].prompt===r.question;
 let variant=Number(practiceLatest(records().filter(matches))?.variant??0);
 const draw=()=>{const q=variants[variant],id='practice-'+base.replace(/[^A-Za-z0-9_-]/g,'-')+'-'+variant,saved=practiceLatest(records().filter(r=>matches(r)&&Number(r.variant)===variant)),done=typeof saved?.feedback==='string';
 const savedNote=!saved?'':done?'Committed '+saved.at+' on this build. Your saved answer, help note and stored feedback are shown unchanged.':'Saved '+saved.at+' on this build without stored feedback. Nothing was recomputed; commit again to get feedback as a new record.';
 host.innerHTML=`<p><strong>${escape(q.kind||'Practice')} · ${escape(q.objective)}</strong></p><p id="${id}-q">${escape(q.prompt)}</p><label for="${id}-a">Your answer (${escape(answerFormat(q.answer))}) <input id="${id}-a" autocomplete="off" aria-describedby="${id}-q ${id}-s ${id}-f"></label><label for="${id}-h">Help used for this practice answer <textarea id="${id}-h" rows="2" autocomplete="off"></textarea></label><button type="button">Commit answer</button><p id="${id}-s"${savedNote?'':' hidden'}>${escape(savedNote)}</p><output id="${id}-f" aria-live="polite">${done?escape(saved.feedback):''}</output>`;
 const answerBox=$(id+'-a'),helpBox=$(id+'-h'),commit=host.querySelector('button'),note=$(id+'-s'),out=$(id+'-f');
 answerBox.value=saved?String(saved.answer??''):'';helpBox.value=saved?String(saved.help??''):'none declared';answerBox.readOnly=helpBox.readOnly=commit.disabled=done;
 const offerFreshCase=feedback=>{if(!String(feedback).startsWith('This answer differs.')||variant+1>=variants.length)return;const retry=document.createElement('button');retry.type='button';retry.textContent='Try a fresh case on this concept';retry.addEventListener('click',()=>{variant++;draw();host.querySelector('input').focus();});out.after(retry);};
 if(done)offerFreshCase(saved.feedback);
 const earlier=records().filter(r=>r!==saved);
 if(earlier.length){const box=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');summary.textContent='Earlier records for this practice ('+earlier.length+')';for(const r of earlier){const li=document.createElement('li');li.textContent=`${r.at} · ${practiceLabel(r,variants)} · question: ${r.question} · answer: ${r.answer} · help: ${r.help} · feedback: ${typeof r.feedback==='string'?r.feedback:'none stored'}`;list.append(li);}box.append(summary,list);host.append(box);}
 commit.addEventListener('click',()=>{const answer=answerBox.value,parsed=parseAnswer(answer,q.answer);if(!parsed.ok){out.textContent=parsed.hint;answerBox.focus();return;}const record={id:crypto.randomUUID(),at:new Date().toISOString(),item:base,variant,question:q.prompt,answer,help:helpBox.value,identity:manifest};const next=structuredClone(state);next.practice.push(record);try{save(next);}catch{return;}
 const pass=JSON.stringify(parsed.value)===JSON.stringify(q.answer);const feedback=`${pass?'Agrees with this case.':'This answer differs.'} Expected ${describeAnswer(q.answer)}. ${q.feedback}`;out.textContent=feedback;answerBox.readOnly=helpBox.readOnly=commit.disabled=true;note.textContent='Committed '+record.at+' on this build.';note.hidden=false;out.tabIndex=-1;out.focus({preventScroll:true});
 const update=structuredClone(state),stored=update.practice.find(r=>r?.id===record.id);if(stored){stored.feedback=feedback;try{save(update);}catch{}}showHistory();
 offerFreshCase(feedback);
 });};draw();
}
const initialTarget=location.hash.slice(1);
if(initialTarget==='lessons'||initialTarget==='workbench'||config.lessons.some(l=>initialTarget==='lesson-'+l.id)){
 const target=$(initialTarget),heading=target.querySelector('h1,h2')??target;
 heading.setAttribute('tabindex','-1');target.scrollIntoView({block:'start'});heading.focus({preventScroll:true});
}
