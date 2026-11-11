import {runChecks} from '../checks/requirements.mjs';
import {fileURLToPath} from 'node:url';
const source = process.argv[3] || fileURLToPath(new URL('../learner/protocol.mjs',import.meta.url));
const result = await runChecks(source,process.argv[2] || 'all');
for (const row of result.results) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name}${row.pass ? '' : ` — ${row.code || ''} ${row.message}`}`);
console.log(`${result.results.filter(r => r.pass).length}/${result.results.length} requirements passed. Checks are finite behavior evidence, not an anonymity or learning certificate.`);
process.exitCode = result.results.every(r => r.pass) ? 0 : 1;
