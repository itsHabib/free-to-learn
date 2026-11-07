// Reproduce the original synthetic corpus using your current adapter and observer.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {loadModules} from './loader.mjs';
import {initial,resolve,botMove,legal} from './game.mjs';
import {fixtureResponse} from './fixtures.mjs';
import {distance} from './shared.mjs';
import {identity} from './bundle.mjs';
const [work,output]=process.argv.slice(2);
if(!work||!output)throw Error('Usage: node generate-data.mjs WORKDIR NEW-OUTPUT-DIR');
const sources={};for(const n of ['observe.mjs','constraints.mjs','adapter.mjs'])sources[n]=await readFile(join(work,n),'utf8');
const m=await loadModules(sources),corpus={origin:'synthetic-fixture',sourceHash:await identity(sources),generation:'The scripted transport ignores instruction semantics. It chooses scout when legal, else rest; a keyed hash selects score 0.35, 0.68 or 0.92 before the transition.',episodes:[]};
await mkdir(output);
for(const split of ['dev','calibration','evaluation']){const manifest=JSON.parse(await readFile(new URL('./evaluation/'+split+'.json',import.meta.url),'utf8')),rows=[];for(const spec of manifest.episodes){let state=initial(spec.seed,spec.profile,spec.id);const events=[];while(!state.terminal){const obs=m['observe.mjs'].observe(state),request=m['adapter.mjs'].buildRequest(obs,legal(state)),raw=fixtureResponse(request),proposal=m['adapter.mjs'].parseResponse(raw,request,obs);if(!proposal.ok)throw Error('Your adapter rejected the generated response: '+proposal.error);const next=resolve(state,proposal.action,botMove(spec.bot,state,proposal.action.kind)),label=Number(next.state.health>0&&distance(next.event.pressure,next.event.target)===0);rows.push({episodeId:spec.id,split,domain:spec.bot+'/'+spec.profile,revision:state.revision,score:proposal.score,label});events.push({observation:obs,request,raw,event:next.event,label});state=next.state;}corpus.episodes.push({...spec,split,events});}await writeFile(join(output,split+'-data.json'),JSON.stringify(rows,null,2),{flag:'wx'});}
await writeFile(join(output,'corpus.json'),JSON.stringify(corpus),{flag:'wx'});console.log('Wrote 180 synthetic episodes to '+output+'. No provider was called.');
