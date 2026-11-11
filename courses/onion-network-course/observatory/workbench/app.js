/* Supplied static reading/practice interface. No network requests or external assets. */
(() => {
  'use strict';
  const {course,practice,trace,contentHash}=window.LAB;
  const prefix='circuit-observatory/v1/';
  const root=document.querySelector('#lesson');
  const status=document.querySelector('#storage-status');
  let current=1,step=0,revealed=false;
  const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  function records() {
    const out=[];
    for(let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i);
      if(key.startsWith(prefix)) out.push(JSON.parse(localStorage.getItem(key)));
    }
    return out.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  }
  function save(record) {
    const id=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const full={...record,id,createdAt:new Date().toISOString(),contentHash};
    const key=prefix+id,value=JSON.stringify(full);
    localStorage.setItem(key,value);
    if(localStorage.getItem(key)!==value) throw new Error('Storage verification failed');
    status.textContent='Saved locally on this browser origin. Export a copy before moving the file.';
    return full;
  }
  function storageFailure(error) {
    status.textContent=`Could not save: ${error.message}. Your text remains on screen. No answer was submitted or feedback revealed. Use the CLI if this browser blocks file storage.`;
  }
  function matching(id) {return records().filter(r=>r.type==='response'&&r.question.id===id&&r.contentHash===contentHash);}
  function answerCard(item) {
    const card=el('div',undefined,'question');
    card.append(el('div',`${item.kind==='prediction'?'Predict before the reveal':'Apply the idea'} · ${item.id}`,'eyebrow'));
    const label=el('label',item.prompt);label.htmlFor=`answer-${item.id}`;card.append(label);
    const input=el('textarea');input.id=`answer-${item.id}`;input.rows=2;input.setAttribute('spellcheck','false');
    input.setAttribute('aria-describedby',`format-${item.id}`);card.append(input);
    const format=el('p','Use JSON: a number, true/false, a quoted string, or an array. Example format: ["first","second"].','small');format.id=`format-${item.id}`;card.append(format);
    const button=el('button','Commit response');button.type='button';card.append(button);
    const feedback=el('div',undefined,'feedback');feedback.setAttribute('aria-live','polite');card.append(feedback);
    function show(result,previous=false) {
      feedback.replaceChildren();
      feedback.append(el('strong',`${previous?'Latest saved response · ':''}${item.kind==='prediction'?'Prediction recorded':result.pass?'Supported answer':'Needs repair'}`));
      feedback.append(el('p',`You submitted ${JSON.stringify(result.answer)}. Expected ${JSON.stringify(item.answer)}.`));
      feedback.append(el('p',item.reason));
      feedback.append(el('p',`Help recorded: ${result.assistance?.join(', ')||'none declared'}. Earlier responses remain in your export.`,'small'));
      if(!result.pass&&item.repair) {
        const next=el('button',`Try a fresh case · ${item.repair}`,'secondary');
        next.onclick=()=>{next.replaceWith(answerCard(practice.find(q=>q.id===item.repair)));};feedback.append(next);
      }
    }
    button.onclick=()=>{
      let answer;
      try{answer=JSON.parse(input.value);}catch{feedback.textContent='Format not submitted. Use valid JSON; strings need double quotes.';return;}
      try{
        const assistance=records().filter(r=>r.type==='hint'&&r.module===item.module).map(r=>r.label);
        const result=save({type:'response',question:{id:item.id,module:item.module,kind:item.kind,prompt:item.prompt,
          versionHash:item.versionHash},answer,pass:JSON.stringify(answer)===JSON.stringify(item.answer),assistance});
        show(result); updateHintGate();
      }catch(error){storageFailure(error);}
    };
    try{const old=matching(item.id).at(-1);if(old){input.value=JSON.stringify(old.answer);show(old,true);}}
    catch(error){storageFailure(error);}
    return card;
  }
  function updateHintGate() {
    const last=document.querySelector('[data-final-hint]');if(!last)return;
    try{last.disabled=!records().some(r=>r.type==='response'&&r.question.module===current);}catch{last.disabled=true;}
  }
  function render(moduleId,moveFocus=false) {
    current=moduleId;const module=course.modules.find(m=>m.id===moduleId);root.replaceChildren();
    document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.module)===current?'step':'false'));
    root.append(el('div',`MODULE ${module.id} / ${course.modules.length}`,'eyebrow'));
    const h1=el('h1',module.title);h1.tabIndex=-1;root.append(h1);
    root.append(el('p',module.goal,'lead'));
    root.append(el('p',`Your build: ${module.artifact}`,'artifact'));
    root.append(el('p',module.depends.length?`Builds on modules ${module.depends.join(', ')}. All modules remain open.`:'Start here. JavaScript and terminal familiarity assumed.','small'));
    for(const section of module.sections) {
      root.append(el('h2',section.title));
      for(const paragraph of section.text.split('\n\n'))root.append(el('p',paragraph));
      root.append(answerCard(practice.find(q=>q.id===section.question)));
    }
    root.append(el('h2','Build and check'));
    root.append(el('p',module.build,'command'));
    const links=el('p');const contract=el('a','Read the API contract');contract.href='../PROTOCOL.md';links.append(contract,' · ');
    const capstone=el('a','Capstone and report');capstone.href='../CAPSTONE.md';links.append(capstone);root.append(links);
    const coding=el('a','Edit and run your implementation in the browser workbench below');coding.href='#code-lab';root.append(coding);
    root.append(el('p','The browser workbench runs your source with async Web Crypto. The Node CLI remains available. The optional reference trace below is separate from your run.','small'));
    const hints=el('div',undefined,'hints');hints.append(el('h3','Optional help'));
    module.hints.forEach((hint,i)=>{
      const button=el('button',`Show hint ${i+1}${i===2?' · after a response':''}`,'secondary');if(i===2)button.dataset.finalHint='true';
      button.onclick=()=>{try{save({type:'hint',module:current,label:`hint-${i+1}`});button.replaceWith(el('p',hint));}catch(error){storageFailure(error);}};
      hints.append(button);
    });root.append(hints);updateHintGate();
    if(current===3)renderTrace(root);
    const footer=el('div',undefined,'chapter-footer');
    if(current>1){const prev=el('button','← Previous module','secondary');prev.onclick=()=>render(current-1,true);footer.append(prev);}
    if(current<6){const next=el('button','Next module →');next.onclick=()=>render(current+1,true);footer.append(next);}
    root.append(footer);document.dispatchEvent(new CustomEvent('onion-module',{detail:{id:current}}));if(moveFocus)h1.focus();
  }
  function renderTrace(parent) {
    const panel=el('section',undefined,'trace');panel.append(el('h2','Step through a reference circuit'));
    panel.append(el('p','Predict which relay first sees the lookup as plaintext, then follow one reference run. This is generated from executed code; it is not your implementation.'));
    const field=el('input');field.setAttribute('aria-label','Your predicted relay');field.placeholder='Relay ID';panel.append(field);
    const reveal=el('button','Commit prediction and show trace');panel.append(reveal);
    const view=el('div');panel.append(view);
    reveal.onclick=()=>{
      if(!field.value.trim())return;
      try{save({type:'trace-prediction',prediction:field.value.trim(),question:'Which relay first sees plaintext lookup?',module:3});revealed=true;step=0;draw();}
      catch(error){storageFailure(error);}
    };
    function draw() {
      view.replaceChildren();if(!revealed)return;
      view.append(el('p',`Your prediction: ${field.value}. The first plaintext lookup is at maple, after its forward layer opens. Cedar and birch hold encrypted inner packets.`));
      const event=trace[step];
      view.append(el('p',`Step ${step+1} of ${trace.length}: ${event.observer} · ${event.direction}`,'eyebrow'));
      const route=el('div',undefined,'route');
      for(const id of ['client','cedar','birch','maple','archive'])route.append(el('span',id,id===event.observer?'active':''));view.append(route);
      const dl=el('dl');
      for(const [key,value] of Object.entries(event)){dl.append(el('dt',key),el('dd',typeof value==='object'?JSON.stringify(value):String(value)));}view.append(dl);
      const buttons=el('div',undefined,'trace-buttons');
      const back=el('button','← Previous step','secondary');back.disabled=step===0;back.onclick=()=>{step--;draw();};
      const forward=el('button','Next step →');forward.disabled=step===trace.length-1;forward.onclick=()=>{step++;draw();};
      const restart=el('button','Replay','secondary');restart.onclick=()=>{step=0;draw();};buttons.append(back,forward,restart);view.append(buttons);
      view.append(el('p','The process operator can inspect the complete trace. One relay’s displayed view is narrower. There is no network, TLS or real endpoint in this demonstration.','small'));
    }
    parent.append(panel);
  }
  const nav=document.querySelector('nav');
  course.modules.forEach(m=>{const button=el('button',`${m.id}. ${m.title}`,'nav-item');button.dataset.module=String(m.id);button.onclick=()=>render(m.id,true);nav.append(button);});
  document.querySelector('#export').onclick=()=>{
    try{
      const data={course:course.id,contentHash,exportedAt:new Date().toISOString(),records:records()};
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);
      const a=el('a');a.href=url;a.download='circuit-observatory-attempts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){storageFailure(error);}
  };
  render(1);
})();
