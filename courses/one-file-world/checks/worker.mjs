// Runs one lesson's checks in a worker thread, so checks/run.mjs can stop an endless loop in learner code.
import { parentPort, workerData } from 'node:worker_threads';
import { runLesson } from './run.mjs';

const report = await runLesson(workerData.projectDir, workerData.id, (id) => parentPort.postMessage({ starting: id }), workerData.file);
parentPort.postMessage({ report });
