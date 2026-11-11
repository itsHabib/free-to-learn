'use strict';
(() => {
  const data=JSON.parse(document.getElementById('practice-data').textContent);
  const key='blockchain-lab-practice-v1:'+data.identity.hash;
  const status=document.getElementById('storage-status');let history=[],storageOK=true;
  try{const saved=localStorage.getItem(key);if(saved){history=JSON.parse(saved);if(!Array.isArray(history))throw new Error('Invalid history');}}
  catch(error){storageOK=false;status.textContent='Saved history could not be read. Existing data has not been replaced. Use terminal practice or export the current readable history.';}
  const refreshers=[];
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  function save(attempt){
    if(!storageOK)throw new Error('History is unavailable; no response committed.');
    const next=[...history,attempt];localStorage.setItem(key,JSON.stringify(next));history=next;
  }
  for(const box of document.querySelectorAll('[data-item]')){
    const item=data.items.find(x=>x.id===box.dataset.item),form=el('form'),fieldset=el('fieldset');
    fieldset.append(el('legend','Practice '+item.id));fieldset.append(el('h3',item.question));
    item.options.forEach((option,i)=>{const label=el('label'),input=el('input');input.type='radio';input.name=item.id;input.value=String(i);input.required=true;label.append(input,el('span',option));fieldset.append(label);});
    const button=el('button','Commit response'),result=el('div'),previous=el('p');button.type='submit';result.className='result';result.setAttribute('role','status');previous.className='history';
    const refresh=()=>{
      const tries=history.filter(x=>x.item===item.id);
      if(!tries.length){previous.textContent='No response committed yet. Feedback appears after saving.';return;}
      const latest=tries.at(-1);
      previous.textContent=`${tries.length} saved attempt(s). First choice: ${tries[0].choice+1}. Latest choice: ${latest.choice+1}. Revisions remain in your export.`;
      const chosen=fieldset.querySelector(`input[value="${latest.choice}"]`);if(chosen)chosen.checked=true;
      result.textContent=latest.feedback??'Saved choice restored. Submit again for current feedback; the historical record has not been regraded.';
    };refreshers.push(refresh);refresh();
    form.append(fieldset,button,result,previous);box.append(form);
    form.addEventListener('submit',event=>{event.preventDefault();const checked=form.querySelector('input:checked');if(!checked)return;
      const choice=Number(checked.value),attempt={item:item.id,question:item.question,options:item.options,choice,at:new Date().toISOString(),courseHash:data.identity.hash,assistance:history.some(x=>x.item===item.id)?'prior feedback available':'not declared',feedback:`${choice===item.answer?'Correct.':'Revise this answer.'} Correct answer: ${item.options[item.answer]}\n${item.feedback[choice]}`};
      try{save(attempt);result.textContent=`${choice===item.answer?'Correct.':'Revise this answer.'} Correct answer: ${item.options[item.answer]}\n${item.feedback[choice]}`;refresh();}
      catch(error){result.textContent='Response was not saved; feedback withheld. Export existing work and use terminal practice. '+error.message;}
    });
  }
  // Reader builds have distinct identities. Restore only explicitly chosen,
  // exactly compatible old questions/options; never rewrite older storage.
  if(storageOK && history.length===0){
    const candidates=[];
    for(const oldKey of Object.keys(localStorage).filter(k=>k.startsWith('blockchain-lab-practice-v1:')&&k!==key)){
      try{
        const records=JSON.parse(localStorage.getItem(oldKey));
        const compatible=Array.isArray(records)&&records.length&&records.every(record=>{
          const item=data.items.find(x=>x.id===record.item);
          return item&&record.question===item.question&&JSON.stringify(record.options)===JSON.stringify(item.options)&&Number.isInteger(record.choice)&&record.choice>=0&&record.choice<item.options.length&&typeof record.at==='string';
        });
        if(compatible)candidates.push(...records);
      }catch{ /* Keep unreadable history intact; it is not an import candidate. */ }
    }
    if(candidates.length){
      const restore=el('button','Restore earlier practice');restore.id='restore-practice';restore.type='button';
      const description=el('p','Compatible practice from an earlier build is available. Restore its choices here while keeping the earlier records.');
      status.before(description,restore);
      restore.addEventListener('click',()=>{
        try{
          const records=[...new Map(candidates.map(record=>[JSON.stringify(record),record])).values()].sort((a,b)=>a.at.localeCompare(b.at));
          localStorage.setItem(key,JSON.stringify(records));history=records;for(const refresh of refreshers)refresh();
          restore.disabled=true;status.textContent=`Restored ${records.length} saved attempt(s). Earlier build records remain unchanged.`;
        }catch(error){status.textContent='Earlier practice was not restored. Original records are unchanged. '+error.message;}
      });
    }
  }
  document.getElementById('export').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({kind:'practice only',courseIdentity:data.identity,history},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');
    a.href=url;a.download='blockchain-lab-practice.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Practice export requested. It contains first and revised choices, not code checks or a mastery certificate.';
  });
})();
