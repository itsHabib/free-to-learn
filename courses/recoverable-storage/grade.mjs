import { pathToFileURL } from 'node:url';
import { suite, stages } from './public/checks.mjs';
const [source, stage] = process.argv.slice(2);
if (!stages.includes(stage)) throw Error('Unknown stage.');
const api = await import(pathToFileURL(source).href);
const results = suite(api, stage);
console.log('IVY_RESULT:' + JSON.stringify({ stage, results }));
