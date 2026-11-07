// Optional Node transport. Importing this module neither reads credentials nor calls a provider.
const ENDPOINT='https://api.liquid.ai/decisions/v1/systemone';
export function createHttpTransport(config,{fetchFn=fetch,getKey=()=>process.env.LIQUID_API_KEY}={}) {
 if(config?.endpoint!==ENDPOINT||!config.model||!Number.isInteger(config.maxRequests)||config.maxRequests<1||config.maxRequests>20||!Number.isInteger(config.maxInputBytes)||config.maxInputBytes<1||config.maxInputBytes>32000||!Number.isInteger(config.timeoutMs)||config.timeoutMs<1||config.timeoutMs>30000)throw Error('invalid-config');
 if(config.strictCost!==undefined)throw Error('strict cost cannot be bounded: no verified token/rate upper bound');
 let used=0;
 return {status:()=>({used,maxRequests:config.maxRequests,armed:config.arm===true,qualification:'mock-tested; no live qualification'}),async send(request){
  if(config.arm!==true)throw Error('disabled: explicitly arm each terminal session');
  if(used>=config.maxRequests)throw Error('budget-exhausted');
  if(request.binding?.host!=='api.liquid.ai'||request.body?.model!==config.model)throw Error('invalid-binding');
  const body=JSON.stringify(request.body);if(Buffer.byteLength(body)>config.maxInputBytes)throw Error('input-too-large');
  const key=getKey();if(!key)throw Error('missing-credential');used++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.timeoutMs);
  try{const response=await fetchFn(ENDPOINT,{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body});if(!response.ok)throw Error('provider-http-error');const reader=response.body.getReader();let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error('response-too-large');}parts.push(value);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch(e){throw Error(e.name==='AbortError'?'timeout':'provider-request-failed');}finally{clearTimeout(timer);}
 }};
}
