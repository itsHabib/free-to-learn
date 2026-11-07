// Optional explicit terminal-only smoke. Default invocation is a dry run.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadModules} from './loader.mjs';
import {initial} from './game.mjs';
import {createHttpTransport} from './provider.mjs';
import {sha256} from './bundle.mjs';
const args=process.argv.slice(2),armed=args.includes('--arm'),paths=args.filter(x=>!x.startsWith('--'));
if(paths.length<2)throw Error('Usage: node live.mjs CONFIG.json WORKDIR [--arm]. No request without --arm.');
const config=JSON.parse(await readFile(paths[0],'utf8'));
if(config.maxRequests!==1)throw Error('This smoke permits exactly one reserved request.');
const sources={};for(const name of ['observe.mjs','constraints.mjs','adapter.mjs'])sources[name]=await readFile(join(paths[1],name),'utf8');
const m=await loadModules(sources),obs=m['observe.mjs'].observe(initial('public-smoke')),request=m['adapter.mjs'].buildRequest(obs,m['constraints.mjs'].allowedActions(obs),{model:config.model,host:'api.liquid.ai'});
const transport=createHttpTransport({...config,arm:armed});
if(!armed){console.log(JSON.stringify({mode:'dry-run',status:transport.status(),request},null,2));}
if(armed){const raw=await transport.send(request),proposal=m['adapter.mjs'].parseResponse(raw,request,obs,'live'),capture={schema:1,origin:'live',recordedAt:new Date().toISOString(),request,raw,proposal,status:transport.status()};capture.sha256=await sha256(JSON.stringify(capture));await writeFile(join(paths[1],'live-capture.json'),JSON.stringify(capture,null,2),{flag:'wx'});console.log('One request captured. A smoke is not a performance comparison. Capture saved locally; exports exclude it until explicitly reviewed.');}
