import {modules} from '../public/content.mjs';
import {projects} from '../public/progression.mjs';
const [id,flag,answers]=process.argv.slice(2);
const text=html=>html.replace(/<\/p>/g,'\n\n').replace(/<[^>]*>/g,'').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&').trim();
if(!id){for(const m of modules)console.log(`${m.id}  ${m.title}`);}
else{
 const m=modules.find(m=>m.id===id);if(!m)throw Error('Choose M1 through M8.');
 if(flag&&flag!=='--answers')throw Error('Usage: node tools/lesson.mjs M1 [--answers A,B,C]');
 if(flag){
  const chosen=(answers??'').toUpperCase().split(',');if(chosen.length!==m.sections.length||chosen.some(a=>!['A','B','C'].includes(a)))throw Error('Supply three answers, for example A,B,C.');
  const results=m.sections.map((section,i)=>({item:i+1,selected:chosen[i],correct:chosen[i].charCodeAt(0)-65===section.answer,feedback:section.reason}));
  console.log(JSON.stringify({module:id,scope:'Conceptual practice feedback, not human mastery certification. Retain your first answer before reading feedback.',results},null,2));
 }else{
  console.log(`${m.id}: ${m.title}\n\nGoal: ${m.goal}\nUses: ${m.needs}\nYour artifact: ${m.artifact}\n`);
  m.sections.forEach((section,i)=>{console.log(`\n${i+1}. ${section.title}\n\n${text(section.body)}\n\nPractice ${i+1}: ${section.question}`);section.options.forEach((option,j)=>console.log(`${String.fromCharCode(65+j)}. ${option}`));});
  const p=projects[id];console.log(`\nCumulative project: ${p.title}`);p.steps.forEach((step,i)=>console.log(`${i+1}. ${step}`));console.log(`\nEvidence: ${p.evidence}\nFailure/repair experiment: ${p.failure}\n\nExact data shapes: public/CONTRACT.md\nRecord your answers before --answers A,B,C. No navigation or score gate is imposed.`);
 }
}
