#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
const [source,programPath,scriptPath]=process.argv.slice(2);
if(!source||!programPath){console.error('Usage: node debug.mjs PROJECT/solution.mjs programs/PROGRAM.json [COMMANDS.json]');process.exit(2);}
try {
 const { Debugger }=await import(pathToFileURL(resolve(source)).href);
 const d=new Debugger(JSON.parse(readFileSync(programPath)));
 const command=text=>{
  const [verb,a,b,c]=text.trim().split(/\s+/);
  if(verb==='inspect')return d.inspect();
  if(verb==='step'){const count=Number(a??1);if(!Number.isInteger(count)||count<1||count>10000)throw Error('Step count must be 1–10000.');let e;for(let n=0;n<count;n++)e=d.step();return {event:e,state:d.inspect()};}
  if(verb==='run')return d.run(Number(a??1000));
  if(verb==='break'){d.addBreakpoint({pc:Number(a),...(b?{condition:{kind:'reg',name:b,equals:Number(c)}}:{})});return 'breakpoint added; step bypasses a breakpoint at the current pc';}
  if(verb==='watch'){d.watch(Number(a));return 'watchpoint added';}
  if(verb==='trace')return d.trace();
  if(verb==='checkpoint')return d.checkpoint(a??'manual');
  if(verb==='seek')return d.seek(Number(a));
  if(verb==='find')return d.reverseFind(a==='mem'?{kind:'mem',address:Number(b),equals:Number(c)}:{kind:'reg',name:b,equals:Number(c)});
  if(verb==='help')return 'inspect | step [N] | run [LIMIT] | break PC [REG VALUE] | watch ADDRESS | trace | checkpoint LABEL | seek TICK | find reg NAME VALUE | find mem ADDRESS VALUE | quit';
  throw Error('Unknown command. Enter help.');
 };
 if(scriptPath){for(const text of JSON.parse(readFileSync(scriptPath))){console.log('> '+text);console.log(JSON.stringify(command(text),null,2));}}
 else {
  const rl=createInterface({input:process.stdin,output:process.stdout});console.log(command('help'));
  for(;;){const text=await rl.question('vm> ');if(text.trim()==='quit')break;try{console.log(JSON.stringify(command(text),null,2));}catch(e){console.error(e.message);}}
  rl.close();
 }
}catch(e){console.error(e.message);process.exitCode=2;}
