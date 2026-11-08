import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { withServer } from '../tests/harness.mjs';
import { join, input } from '../clients/http-client.mjs';

const destination=process.argv[2];
if(!destination||process.argv.length!==3) throw new Error('Usage: npm run trace:sample -- path/to/window.json');
await withServer(async(server)=>{
  const actor=await join(server.base);
  await input(server.base,actor.token,1,'E');await server.advance(4);
  await input(server.base,actor.token,2,'E');await server.advance(2);
  await input(server.base,actor.token,3,'idle',true);await server.advance(1);
  await input(server.base,actor.token,4,'W');await server.advance(4);
  await input(server.base,actor.token,5,'W');await server.advance(2);
  await input(server.base,actor.token,6,'idle',true);await server.advance(1);
  const {window}=await server.control('window');
  await mkdir(dirname(resolve(destination)),{recursive:true});
  await writeFile(destination,JSON.stringify(window,null,2)+'\n',{flag:'wx'});
  console.log(`Saved ${window.events.length} events to ${destination}; owner test time, actual HTTP input, no capability tokens.`);
});
