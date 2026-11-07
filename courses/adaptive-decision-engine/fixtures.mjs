import {hash} from './shared.mjs';
export function fixtureResponse(request,kind='valid') {
 const obs=JSON.parse(request.body.state),allowed=request.binding.allowed;
 const pick=allowed.includes('scout')?'scout':'rest',index=parseInt(hash([obs.episodeId,obs.revision,'synthetic-score']),16)%3,score=[.35,.68,.92][index];
 const probabilities=Object.fromEntries(allowed.map(k=>[k,k===pick?(allowed.length===1?1:.7):(allowed.length===1?0:.3/(allowed.length-1))]));
 const response={model:request.binding.model,answers:{encounter:{type:'choice',choice:pick,probabilities,confidence:score}},usage:{input_tokens:null,output_tokens:null}};
 if(kind==='wrong-question')response.answers={recovery:response.answers.encounter};if(kind==='wrong-model')response.model='unrequested-model';if(kind==='invalid-sum')response.answers.encounter.probabilities[pick]=1.2;
 return response;
}
export const fixtureTransport=async request=>fixtureResponse(request);
