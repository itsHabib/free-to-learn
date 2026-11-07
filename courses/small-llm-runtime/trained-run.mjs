// Supplied local launcher. It loads and calls the learner's code, not an author decoder.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=new URL('./',import.meta.url);
export async function loadWork(directory){
 const work=resolve(directory),api=await import(pathToFileURL(join(work,'trained.mjs')).href);
 const project=existsSync(join(work,'trained-project.mjs'))?await import(pathToFileURL(join(work,'trained-project.mjs')).href):{};
 if(typeof api.loadModel!=='function')throw new Error('Export loadModel from work/trained.mjs; read TRAINED.md');
 const model=await api.loadModel(readFileSync(new URL('fixtures/trained/stories260K.bin',root)),readFileSync(new URL('fixtures/trained/tok512.bin',root)));
 const runtime={prefill:(m,p)=>api.prefill(m,p),decodeStep:(m,t,c)=>api.decodeStep(m,t,c),forward:(m,p)=>api.forward(m,p),generate:(m,p,o)=>api.generate(m,p,o),encode:(text,options)=>api.encode(model,text,options),decode:ids=>api.decode(model,ids),rng:seed=>api.rng(seed),sample:(logits,options,random)=>api.sample(logits,options,random)};
 return {work,api,project,model,runtime};
}
const write=object=>new Promise((resolveWrite,reject)=>process.stdout.write(JSON.stringify(object)+'\n',error=>error?reject(error):resolveWrite()));
async function main(){
 const [directory,text,...flags]=process.argv.slice(2);if(directory===undefined||text===undefined||flags.length%2)throw new Error('Usage: node trained-run.mjs WORK PROMPT [--mode generate|stream|beam] [--max-new-tokens N] [--seed N] [--temperature N] [--top-k N] [--beam-width N]');
 const options={maxNewTokens:16,seed:1,temperature:1,topK:512};let mode='generate',beamWidth=2;const seen=new Set();
 for(let i=0;i<flags.length;i+=2){const flag=flags[i],value=flags[i+1];if(seen.has(flag))throw new Error('duplicate flag '+flag);seen.add(flag);if(flag==='--mode'){if(!['generate','stream','beam'].includes(value))throw new Error('mode must be generate, stream or beam');mode=value;continue;}const number=Number(value);if(value.trim()===''||!Number.isFinite(number))throw new Error('numeric flag required '+flag);if(flag==='--max-new-tokens')options.maxNewTokens=number;else if(flag==='--seed')options.seed=number;else if(flag==='--temperature')options.temperature=number;else if(flag==='--top-k')options.topK=number;else if(flag==='--beam-width')beamWidth=number;else throw new Error('unknown flag '+flag);}
 if(!Number.isInteger(options.maxNewTokens)||options.maxNewTokens<0||options.maxNewTokens>512||!Number.isSafeInteger(options.seed)||options.seed<0||options.seed>0xffffffff||options.temperature<0||!Number.isInteger(options.topK)||options.topK<1||options.topK>512)throw new Error('invalid generation controls; read TRAINED.md');
 if(mode==='beam'&&(!Number.isInteger(beamWidth)||beamWidth<1||beamWidth>4||options.maxNewTokens<1||options.maxNewTokens>4))throw new Error('beam width and token budget must be integers1..4; specify --max-new-tokens');
 if(mode==='beam'&&['--seed','--temperature','--top-k'].some(flag=>seen.has(flag)))throw new Error('Beam uses full-vocabulary temperature1 scores and no RNG; omit sampling flags.');
 if(mode!=='beam'&&seen.has('--beam-width'))throw new Error('--beam-width applies only to --mode beam.');
 const {api,project,model,runtime}=await loadWork(directory),prompt=api.encode(model,text),identity={modelSha256:model.fingerprint,tokenizerSha256:model.tokenizerFingerprint,promptText:text,prompt,mode,options:mode==='beam'?{beamWidth,maxNewTokens:options.maxNewTokens}:options};
 if(mode==='generate'){await write({...identity,result:await api.generate(model,prompt,options)});return;}
 if(mode==='beam'){if(typeof project.beamDecode!=='function')throw new Error('Export beamDecode in trained-project.mjs');await write({...identity,beamWidth,result:await project.beamDecode(runtime,model,prompt,{beamWidth,maxNewTokens:options.maxNewTokens})});return;}
 if(typeof project.streamGenerate!=='function')throw new Error('Export streamGenerate in trained-project.mjs');
 await write({type:'start',...identity});
 for await(const event of project.streamGenerate(runtime,model,prompt,options))await write(event);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await main();}catch(error){console.error('Trained run failed: '+String(error?.message??error));process.exitCode=1;}}
