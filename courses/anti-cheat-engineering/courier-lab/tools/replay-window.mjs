import { readJsonFile } from './read-json.mjs';
import { replayWindow } from '../telemetry/policy.mjs';
import { createReplayEngine } from '../telemetry/runtime.mjs';

try {
  if(process.argv.length!==3) throw new Error('Usage: npm run window:replay -- path/to/window.json');
  const result=replayWindow(await readJsonFile(process.argv[2]),createReplayEngine());
  console.log(JSON.stringify(result,null,2));
  if(!result.ok) process.exitCode=1;
} catch(error){console.error(`Replay refused: ${error.message}`);process.exitCode=2;}
