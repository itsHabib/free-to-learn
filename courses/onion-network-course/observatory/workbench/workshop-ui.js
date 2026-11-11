/* Scenario authoring and observer projections; shares the existing source editor/session. */
const WorkshopUI=(()=>{
  function mount({container,make,initial,onChange}) {
    let scenario=structuredClone(initial),editIndex=null;
    const titleLabel=make('label','Experiment title'),title=make('input');title.value=scenario.title;title.id='workshop-title';titleLabel.append(title);container.append(titleLabel);
    const notice=make('p','Change or reorder the steps, then commit observer predictions before running your current code. No step runs while you edit.','small');container.append(notice);
    const guide=make('a','Workshop tasks and scenario format');guide.href='../WORKSHOP.md';container.append(guide);
    const list=make('ol');list.id='workshop-steps';container.append(list);
    const controls=make('div',undefined,'project-controls');container.append(controls);
    function input(label,id,options) {
      const wrapper=make('label',label),node=make(options?'select':'input');node.id=id;
      if(options)for(const value of options){const option=make('option',String(value));option.value=String(value);node.append(option);}
      wrapper.append(node);controls.append(wrapper);return node;
    }
    const action=input('Action','workshop-action',['open','send','replay','offline','online','recover','close']);
    const circuit=input('Circuit name','workshop-circuit');circuit.value='alpha';
    const packet=input('Packet name','workshop-packet');packet.value='newPacket';
    const replacement=input('Replacement name','workshop-replacement');replacement.value='delta';
    const length=input('Path length','workshop-length',[3,2,4]);
    const relays=input('Relay names (comma separated)','workshop-relays');
    const item=input('Record','workshop-item',['luna','tide']);
    const fault=input('Injected fault','workshop-fault',['none','drop-forward','corrupt-forward','drop-reply']);
    const hop=input('Fault at hop (0 = entry)','workshop-hop',[0,1,2,3]);
    const hint=make('p','','small');container.append(hint);
    function enable() {
      circuit.disabled=['offline','online'].includes(action.value);packet.disabled=!['send','replay'].includes(action.value);
      replacement.disabled=action.value!=='recover';length.disabled=action.value!=='open';
      relays.disabled=!['open','offline','online','recover'].includes(action.value);
      item.disabled=action.value!=='send';fault.disabled=action.value!=='send';
      hop.disabled=action.value!=='send'||!['drop-forward','corrupt-forward'].includes(fault.value);
      hint.textContent=action.value==='open'?'Relay names are excluded from this path.':action.value==='recover'?'Relay names are the failures you tell recoveryPlan about; offline relays also remain unavailable.':action.value==='send'?'Use a new packet name. A fault affects this delivery only; the original bytes are captured before injection.':action.value==='replay'?'Inject the exact saved forward packet into the named circuit; no re-encryption.':'Relay names apply to online/offline actions. Closed circuits are never reopened by restoring a relay.';
    }
    action.onchange=enable;fault.onchange=enable;enable();
    const apply=make('button','Add step','secondary'),cancel=make('button','Cancel step edit','secondary');container.append(apply,cancel);
    const message=make('p','','small');message.setAttribute('role','status');container.append(message);
    function changed(){onChange?.();}
    function reset(){editIndex=null;apply.textContent='Add step';cancel.disabled=true;}
    function draw(){
      list.replaceChildren();
      scenario.steps.forEach((step,i)=>{
        const row=make('li');row.append(make('code',JSON.stringify(step)));
        for(const [label,fn] of [
          ['Edit',()=>{editIndex=i;action.value=step.action;circuit.value=step.circuit??'alpha';packet.value=step.packet??'newPacket';replacement.value=step.replacement??'delta';length.value=String(step.length??3);relays.value=(step.avoid??step.failed??step.relays??[]).join(', ');item.value=step.item??'luna';fault.value=step.fault?.kind??'none';hop.value=String(step.fault?.hop??0);apply.textContent='Update step';cancel.disabled=false;enable();}],
          ['Move up',()=>{[scenario.steps[i-1],scenario.steps[i]]=[step,scenario.steps[i-1]];reset();draw();changed();}],
          ['Move down',()=>{[scenario.steps[i+1],scenario.steps[i]]=[step,scenario.steps[i+1]];reset();draw();changed();}],
          ['Remove',()=>{scenario.steps.splice(i,1);reset();draw();changed();}]
        ]) {const button=make('button',label,'secondary');button.setAttribute('aria-label',`${label} step ${i+1}`);button.disabled=label==='Move up'&&i===0||label==='Move down'&&i===scenario.steps.length-1;button.onclick=fn;row.append(button);}
        list.append(row);
      });
    }
    apply.onclick=()=>{
      if(editIndex===null&&scenario.steps.length>=32){message.textContent='Use at most 32 steps.';return;}
      const step={action:action.value},names=relays.value.split(',').map(x=>x.trim()).filter(Boolean);
      if(!['offline','online'].includes(step.action))step.circuit=circuit.value.trim();
      if(step.action==='open'){step.length=Number(length.value);step.avoid=names;}
      if(['send','replay'].includes(step.action))step.packet=packet.value.trim();
      if(step.action==='send'){step.item=item.value;if(fault.value!=='none'){step.fault={kind:fault.value};if(fault.value!=='drop-reply')step.fault.hop=Number(hop.value);}}
      if(['offline','online'].includes(step.action))step.relays=names;
      if(step.action==='recover'){step.replacement=replacement.value.trim();step.failed=names;}
      if(editIndex===null)scenario.steps.push(step);else scenario.steps[editIndex]=step;
      reset();draw();changed();message.textContent='Scenario updated; nothing executed. The worker validates the complete scenario before running steps.';
    };
    cancel.onclick=reset;
    const predictionFields=[];
    container.append(make('h4','Predict before running'));
    const predictions=make('div',undefined,'workshop-predictions');container.append(predictions);
    for(const observer of ['client','cedar','birch','maple','elm','ash','archive','operator']) {
      const label=make('label',`${observer}: direct fact, inference, or still unknown?`),field=make('input');field.id=`prediction-${observer}`;
      field.value=scenario.predictions.filter(p=>p.observer===observer).map(p=>p.claim).join('\n');field.maxLength=2000;
      label.append(field);predictions.append(label);predictionFields.push({observer,field});field.addEventListener('input',changed);
    }
    title.addEventListener('input',changed);reset();draw();
    function snapshot(){return {version:1,title:title.value,predictions:predictionFields.filter(p=>p.field.value.trim()).map(p=>({observer:p.observer,claim:p.field.value})),steps:structuredClone(scenario.steps)};}
    function load(value){
      if(value?.version!==1||typeof value.title!=='string'||!Array.isArray(value.steps)||value.steps.length>32||!value.steps.every(s=>s&&typeof s==='object'&&!Array.isArray(s))||!Array.isArray(value.predictions)||!value.predictions.every(p=>p&&typeof p.observer==='string'&&typeof p.claim==='string'))throw new Error('Not a version 1 workshop scenario.');
      if(Object.keys(value).some(k=>!['version','title','predictions','steps'].includes(k))||value.predictions.length>12||value.predictions.some(p=>Object.keys(p).some(k=>!['observer','claim'].includes(k))||!predictionFields.some(f=>f.observer===p.observer)))throw new Error('Unknown scenario fields or observers; existing draft preserved.');
      if(predictionFields.some(p=>value.predictions.filter(x=>x.observer===p.observer).map(x=>x.claim).join('\n').length>2000))throw new Error('Keep each observer prediction within 2,000 characters.');
      scenario=structuredClone(value);title.value=value.title;
      for(const p of predictionFields)p.field.value=value.predictions.filter(x=>x.observer===p.observer).map(x=>x.claim).join('\n');
      reset();draw();changed();
    }
    return {snapshot,load};
  }
  function render({container,make,result}) {
    const area=make('div',undefined,'trace');area.append(make('h3',`Experiment · ${result.title}`),make('p',result.reasoning));
    area.append(make('p','Predictions committed before execution:'));
    for(const p of result.predictions)area.append(make('p',`${p.observer}: ${p.claim}`));
    const label=make('label','Evidence view '),select=make('select');select.id='workshop-observer';
    for(const id of ['client',...Object.keys(result.observations).filter(x=>x!=='client'),'operator']){const option=make('option',id==='operator'?'Operator — all steps, causes and state':id);option.value=id;select.append(option);}
    label.append(select);area.append(label);const view=make('div');view.id='workshop-evidence';area.append(view);
    function draw(){
      view.replaceChildren();const id=select.value;
      view.append(make('p',id==='operator'?'This view exposes the fault script and all receiver state. It is not any single relay’s knowledge.':'Only local observations are shown. Absence here does not prove nothing happened elsewhere. Step numbers and circuit aliases are teaching labels, not timing evidence.','small'));
      const events=id==='operator'?result.steps:result.observations[id];
      if(!events.length)view.append(make('p','No recorded events for this observer.'));
      for(const event of events)view.append(make('pre',JSON.stringify(event,null,2)));
    }
    select.onchange=draw;draw();area.append(make('p',result.visibility,'small'));container.append(area);
  }
  return {mount,render};
})();
