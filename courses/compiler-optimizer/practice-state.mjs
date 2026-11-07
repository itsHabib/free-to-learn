// Pure practice-state contract shared by the offline reader and Node checks.
export function emptyPractice(revision){return {format:'optimizer-practice/1',revision,attempts:[]};}
export function inspectPractice(value,bank,revision){
  if(!value||value.format!=='optimizer-practice/1'||value.revision!==revision||!Array.isArray(value.attempts)||value.attempts.length>200)throw new Error('Use a practice export from this exact reader revision (at most 200 attempts).');
  const ids=new Set();
  for(const attempt of value.attempts){
    const item=bank.items.find(item=>item.id===attempt.item);
    if(!item||typeof attempt.id!=='string'||ids.has(attempt.id)||typeof attempt.at!=='string'||!Number.isFinite(Date.parse(attempt.at))||typeof attempt.helpUsed!=='string'||attempt.helpUsed.length>500||!Object.hasOwn(item.choices,attempt.choice)||JSON.stringify(attempt.question)!==JSON.stringify({prompt:item.prompt,choices:item.choices}))throw new Error('Malformed practice attempt. Your current history remains intact.');
    ids.add(attempt.id);
  }
  if(JSON.stringify(value).length>1024*1024)throw new Error('Practice export exceeds the 1 MiB profile.');
  return structuredClone(value);
}
export function commitPractice(state,bank,itemID,choice,helpUsed,{id,at}){
  inspectPractice(state,bank,state.revision);
  const item=bank.items.find(item=>item.id===itemID);if(!item||!Object.hasOwn(item.choices,choice))throw new Error('Choose an answer before committing.');
  if(typeof helpUsed!=='string'||helpUsed.length>500)throw new Error('Keep the help note at 500 characters or fewer.');
  const next=structuredClone(state);next.attempts.push({id,at,item:itemID,question:{prompt:item.prompt,choices:structuredClone(item.choices)},choice,helpUsed:helpUsed.trim()||'not declared'});
  return inspectPractice(next,bank,state.revision);
}
export function mergePractice(current,incoming,bank){
  inspectPractice(current,bank,current.revision);inspectPractice(incoming,bank,current.revision);
  const next=structuredClone(current),known=new Map(next.attempts.map(a=>[a.id,a]));
  for(const attempt of incoming.attempts){if(known.has(attempt.id)){if(JSON.stringify(known.get(attempt.id))!==JSON.stringify(attempt))throw new Error('Conflicting attempt ID; current history remains intact.');}else{next.attempts.push(structuredClone(attempt));known.set(attempt.id,attempt);}}
  return inspectPractice(next,bank,current.revision);
}
export function practiceFeedback(bank,attempt){const item=bank.items.find(item=>item.id===attempt.item);if(!item)throw new Error('Unknown item.');return {passed:attempt.choice===item.correct,correct:item.correct,reason:item.why,next:item.next};}
