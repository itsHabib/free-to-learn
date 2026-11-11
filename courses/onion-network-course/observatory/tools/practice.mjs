import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { practice, gradePractice } from '../checks/practice.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [id,raw,help='none-declared']=process.argv.slice(2);
const item=practice.find(p=>p.id===id);
if(!item) {console.log('Use: node tools/practice.mjs ID [JSON-answer] [help-used]\n'+practice.map(p=>`${p.id}: ${p.prompt}`).join('\n'));process.exitCode=id?2:0;}
else if(raw===undefined) console.log(`${item.prompt}\nSubmit JSON, with shell single quotes around arrays or strings. Your response is saved before feedback.`);
else {
  try {
    const answer=JSON.parse(raw);
    const question={id:item.id,module:item.module,kind:item.kind,prompt:item.prompt};
    const attempt={id:randomUUID(),createdAt:new Date().toISOString(),question,answer,assistance:help,
      questionHash:createHash('sha256').update(JSON.stringify(question)).digest('hex')};
    const folder=resolve(root,'practice-attempts',attempt.id); await mkdir(folder,{recursive:true});
    await writeFile(resolve(folder,'attempt.json'),JSON.stringify(attempt,null,2)+'\n',{flag:'wx'});
    const result=gradePractice(item,answer);
    await writeFile(resolve(folder,'feedback.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(`${item.kind==='prediction'?'Prediction recorded':result.pass?'Supported answer':'Needs repair'}\nYou submitted ${JSON.stringify(answer)}. Expected ${JSON.stringify(result.expected)}.\n${result.reason}`);
    if(!result.pass&&result.repair) console.log(`Try fresh item: node tools/practice.mjs ${result.repair}`);
    console.log(`Saved: ${folder}`);
  } catch(error) {console.error(`Not submitted: ${error.message}. Check JSON syntax and writable storage. No feedback was revealed.`);process.exitCode=2;}
}
