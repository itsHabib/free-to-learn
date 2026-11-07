// Embedded by the private build script. No network requests or external scripts.
const readerData=JSON.parse(document.querySelector('#reader-data').textContent);
const bank=readerData.bank,revision=readerData.revision,key=`compiler-optimizer-practice:${revision}`;
let state=emptyPractice(revision),storageReady=false;
const status=document.querySelector('#practice-status');
function tell(message){status.textContent=message;}
try{const saved=localStorage.getItem(key);if(saved)state=inspectPractice(JSON.parse(saved),bank,revision);storageReady=true;}catch(error){tell(`Local history is unavailable: ${error.message} Reading and export remain available; answers will not be revealed without saving.`);}
function persist(next){if(!storageReady)throw new Error('Local storage is unavailable. Use the terminal practice route or a browser allowing local storage.');localStorage.setItem(key,JSON.stringify(next));state=next;}
function historySummary(){document.querySelector('#history-summary').textContent=`${state.attempts.length} committed attempts saved for this reader revision. Terminal coding attempts are kept separately by the CLI.`;}
function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function draw(){
  for(const section of document.querySelectorAll('section[data-unit]')){
    const unit=Number(section.dataset.unit),panel=section.querySelector('.practice-panel');panel.replaceChildren();panel.append(element('h3','Commit and check your reasoning'));
    for(const item of bank.items.filter(x=>Number(x.unit)===unit)){
      const form=element('form');form.className='practice-card';const fieldset=element('fieldset'),legend=element('legend',`${item.id} · ${item.prompt}`);fieldset.append(legend);
      for(const [choice,text]of Object.entries(item.choices)){const label=element('label'),radio=element('input');radio.type='radio';radio.name=`choice-${item.id}`;radio.value=choice;radio.required=true;label.append(radio,document.createTextNode(` ${choice}. ${text}`));fieldset.append(label);}
      const helpLabel=element('label','Help used (for example, none or read feedback)'),help=element('input');help.type='text';help.maxLength=500;help.placeholder='none';helpLabel.append(help);
      const button=element('button','Commit answer'),feedback=element('p');button.type='submit';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
      form.append(fieldset,helpLabel,button,feedback);
      const previous=state.attempts.filter(a=>a.item===item.id);if(previous.length){const last=previous.at(-1),result=practiceFeedback(bank,last);feedback.textContent=`Last committed ${last.choice}: ${result.passed?'correct':'revise'}. ${result.reason} ${previous.length} attempt(s) retained.`;}
      form.addEventListener('submit',event=>{event.preventDefault();try{const choice=form.querySelector('input[type=radio]:checked')?.value,next=commitPractice(state,bank,item.id,choice,help.value,{id:crypto.randomUUID(),at:new Date().toISOString()});persist(next);const result=practiceFeedback(bank,state.attempts.at(-1));feedback.textContent=`${result.passed?'Correct.':'Revise.'} ${result.reason} Next: ${result.next}. This attempt is saved; earlier attempts remain.`;historySummary();tell('Answer committed before feedback.');}catch(error){feedback.textContent=`Not committed: ${error.message}`;}});
      panel.append(form);
    }
  }historySummary();
}
document.querySelector('#export-practice').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=element('a');link.href=url;link.download='compiler-optimizer-practice.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);tell('Practice export prepared. Keep the downloaded file with your CLI work export.');});
document.querySelector('#import-practice').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('Import exceeds 1 MiB.');const incoming=inspectPractice(JSON.parse(await file.text()),bank,revision),next=mergePractice(state,incoming,bank);persist(next);draw();tell('Practice history merged without removing existing attempts.');}catch(error){tell(`Import not applied: ${error.message}`);}event.target.value='';});
draw();
