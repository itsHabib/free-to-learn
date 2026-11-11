import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { BaseEngine } from './runtime/base.mjs';
import { runChecks } from './checks.mjs';
try {
  const module = await import(pathToFileURL(resolve(process.argv[2])).href);
  if (typeof module.buildEngine !== 'function') throw Error('Export buildEngine(BaseEngine).');
  const report = runChecks(module.buildEngine(BaseEngine), Number(process.argv[3]));
  process.stdout.write(JSON.stringify(report));
} catch (error) { process.stdout.write(JSON.stringify({ runtimeError: error.message })); process.exitCode = 3; }
