import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {check} from './checks.mjs';
const root=new URL('./',import.meta.url),config=JSON.parse(readFileSync(new URL('course.json',root),'utf8'));
process.on('message',async data=>{
 try{
   const api=await import(pathToFileURL(data.source).href);const project=data.project&&existsSync(data.project)?await import(pathToFileURL(data.project).href):{};
   let fixture={};
   if(config.id==='small-llm-runtime'){const manifest=JSON.parse(readFileSync(new URL('fixtures/manifest.json',root),'utf8'));fixture={text:readFileSync(new URL('fixtures/tiny-original.json',root),'utf8'),digest:manifest.sha256,golden:JSON.parse(readFileSync(new URL('fixtures/golden.json',root),'utf8'))};}
   if(data.lesson==='trained'){const {checkTrained}=await import('./trained-checks.mjs');fixture={modelBytes:readFileSync(new URL('fixtures/trained/stories260K.bin',root)),tokenizerBytes:readFileSync(new URL('fixtures/trained/tok512.bin',root)),goldens:JSON.parse(readFileSync(new URL('trained-goldens.json',root),'utf8'))};process.send({kind:'check',report:await checkTrained(api,project,fixture)});}
   else process.send({kind:'check',report:await check(api,data.lesson,project,fixture)});
 }catch(error){process.send({kind:'execution-error',message:String(error?.message??error)});}
 finally{process.disconnect();}
});
