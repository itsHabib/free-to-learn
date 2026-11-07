import {questions,build} from './questions.mjs';
import {eventFor,readJournal,appendJournal,answerProblem} from './journal.mjs';
const key='ivy:firmware-forensics:journal:v1';
const status=document.querySelector('#save-status');
let journal,blocked=false;
try {journal=readJournal(localStorage,key);}
catch {blocked=true;journal={schema:1,events:[]};status.textContent='Your saved history could not be read. Submissions are paused. Export the existing data before choosing a different browser profile or asking for repair.';}
function prior(id){return journal.events.filter(x=>x.build===build&&x.question.id===id).at(-1);}
function show(form,event){
  form.querySelector('input[name=answer]').value=event.answer;
  form.querySelector('input[name=assisted]').checked=Boolean(event.assisted);
  form.querySelector('textarea[name=notes]').value=event.notes??'';
  form.querySelector('button[type=submit]').disabled=true;
  const target=form.querySelector('.feedback');target.hidden=false;
  target.textContent=(event.correct?'Matches this case. ':'Needs revision. ')+event.question.feedback+' '+(event.correct?'':event.question.repair+' ')+(event.assisted?'Recorded as assisted. ':'Recorded as unassisted. ');
  const parent=form.closest('.practice');
  parent?.querySelector(`[data-after="${form.dataset.question}"]`)?.removeAttribute('hidden');
}
for(const form of document.querySelectorAll('form[data-question]')){
  const q=questions.find(x=>x.id===form.dataset.question);
  const event=prior(q.id);if(event) show(form,event);
  if(blocked)form.querySelector('button[type=submit]').disabled=true;
  form.addEventListener('submit',e=>{
    e.preventDefault();if(blocked||prior(q.id))return;
    const fields=new FormData(form),answer=String(fields.get('answer')||'');
    if(!answer.trim())return;
    const problem=answerProblem(q,answer);
    const error=form.querySelector('.input-error');
    if(problem){error.textContent=problem;error.hidden=false;return;}
    error.hidden=true;
    const event=eventFor(q,answer,{build,assisted:fields.get('assisted')==='on',notes:fields.get('notes')||''});
    try {journal=appendJournal(localStorage,key,journal,event);show(form,event);status.textContent='Saved locally. Earlier answers remain in your export.';}
    catch {status.textContent='Could not save this submission. Your answer stays in the field; no result was recorded or revealed. Export earlier history, free storage, then try again.';}
  });
}
document.querySelector('#export')?.addEventListener('click',()=>{
  const panel=document.querySelector('#export-panel'),text=document.querySelector('#export-text'),message=document.querySelector('#export-status');
  const readFailure='Could not read saved browser history. No export was prepared.';
  let raw;try{raw=localStorage.getItem(key);}catch{text.value='';panel.hidden=true;message.textContent='';status.textContent=readFailure;return;}
  if(raw===null)raw=JSON.stringify(journal);
  text.value=raw;panel.hidden=false;text.focus();text.select();
  if(status.textContent===readFailure)status.textContent='Reasoning history is ready to copy below. Terminal attempts are separate files.';
  message.textContent='History selected. Copy it into a local text editor and save as firmware-reasoning-history.json.';
});
