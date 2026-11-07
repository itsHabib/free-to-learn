import {check} from './checks.mjs';
const root=new URL('./',import.meta.url);
const load=async name=>{const r=await fetch(new URL(name,root));if(!r.ok)throw new Error(`cannot read ${name}: ${r.status}`);return r.text();};
function moduleURL(source){const resolved=source.replace(/(['"])\.\/(numeric|spec)\.mjs\1/g,(_,q,name)=>q+new URL(name+'.mjs',root).href+q);return URL.createObjectURL(new Blob([resolved],{type:'text/javascript'}));}
self.onmessage=async({data})=>{
 const urls=[];
 try{
   const config=JSON.parse(await load('course.json')),entry=moduleURL(data.source);urls.push(entry);
   const api=await import(entry);let project={};
   if(data.project.trim()){const u=moduleURL(data.project);urls.push(u);project=await import(u);}
   let fixture={};
   if(config.id==='small-llm-runtime'){const manifest=JSON.parse(await load('fixtures/manifest.json'));fixture={text:await load('fixtures/tiny-original.json'),digest:manifest.sha256,golden:JSON.parse(await load('fixtures/golden.json'))};}
   self.postMessage({kind:'check',report:await check(api,data.lesson,project,fixture)});
 }catch(error){self.postMessage({kind:'execution-error',message:String(error.message??error)});}
 finally{urls.forEach(URL.revokeObjectURL);}
};
