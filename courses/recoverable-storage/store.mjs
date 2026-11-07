#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { FileDisk } from './public/disk.mjs';
const [source,directory,verb,...args]=process.argv.slice(2);
if(!source||!directory||!verb){console.error('Usage: node store.mjs PROJECT/solution.mjs DATA_DIRECTORY get KEY | put KEY VALUE | delete KEY | list | batch OPS.json | compact');process.exit(2);}
try {
 if(['get','delete'].includes(verb)&&args.length!==1||verb==='put'&&args.length!==2||verb==='batch'&&args.length!==1)throw Error('Missing or extra command arguments; see the usage line in README.md.');
 const { openStore }=await import(pathToFileURL(resolve(source)).href);
 const store=openStore(new FileDisk(resolve(directory)));
 if(verb==='get')console.log(JSON.stringify(store.get(args[0])));
 else if(verb==='put'){store.put(args[0],args[1]);console.log('put acknowledged');}
 else if(verb==='delete'){store.delete(args[0]);console.log('delete acknowledged');}
 else if(verb==='list')console.log(JSON.stringify(store.entries(),null,2));
 else if(verb==='batch'){store.batch(JSON.parse(readFileSync(args[0])));console.log('batch acknowledged');}
 else if(verb==='compact'){store.compact();console.log('compaction complete');}
 else throw Error('Unknown command. Use get, put, delete, list, batch or compact.');
 store.close();
}catch(e){console.error(e.message);process.exitCode=2;}
