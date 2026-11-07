const numberWords=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
function count(answer){
  const value=String(answer).trim().toLowerCase();
  const word=numberWords.indexOf(value);if(word!==-1)return word;
  const match=value.match(/^([+-]?\d+(?:\.0+)?)(?:\s+(?:bytes?|components?|nodes?|checks?|requirements?|sources?|parts?|releases?))?$/);
  if(!match)return null;
  const n=Number(match[1]);return Number.isSafeInteger(n)?n:null;
}
export function answerProblem(question,answer){
  if(/^\d+$/.test(question.expected||'')&&count(answer)===null)return 'Enter a whole number using digits, an equivalent whole-number decimal, or a number word. Matching units are optional.';
  return null;
}
export function evaluate(question,answer) {
  const value=String(answer).trim().toLowerCase();
  if(/^\d+$/.test(question.expected||''))return count(value)===Number(question.expected);
  if(question.kind!=='order') return value===question.expected;
  const order=value.split(',').map(x=>x.trim()), position=new Map(order.map((x,i)=>[x,i]));
  return order.length===question.nodes.length && position.size===order.length && question.nodes.every(x=>position.has(x)) && question.edges.every(([node,dependency])=>position.get(dependency)<position.get(node));
}
export function eventFor(question,answer,{build,assisted=false,notes='',now=new Date().toISOString()}={}) {
  return {schema:1,build,question:{...question},answer:String(answer),assisted:Boolean(assisted),notes:String(notes),at:now,correct:evaluate(question,answer)};
}
export function readJournal(storage,key) {
  const raw=storage.getItem(key);
  if(raw===null) return {schema:1,events:[]};
  const value=JSON.parse(raw);
  if(value?.schema!==1||!Array.isArray(value.events)||value.events.some(x=>!x.question?.id||typeof x.answer!=='string'||typeof x.build!=='string')) throw new Error('Saved journal has an unsupported format. Export it before continuing.');
  return value;
}
export function appendJournal(storage,key,journal,event) {
  const latest=readJournal(storage,key);
  const next={schema:1,events:[...latest.events,event]};
  // Save before returning feedback. A failed write leaves the earlier journal intact.
  storage.setItem(key,JSON.stringify(next));
  return next;
}
