// A four-instruction export from the actual game, before game_init has run.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readProgram } from '../public/program.mjs';
import { makeWorld } from '../public/world.mjs';

const checkpoint = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'machine-checkpoint.mjs',
);
const path = process.argv[2] ? resolve(process.argv[2]) : checkpoint;
const { Machine } = await import(pathToFileURL(path).href);
const machine = new Machine(readProgram('lob'), makeWorld(42).imports);
machine.begin('r_px');
console.log(`begin: tick=${machine.state.tick}, running=${machine.running}`);
while (machine.running) {
  const event = machine.step();
  console.log(
    `${event.tick} ${event.op} stack=${JSON.stringify(machine.state.stack)}`,
  );
}
console.log(
  `returned=${machine.state.result}; this is cold memory, before game_init`,
);
