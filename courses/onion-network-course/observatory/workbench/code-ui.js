/* Actual learner-code workbench. No reference implementation is supplied here. */
(() => {
  'use strict';
  const config=window.LAB.project,section=document.querySelector('#code-lab');
  const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  section.append(make('div','YOUR IMPLEMENTATION','eyebrow'),make('h2','Run your onion circuit'));
  section.append(make('p','Edit the eight functions below. Each run executes this source in a new worker using built-in Web Crypto. Your source and the exact requirements are saved before execution.'));
  const api=make('p');const contract=make('a','Browser API and async example');contract.href='../BROWSER.md';api.append(contract,' · ');
  const cli=make('a','Existing CLI route');cli.href='../README.md';api.append(cli);section.append(api);
  section.append(make('p','seal and open return Promises here. Use await inside the supplied async functions. The expectedSeq argument must be used at every return layer. No imports or exports are needed.','small'));
  const sourceLabel=make('label','Your browser project source');sourceLabel.htmlFor='project-source';section.append(sourceLabel);
  const editor=make('textarea');editor.id='project-source';editor.rows=24;editor.spellcheck=false;editor.value=config.starter;editor.setAttribute('aria-describedby','project-source-note');section.append(editor);
  const note=make('p','The starter is intentionally incomplete. Fix one module at a time; a TODO failure is expected at the start.','small');note.id='project-source-note';section.append(note);
  const sourceTools=make('div',undefined,'project-controls');
  const save=make('button','Save draft','secondary'),download=make('button','Download code','secondary');sourceTools.append(save,download);
  const fileLabel=make('label','Load your code file '),file=make('input');file.type='file';file.accept='.js,.txt';fileLabel.append(file);sourceTools.append(fileLabel);section.append(sourceTools);
  const controls=make('div',undefined,'project-controls');
  const stageLabel=make('label','Check through module '),stage=make('select');stage.id='project-module';
  for(let i=1;i<=6;i++){const o=make('option',String(i));o.value=String(i);stage.append(o);}stageLabel.append(stage);controls.append(stageLabel);
  const helpLabel=make('label','Help used '),help=make('input');help.value='none-declared';helpLabel.append(help);controls.append(helpLabel);
  const check=make('button','Run module checks'),capstone=make('button','Run capstone','secondary'),stop=make('button','Stop run','secondary');stop.disabled=true;controls.append(check,capstone,stop);section.append(controls);
  const scenarioControls=make('div',undefined,'project-controls');const scenarioLabel=make('label','Diagnosis '),scenario=make('select');
  for(const id of ['round-trip','tamper','replay','wrong-request','failed-hop','lost-reply']){const o=make('option',id);o.value=id;scenario.append(o);}scenarioLabel.append(scenario);scenarioControls.append(scenarioLabel);
  const itemLabel=make('label','Fictional record '),item=make('select');for(const id of ['luna','tide']){const o=make('option',id);o.value=id;item.append(o);}itemLabel.append(item);scenarioControls.append(itemLabel);
  const hopsLabel=make('label','Hops '),hops=make('select');for(const i of [3,2,4]){const o=make('option',String(i));o.value=String(i);hops.append(o);}hopsLabel.append(hops);scenarioControls.append(hopsLabel);
  const diagnose=make('button','Run diagnosis');scenarioControls.append(diagnose);section.append(scenarioControls);
  const predictionLabel=make('label','Prediction before diagnosis (optional) '),prediction=make('input');prediction.placeholder='Which observation would change your claim?';predictionLabel.append(prediction);section.append(predictionLabel);
  const workshopArea=make('details'),workshopHeading=make('summary','Multi-circuit failure and recovery workshop');workshopArea.id='workshop';workshopArea.append(workshopHeading);section.append(workshopArea);
  const workshop=WorkshopUI.mount({container:workshopArea,make,initial:config.workshopStarter,onChange:()=>updateStale()});
  const workshopControls=make('div',undefined,'project-controls'),runWorkshop=make('button','Run experiment'),saveWorkshop=make('button','Save experiment draft','secondary'),downloadWorkshop=make('button','Download scenario','secondary');
  const scenarioFileLabel=make('label','Load scenario JSON '),scenarioFile=make('input');scenarioFile.type='file';scenarioFile.accept='.json';scenarioFileLabel.append(scenarioFile);
  workshopControls.append(runWorkshop,saveWorkshop,downloadWorkshop,scenarioFileLabel);workshopArea.append(workshopControls);
  const status=make('p','Ready. No code has run.','project-status');status.setAttribute('role','status');section.append(status);
  const stale=make('p','','small');section.append(stale);
  const output=make('div');output.id='project-results';output.setAttribute('aria-live','polite');section.append(output);
  const historyButton=make('button','Export project history','secondary');section.append(historyButton);
  const historyLabel=make('label',' Inspect saved run '),historySelect=make('select');historyLabel.append(historySelect);section.append(historyLabel);
  section.append(make('p','All relays are simulated in one worker. Keys last only for that run and are never saved. Network access is disabled by page policy and worker guards. This is not a secure grader for hostile source or a real anonymity system.','small'));
  let last=null,session=null,available=true;
  function downloadText(name,value,type='text/plain'){const url=URL.createObjectURL(new Blob([value],{type}));const a=make('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function setRunning(value){for(const button of [check,capstone,diagnose,runWorkshop])button.disabled=value||!available;stop.disabled=!value;}
  function updateStale(){
    if(!last){stale.textContent='';return;}
    const sourceMatches=editor.value===last.submission.source;
    const scenarioMatches=last.submission.command!=='workshop'||JSON.stringify(workshop.snapshot())===JSON.stringify(last.submission.options.scenario);
    stale.textContent=!sourceMatches?'Editor changed. Shown result belongs to the saved source, not these edits.':!scenarioMatches?'Scenario changed. Shown result belongs to the saved experiment, not these steps or predictions.':'Shown result belongs to the current editor source and, for an experiment, its current scenario.';
  }
  function refreshHistory(){
    historySelect.replaceChildren(make('option','Choose a saved result'));
    try{for(const r of session.history().filter(r=>r.kind==='result').reverse()){
      const option=make('option',`${r.createdAt} · ${r.sourceHash.slice(0,10)}${r.buildId!==window.LAB.contentHash?' · older build':''}`);option.value=r.id;historySelect.append(option);
    }}catch(error){status.textContent=`History could not be read: ${error.message}. Existing records were not changed.`;}
  }
  function showTrace(container,diagnosis){
    const area=make('div',undefined,'trace');area.append(make('h3',`Your run · ${diagnosis.scenario}`));
    for(const event of diagnosis.events){const line=make('p',`${event.action}: ${event.code??event.outcome??JSON.stringify(event.plan)}`);area.append(line);}
    const runs=[{label:'Original circuit',...diagnosis},...(diagnosis.replacement?[{label:'Replacement circuit',...diagnosis.replacement}]:[])];
    for(const run of runs){
      area.append(make('h3',run.label));const label=make('label','Observer view '),select=make('select');
      for(const id of [...run.path,'archive','operator']){const option=make('option',id==='operator'?'Process operator (all events)':id);option.value=id;select.append(option);}label.append(select);area.append(label);
      const view=make('div');area.append(view);let index=0;
      function draw(){
        view.replaceChildren();const events=select.value==='operator'?run.trace:run.trace.filter(e=>e.observer===select.value);
        if(!events.length){view.append(make('p','No event was recorded for this observer before the run stopped.'));return;}
        index=Math.min(index,events.length-1);view.append(make('p',`Event ${index+1} of ${events.length}. ${select.value==='operator'?'The operator sees the combined trace.':'Only events recorded at this observer are shown.'}`,'small'));
        const values=make('dl');for(const [key,value] of Object.entries(events[index]))values.append(make('dt',key),make('dd',typeof value==='object'?JSON.stringify(value):String(value)));view.append(values);
        const back=make('button','Previous event','secondary'),next=make('button','Next event','secondary');back.disabled=index===0;next.disabled=index===events.length-1;
        back.onclick=()=>{index--;draw();};next.onclick=()=>{index++;draw();};const nav=make('div',undefined,'project-controls');nav.append(back,next);view.append(nav);
      }
      select.onchange=()=>{index=0;draw();};draw();
    }
    container.append(area);
  }
  function showResult({submission,receipt,saved}){
    last={submission,receipt};setRunning(session?.isRunning()??false);output.replaceChildren();
    output.append(make('h3',`${submission.command} · saved source ${receipt.sourceHash.slice(0,12)}`));
    output.append(make('p',`Build ${receipt.buildId.slice(0,12)} · ${submission.command==='check'?'through module '+submission.through:submission.options.mode??'all scenarios'} · Help: ${submission.assistance}${saved?'':' · RESULT NOT SAVED'}`,'small'));
    const result=receipt.result;
    if(result.kind==='workshop'){
      output.append(make('p',`Scenario SHA-256: ${submission.scenarioHash??'see saved scenario'}`,'small'));
      WorkshopUI.render({container:output,make,result});
    }
    if(result.executionFailure)output.append(make('p',`${result.code}: ${result.detail}`));
    if(result.checks){
      output.append(make('p',`${result.checks.passed}/${result.checks.total} requirements passed.`));
      const list=make('ul',undefined,'check-results');for(const r of result.checks.results){
        const li=make('li',`${r.pass?'PASS':'FAIL'} ${r.id}: ${r.requirement}`);
        if(!r.pass){li.append(make('p',`${r.code}: ${r.detail}`),make('pre',JSON.stringify({input:r.input,actual:r.actual,expected:r.expected},null,2)));const link=make('a',`Repair in module ${r.module}`);link.href=`../lessons/0${r.module}.md`;li.append(link);}list.append(li);
      }output.append(list);
    }
    const scenarios=Array.isArray(result.scenarios)?result.scenarios:result.trace?[result]:[];
    for(const d of scenarios)showTrace(output,d);
    const details=make('details'),summary=make('summary','Complete actual result');details.append(summary,make('pre',JSON.stringify(result,null,2)));output.append(details);
    updateStale();refreshHistory();
  }
  try{
    if(!globalThis.Worker||!globalThis.crypto?.subtle||!globalThis.crypto?.randomUUID||!globalThis.URL?.createObjectURL)throw new Error('This origin lacks Worker or Web Crypto support. Use the documented CLI route; no simulation has been substituted.');
    const storage=window.localStorage;
    session=ProjectSession.createProjectSession({storage,buildId:window.LAB.contentHash,runtimeHash:config.runtimeHash,requirements:config.requirements,workshopContract:config.workshopContract,
      makeWorker:()=>{const url=URL.createObjectURL(new Blob([config.worker],{type:'text/javascript'}));let worker;
        try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}
        const terminate=worker.terminate.bind(worker);worker.terminate=()=>{terminate();URL.revokeObjectURL(url);};return worker;},
      onStatus:message=>{status.textContent=message;},onResult:showResult});
    const draft=storage.getItem('circuit-observatory/editor-draft');if(draft!==null)editor.value=draft;
    else {const prior=session.history().filter(r=>r.kind==='submission').at(-1);if(prior)editor.value=prior.source;}
    refreshHistory();
    const workshopDraft=storage.getItem('circuit-observatory/workshop-draft/v1');
    if(workshopDraft!==null){try{workshop.load(JSON.parse(workshopDraft));}catch(error){status.textContent=`Experiment draft could not be read: ${error.message}. It remains stored; the starter is shown.`;}}
  }catch(error){available=false;status.textContent=error.message;setRunning(false);}
  async function run(command){
    if(!session)return;setRunning(true);
    try{await session.run({source:editor.value,command,through:Number(stage.value),options:command==='workshop'?{scenario:workshop.snapshot()}:{mode:scenario.value,item:item.value,length:Number(hops.value)},assistance:help.value||'none-declared',prediction:prediction.value});}
    catch(error){status.textContent=`Not run: ${error.message}`;setRunning(false);}
  }
  check.onclick=()=>run('check');capstone.onclick=()=>run('capstone');diagnose.onclick=()=>run('diagnose');stop.onclick=()=>{session?.cancel();setRunning(false);};
  runWorkshop.onclick=()=>run('workshop');
  saveWorkshop.onclick=()=>{try{localStorage.setItem('circuit-observatory/workshop-draft/v1',JSON.stringify(workshop.snapshot()));status.textContent='Experiment draft saved. Earlier committed scenarios and source were not changed.';}catch(error){status.textContent=`Draft not saved: ${error.message}. Download the scenario to keep it.`;}};
  downloadWorkshop.onclick=()=>downloadText('onion-scenario.json',JSON.stringify(workshop.snapshot(),null,2),'application/json');
  scenarioFile.onchange=async()=>{const selected=scenarioFile.files[0];if(!selected)return;if(selected.size>100000){status.textContent='Scenario file exceeds 100,000 bytes; unchanged.';return;}try{workshop.load(JSON.parse(await selected.text()));status.textContent='Scenario loaded; nothing executed.';}catch(error){status.textContent=`Could not load scenario: ${error.message}`;}};
  editor.addEventListener('input',updateStale);
  save.onclick=()=>{try{localStorage.setItem('circuit-observatory/editor-draft',editor.value);status.textContent='Draft saved. Committed attempts were not changed.';}catch(error){status.textContent=`Draft not saved: ${error.message}. Download the source to keep a copy.`;}};
  download.onclick=()=>downloadText('browser-solution.js',editor.value);
  file.onchange=async()=>{const selected=file.files[0];if(!selected)return;if(selected.size>100000){status.textContent='File too large; editor unchanged.';return;}try{const text=await selected.text();editor.value=text;updateStale();status.textContent='Code loaded into the editor. Nothing executed.';}catch(error){status.textContent=`Could not read file: ${error.message}. Editor unchanged.`;}};
  historyButton.onclick=()=>{try{downloadText('onion-project-history.json',JSON.stringify(session.exportRecords(),null,2),'application/json');}catch(error){status.textContent=`Export failed: ${error.message}`;}};
  historySelect.onchange=()=>{try{const entries=session.history(),receipt=entries.find(r=>r.kind==='result'&&r.id===historySelect.value),submission=entries.find(r=>r.kind==='submission'&&r.id===historySelect.value);if(receipt&&submission)showResult({receipt,submission,saved:true});}catch(error){status.textContent=error.message;}};
  document.addEventListener('onion-module',event=>{stage.value=String(event.detail.id);});
})();
