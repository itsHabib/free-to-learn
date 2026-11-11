// Learner-facing summaries of check results and progress. Pure functions shared by the browser and terminal.
import {escape} from './render.mjs';

const UNITS = Array.from({length: 10}, (_, i) => String(i + 1).padStart(2, '0'));
const list = ids => ids.join(', ');

// attempts: saved session attempts; currentHash: identity of the current work files; build: current course build.
export function progressSummary(attempts, currentHash, build) {
  const passes = attempts.filter(a => a.result?.passed === true && UNITS.includes(a.result?.unit));
  const ever = UNITS.filter(u => passes.some(a => a.result.unit === u));
  const current = ever.filter(u => passes.some(a => a.result.unit === u && a.sourceHash === currentHash && a.build === build));
  const recheck = ever.filter(u => !current.includes(u));
  if (!ever.length) return {ever, current, recheck, text: 'No unit check has passed yet. Each passing check is saved with the files it ran on.'};
  const parts = ['Units passed at least once: ' + ever.length + ' of 10 (' + list(ever) + ').'];
  if (!recheck.length) parts.push('All of them pass with your current files.');
  else {
    parts.push(current.length ? 'Passing with your current files: ' + list(current) + '.' : 'None has been checked since your latest edit.');
    parts.push('Recheck after your latest edit: ' + list(recheck) + '. Earlier passes stay in your history.');
  }
  return {ever, current, recheck, text: parts.join(' ')};
}

function caseLines(r) {
  const verdict = r.pass ? 'Pass' : 'Fail';
  const why = r.pass ? '' : '<p class="case-message">' + escape(r.message || ('Observed ' + JSON.stringify(r.actual) + ', expected ' + JSON.stringify(r.expected) + '.')) + '</p>';
  // Current messages end with their own "Reread ..." pointer; older saved results only carry repair.
  const where = r.pass || /Reread /.test(r.message || '') ? '' : '<p class="case-reread">Reread: ' + escape(r.section || r.repair || '') + '</p>';
  return '<li class="case ' + (r.pass ? 'pass' : 'fail') + '"><p class="case-head"><span class="case-verdict">' + verdict + '</span> ' + escape(r.label) + '</p>' + why + where + '</li>';
}

// Returns HTML for a check result: a heading with the count and one item per case.
export function resultHtml(result, error) {
  if (error) return '<p class="result-summary fail">The check could not run: ' + escape(error) + '</p>';
  if (!result || !Array.isArray(result.results)) return '';
  const passed = result.results.filter(r => r.pass).length, total = result.results.length;
  const head = '<p class="result-summary ' + (result.passed ? 'pass' : 'fail') + '">Unit ' + escape(result.unit) + ', variant ' + escape(result.variant) + ': ' + passed + ' of ' + total + ' cases passed.</p>';
  return head + '<ol class="cases">' + result.results.map(caseLines).join('') + '</ol>';
}

// Plain-text lines for the terminal, printed after the JSON record.
export function resultText(result) {
  if (!result || !Array.isArray(result.results)) return '';
  const passed = result.results.filter(r => r.pass).length;
  const lines = ['Unit ' + result.unit + ', variant ' + result.variant + ': ' + passed + ' of ' + result.results.length + ' cases passed.'];
  for (const r of result.results) {
    lines.push((r.pass ? 'PASS ' : 'FAIL ') + r.label);
    if (!r.pass) lines.push('     ' + (r.message || ('observed ' + JSON.stringify(r.actual) + ', expected ' + JSON.stringify(r.expected))));
  }
  return lines.join('\n');
}
