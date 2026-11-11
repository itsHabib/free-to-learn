import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {startLab} from '../runtime/lab.mjs';
const mode = process.argv[2] || 'help';
if (!['interactive','demo','recovery'].includes(mode)) {
  console.log('node tools/lab.mjs interactive|demo|recovery [path/to/protocol.mjs]\nInteractive: directory, open NAME, send NAME luna|tide, stop RELAY, start RELAY, recover NAME [EXCLUDED RELAYS], lose-reply NAME, view RELAY, close NAME, quit');
  process.exit(0);
}
const source = process.argv[3] || fileURLToPath(new URL('../learner/protocol.mjs',import.meta.url));
let lab;
const circuits = new Map();
try {
  lab = await startLab(source, event => console.log(JSON.stringify({observer:'operator',...event})));
  if (mode !== 'interactive') {
    let c = await lab.open();
    console.log(JSON.stringify({observer:'client',reply:await lab.send(c)}));
    if (mode === 'recovery') {
      const failed = c.hops[1].relayId; await lab.stop(failed);
      try {await lab.send(c);} catch (error) {console.log(JSON.stringify({observer:'client',code:error.code}));}
      c = await lab.recover(c,[failed]);
      console.log(JSON.stringify({observer:'client',replacement:c.id,reply:await lab.send(c,'tide')}));
    }
  } else {
    const rl = createInterface({input:process.stdin,output:process.stdout});
    console.log('directory | open NAME | send NAME [luna|tide] | stop/start RELAY | recover NAME [excluded IDs] | lose-reply NAME | view RELAY | close NAME | quit');
    try {
      for await (const line of rl) {
        const [action,name,...args] = line.trim().split(/\s+/);
        try {
          if (action === 'quit') break;
          if (action === 'directory') {console.log(lab.directory());continue;}
          if (action === 'open') {
            if (!name || circuits.has(name)) throw new Error('Choose a new circuit name.');
            const c = await lab.open(); circuits.set(name,c); console.log({name,circuitId:c.id,path:c.hops.map(h => h.relayId)}); continue;
          }
          if (action === 'stop' || action === 'start') {await lab[action](name);continue;}
          if (action === 'view') {console.log(await lab.snapshot(name));continue;}
          const c = circuits.get(name); if (!c) throw new Error('Unknown circuit name.');
          if (action === 'send') {console.log({observer:'client',reply:await lab.send(c,args[0] || 'luna')});continue;}
          if (action === 'recover') {const next = await lab.recover(c,args); circuits.set(name,next);console.log({name,circuitId:next.id,path:next.hops.map(h => h.relayId)});continue;}
          if (action === 'lose-reply') {await lab.dropNextReply(c.hops.at(-1).relayId);continue;}
          if (action === 'close') {await lab.close(c);continue;}
          throw new Error('Unknown command.');
        } catch (error) {console.log({observer:'client',code:error.code || 'COMMAND_ERROR',message:error.message});}
      }
    } finally {rl.close();}
  }
} catch (error) {console.error(error.code || error.message);process.exitCode=1;}
finally {await lab?.shutdown();}
