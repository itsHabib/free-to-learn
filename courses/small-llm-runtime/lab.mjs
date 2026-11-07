import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,lstatSync,renameSync,realpathSync,openSync,fstatSync,closeSync,constants} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {createServer} from 'node:http';
import {PUBLIC_FILES} from './manifest.mjs';
import {REQUIREMENTS,cases} from './checks.mjs';
import {trainedCases} from './trained-checks.mjs';
import {zipFiles} from './zip.mjs';
const root=dirname(fileURLToPath(import.meta.url)),config=JSON.parse(readFileSync(join(root,'course.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function readRegular(path){if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())throw new Error(`require a regular file: ${path}`);return readFileSync(path,'utf8');}
function requireDirectory(path){const info=lstatSync(path);if(!info.isDirectory()||info.isSymbolicLink())throw new Error(`require a real directory, not a symlink: ${path}`);}
function attemptRoot(work){const path=join(work,'.attempts'),info=lstatSync(path,{throwIfNoEntry:false});if(info)requireDirectory(path);return path;}
function readProjectSibling(work){
 const path=join(work,'project.mjs'),info=lstatSync(path,{throwIfNoEntry:false});if(!info)return null;
 if(!info.isFile()||info.isSymbolicLink()||dirname(realpathSync(path))!==realpathSync(work))throw new Error(`project.mjs sibling must be a regular file inside the work directory, not a symlink: ${path}`);
 const descriptor=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{if(!fstatSync(descriptor).isFile())throw new Error('project.mjs sibling must be a regular file');return readFileSync(descriptor,'utf8');}finally{closeSync(descriptor);}
}
function identity(){if(existsSync(join(root,'package-manifest.json')))return JSON.parse(readRegular(join(root,'package-manifest.json')));return {sourceRevision:'uncommitted-development',inputHash:hash(PUBLIC_FILES.map(n=>n+'\0'+hash(readFileSync(join(root,n)))).join('\n'))};}
function validateWork(work){requireDirectory(work);const meta=JSON.parse(readRegular(join(work,'course-work.json')));if(meta.format!=='ivy-course-work-v1'||meta.course!==config.id)throw new Error('work folder belongs to a different course or format');}
function copySupport(dir){for(const name of config.support){const target=join(dir,name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,readFileSync(join(root,name)),{flag:'wx'});}}
function referenceHistory(work){
 const path=join(work,'.reference-support');if(!existsSync(path))return [];
 return readdirSync(path).sort().map(id=>{const dir=join(path,id),request=JSON.parse(readRegular(join(dir,'request.json')));if(request.format!=='ivy-reference-assistance-v1'||request.course!==config.id||typeof request.sourceBefore!=='string')throw new Error('invalid preserved reference-assistance record');return {...request,result:existsSync(join(dir,'result.json'))?JSON.parse(readRegular(join(dir,'result.json'))):{state:'pending'}};});
}
function useReference(lesson,work){
 validateWork(work);const index=JSON.parse(readRegular(join(root,'reference-support/index.json'))),item=index.modules[lesson];if(!item)throw new Error('choose module 02..08 for supplied earlier-layer support');
 const sourceBefore=readRegular(join(work,config.entry)),source=readRegular(join(root,item.file)),id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID(),dir=join(work,'.reference-support',id);
 mkdirSync(dir,{recursive:true});const request={format:'ivy-reference-assistance-v1',id,at:new Date().toISOString(),course:config.id,lesson,providedModules:item.providedModules,file:item.file,sourceBefore,sourceBeforeHash:hash(sourceBefore),referenceHash:hash(source),identity:identity()};
 writeFileSync(join(dir,'request.json'),JSON.stringify(request,null,2),{flag:'wx'});
 const temporary=join(work,'.reference-'+id+'.mjs');writeFileSync(temporary,source,{flag:'wx'});renameSync(temporary,join(work,config.entry));writeFileSync(join(dir,'result.json'),JSON.stringify({state:'applied',sourceHash:hash(readRegular(join(work,config.entry)))}),{flag:'wx'});
 console.log(`Supplied earlier modules ${item.providedModules.join(', ')} for module ${lesson}. Current module remains learner work. Original draft retained in ${dir}/request.json. Reference assistance is recorded automatically on later checks; project.mjs was not created or replaced.`);
}
function startTrained(work){validateWork(work);if(!existsSync(join(work,'trained-spec.mjs')))writeFileSync(join(work,'trained-spec.mjs'),readFileSync(join(root,'trained-spec.mjs')),{flag:'wx'});writeFileSync(join(work,'trained.mjs'),readFileSync(join(root,'trained-starter.mjs')),{flag:'wx'});console.log('Created trained.mjs without replacing earlier work; create trained-project.mjs yourself. Check: node lab.mjs check trained DIR --help-used TEXT.');}
function start(work){mkdirSync(work);writeFileSync(join(work,config.entry),readFileSync(join(root,config.starter)),{flag:'wx'});copySupport(work);writeFileSync(join(work,'trained.mjs'),readFileSync(join(root,'trained-starter.mjs')),{flag:'wx'});writeFileSync(join(work,'course-work.json'),JSON.stringify({format:'ivy-course-work-v1',course:config.id}),{flag:'wx'});console.log(`Created ${work}. Edit ${config.entry}; early TODO failures are expected. No capstone implementation was created.\nCheck: node ${fileURLToPath(import.meta.url)} check 01 ${work} --help-used none`);}
async function runCheck(lesson,work,help){
 if(!config.lessons.some(l=>l.id===lesson)&&lesson!=='all'&&lesson!=='trained')throw new Error('unknown lesson; choose 01..08, all or trained');if(help===undefined)throw new Error('declare help: --help-used none, or describe the help used');validateWork(work);
 const history=attemptRoot(work);
 const trained=lesson==='trained',sourceFile=trained?'trained.mjs':config.entry,projectFile=trained?'trained-project.mjs':'project.mjs';
 const source=readRegular(join(work,sourceFile)),project=existsSync(join(work,projectFile))?readRegular(join(work,projectFile)):'',prerequisiteSource=trained?readRegular(join(work,config.entry)):null,projectSiblingSource=trained?readProjectSibling(work):null;
 const question=trained?{modules:[{id:'08-trained',file:'TRAINED.md',text:readRegular(join(root,'TRAINED.md'))}],criteria:trainedCases.map(c=>({id:c.id,input:c.input,requirement:'TRAINED.md'}))}:{modules:config.lessons.filter(l=>lesson==='all'||l.id===lesson).map(l=>({...l,text:readRegular(join(root,l.file))})),criteria:cases.filter(c=>lesson==='all'||c.lesson===lesson).map(c=>({id:c.id,lesson:c.lesson,input:c.input,requirement:REQUIREMENTS[c.lesson]}))};
 const recordedReferenceSupport=referenceHistory(work);
 const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID(),dir=join(history,id),request={format:'ivy-course-attempt-v1',id,at:new Date().toISOString(),course:config.id,lesson,question,help,referenceSupport:recordedReferenceSupport,source,project,sourceHash:hash(source),projectHash:hash(project),identity:identity(),...(trained?{profile:'stories260k-v1',sourceFile,projectFile,prerequisiteSource,prerequisiteHash:hash(prerequisiteSource),projectSiblingFile:'project.mjs',projectSiblingSource,projectSiblingHash:projectSiblingSource===null?null:hash(projectSiblingSource)}:{})};
 mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'request.json'),JSON.stringify(request,null,2),{flag:'wx'});writeFileSync(join(dir,sourceFile),source,{flag:'wx'});copySupport(dir);if(trained)writeFileSync(join(dir,config.entry),prerequisiteSource,{flag:'wx'});if(project)writeFileSync(join(dir,projectFile),project,{flag:'wx'});if(trained&&projectSiblingSource!==null)writeFileSync(join(dir,'project.mjs'),projectSiblingSource,{flag:'wx'});
 const begin=performance.now(),result=await new Promise(resolveResult=>{
   const child=fork(join(root,'node-worker.mjs'),[],{stdio:['ignore','ignore','ignore','ipc'],execArgv:['--max-old-space-size=128']});let done=false;
   const finish=r=>{if(done)return;done=true;clearTimeout(timer);child.kill();resolveResult(r);};
   const timer=setTimeout(()=>finish({kind:'execution-error',message:'Five-second execution limit reached; inspect loops and retry.'}),5000);
   child.once('message',finish);child.once('error',e=>finish({kind:'execution-error',message:e.message}));child.once('exit',(code,signal)=>finish({kind:'execution-error',message:`execution ended before result: code=${code}, signal=${signal}`}));
   child.send({source:join(dir,sourceFile),project:project?join(dir,projectFile):null,lesson});
 });
 const receipt={...result,ms:performance.now()-begin,attempt:id};writeFileSync(join(dir,'result.json'),JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify(receipt,null,2));process.exitCode=result.kind==='check'?(result.report.pass?0:1):3;
}
function status(work){validateWork(work);const sourceHash=hash(readRegular(join(work,config.entry))),projectSibling=readProjectSibling(work),projectHash=hash(projectSibling??''),current=identity();const dir=attemptRoot(work);const reports=existsSync(dir)?readdirSync(dir).sort().map(id=>{const p=join(dir,id);requireDirectory(p);const r=JSON.parse(readRegular(join(p,'request.json'))),result=existsSync(join(p,'result.json'))?JSON.parse(readRegular(join(p,'result.json'))):{kind:'pending'};return {id,lesson:r.lesson,help:r.help,referenceSupport:(r.referenceSupport??[]).map(a=>({id:a.id,lesson:a.lesson,providedModules:a.providedModules,state:a.result.state})),result:result.kind,pass:result.report?.pass??null,current:r.sourceHash===(r.sourceFile==='trained.mjs'?(existsSync(join(work,'trained.mjs'))?hash(readRegular(join(work,'trained.mjs'))):null):sourceHash)&&r.projectHash===(r.projectFile==='trained-project.mjs'?hash(existsSync(join(work,'trained-project.mjs'))?readRegular(join(work,'trained-project.mjs')):''):projectHash)&&(!r.prerequisiteHash||r.prerequisiteHash===sourceHash)&&(!Object.hasOwn(r,'projectSiblingHash')||r.projectSiblingHash===(projectSibling===null?null:hash(projectSibling)))&&r.identity.inputHash===current.inputHash};}):[];console.log(JSON.stringify({course:config.id,reports},null,2));}
function exportWork(work,out){validateWork(work);const sibling=readProjectSibling(work),history=attemptRoot(work);if(existsSync(join(work,'trained.mjs'))&&!existsSync(join(work,config.entry)))throw new Error('Missing required earlier runtime.mjs dependency in trained work; export stopped before writing. Restore the preserved earlier source or its disclosed prerequisite support.');const files=PUBLIC_FILES.map(n=>[n,readFileSync(join(root,n))]);files.push(['package-manifest.json',JSON.stringify(identity(),null,2)]);for(const name of [config.entry,'project.mjs','trained.mjs','trained-project.mjs','course-work.json','workspace.json','data.json','REPORT.md']){if(name==='project.mjs'){if(sibling!==null)files.push(['work/'+name,sibling]);continue;}const p=join(work,name);if(existsSync(p))files.push(['work/'+name,readRegular(p)]);}
 for(const name of config.support){if(!PUBLIC_FILES.includes(name))throw new Error('support dependency is outside the learner package: '+name);const path=join(work,name);if(!existsSync(path))throw new Error('Missing required support '+name+' in work; export stopped before writing. Keep the dependency files supplied by lab start.');files.push(['work/'+name,readRegular(path)]);}
 if(existsSync(history))for(const id of readdirSync(history).sort()){requireDirectory(join(history,id));for(const name of ['request.json','result.json']){const p=join(history,id,name);if(existsSync(p))files.push(['work/.attempts/'+id+'/'+name,readRegular(p)]);}}
 const support=join(work,'.reference-support');if(existsSync(support))for(const id of readdirSync(support).sort())for(const name of ['request.json','result.json']){const p=join(support,id,name);if(existsSync(p))files.push(['work/.reference-support/'+id+'/'+name,readRegular(p)]);}
 writeFileSync(out,zipFiles(files),{flag:'wx'});console.log(`Exported ${out}. Unzip and run node lab.mjs check all work --help-used "exported work". Prior attempts retain their original source, help, contract and results.`);
}
function serve(port){const types={html:'text/html',mjs:'text/javascript',css:'text/css',json:'application/json',md:'text/plain',txt:'text/plain',bin:'application/octet-stream',zip:'application/zip'};const allowed=new Set([...PUBLIC_FILES,'package-manifest.json','course.zip']);const server=createServer((req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';if(!allowed.has(name)){res.writeHead(404);res.end('Not part of the learner package');return;}const data=name==='package-manifest.json'&&!existsSync(join(root,name))?JSON.stringify(identity()):name==='course.zip'&&!existsSync(join(root,name))?zipFiles([...PUBLIC_FILES.map(n=>[n,readFileSync(join(root,n))]),['package-manifest.json',JSON.stringify(identity(),null,2)+'\n']]):readFileSync(join(root,name));res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}catch{res.writeHead(404);res.end('File unavailable; use a built offline package.');}});server.on('error',error=>{console.error('Local server unavailable: '+error.message);process.exitCode=3;});server.listen(port,'127.0.0.1',()=>console.log(`Local course: http://127.0.0.1:${server.address().port}/ . Ctrl-C stops the server. Only the positive learner file list is served.`));}
try{
 const [command,...args]=process.argv.slice(2);
 if(command==='start'&&args.length===1)start(resolve(args[0]));
 else if(command==='trained-start'&&args.length===1)startTrained(resolve(args[0]));
 else if(command==='support'&&args.length===2)useReference(args[0],resolve(args[1]));
 else if(command==='check'&&args.length===4&&args[2]==='--help-used')await runCheck(args[0],resolve(args[1]),args[3]);
 else if(command==='status'&&args.length===1)status(resolve(args[0]));
 else if(command==='export'&&args.length===2)exportWork(resolve(args[0]),resolve(args[1]));
 else if(command==='serve'&&args.length<=1){const port=Number(args[0]??0);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('port must be 0..65535');serve(port);}
 else throw new Error('Usage: node lab.mjs start DIR | trained-start DIR | support 02..08 DIR | check 01..08/all/trained DIR --help-used TEXT | status DIR | export DIR OUTPUT.zip | serve [PORT]');
}catch(error){console.error('Invocation refused: '+error.message);process.exitCode=2;}
