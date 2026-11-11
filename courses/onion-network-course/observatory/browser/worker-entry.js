// Appended to the bundled adapters. One committed project per disposable worker.
const deliver=self.postMessage.bind(self);
const blockNetwork=()=>{throw new BrowserCrypto.LabError('NETWORK_DISABLED','Only the supplied simulated relays are available.');};
for(const name of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts']) {
  Object.defineProperty(self,name,{value:blockNetwork,writable:false,configurable:false});
}
let started=false;
self.addEventListener('message',async event=>{
  if(started)return;started=true;
  const {id,request}=event.data??{};
  try{
    const result=await BrowserRunner.runProject(request);
    BrowserCrypto.requireThat(JSON.stringify(result).length<=1000000,'RESULT_TOO_LARGE','The result exceeded the local one-million-character limit.');
    deliver({id,type:'result',result});
  }
  catch(error){deliver({id,type:'result',result:{executionFailure:true,code:error.code??error.name,detail:error.message}});}
});
