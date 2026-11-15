// Turns check results into plain sentences for the terminal.

export const FINISH = `You built Sightline: one engine that reads a game's memory and screen, finds
where the game keeps its values, takes its compiled code apart, lifts it into
expressions and works out from them the physics, a reader for state that moves
and is scrambled, and the flag's motion. Nothing it found went into the kit until
a test against the game had confirmed it. Where more than one repair was worth
trying, a decision model could pick, on a budget of rounds and shots, and you
measured what its picks were worth against option 0, random picks and a rule of
your own. The same passes, tests and loop climbed Lob II, a game made
separately.

What you can do next: run "node lab.mjs measure ./work --pickers rule,first,live"
with a decision model on Ollama and compare its picks with your rule; change a
level's seed with --seed and see what still holds; or open one of the games in
Ghidra or another disassembler and use it to check your own passes.

This course works on the games it ships. It does not teach getting past anyone
else's protections.

The course's code work is complete.`;

function caseLines(r) {
  const lines = [`FAIL ${r.id}: ${r.title}`];
  if (r.kind === 'not-written') {
    const m = r.message.match(/not written yet:\s*(.*)$/);
    lines.push(`  Your ${m ? m[1] : 'function'} is not written yet: the starter's version is still in place.`);
    lines.push('  Next: write it, then run this check again.');
  } else if (r.kind === 'timeout') {
    lines.push(`  What was checked: ${r.requirement}`);
    lines.push(`  Observed: your code did not finish within ${r.limitMs / 1000} seconds, so the check stopped it.`);
    lines.push('  Expected: an answer well inside that limit (the course\'s own solution takes a small fraction of it).');
    lines.push('  Next: look for a loop that never ends, such as waiting for a shot that never lands or a search with no step limit.');
  } else if (r.kind === 'error') {
    lines.push(`  What was checked: ${r.requirement}`);
    lines.push(`  Observed: your code threw ${r.message}${r.where ? ` (in ${r.where})` : ''}.`);
    lines.push('  Expected: a result without an error.');
  } else {
    const f = r.fields;
    lines.push(`  What was checked: ${f.checked ?? r.requirement}`);
    if (f.input) lines.push(`  Input: ${f.input}`);
    lines.push(`  Observed: ${f.observed}`);
    if (f.expected) lines.push(`  Expected: ${f.expected}`);
    if (f.diff) lines.push(`  First difference: ${f.diff}`);
  }
  if (r.kind !== 'not-written' && r.reread) lines.push(`  Where it is taught: ${r.reread}`);
  return lines;
}

export function formatModule(report, { attemptPath, partial = false } = {}) {
  const rows = report.results;
  const passed = rows.filter(r => r.pass);
  const failed = rows.filter(r => !r.pass);
  const lines = [];
  const variant = report.variant ? ` (variant ${report.variant}: fresh random instances)` : '';
  if (failed.length === 0) {
    lines.push(partial ? `Module ${report.module}, ${report.title}: the ${rows.length} named check${rows.length > 1 ? 's' : ''} passed (${rows.map((r) => r.id).join(', ')}). The module's other checks were not run.` : `Module ${report.module}, ${report.title}${variant}: all ${rows.length} checks passed.`);
  } else {
    lines.push(`Module ${report.module}, ${report.title}${variant}: ${passed.length} of ${rows.length} checks passed, ${failed.length} failed.`);
    for (const r of failed) lines.push('', ...caseLines(r));
    if (passed.length) lines.push('', `Passed: ${passed.map(r => r.id).join(', ')}`);
  }
  if (attemptPath) lines.push(`This attempt is saved in ${attemptPath}. Add --json for the machine-readable record.`);
  return lines.join('\n');
}

export function formatAll(reports, opts = {}) {
  const parts = reports.map(r => formatModule(r));
  const passing = reports.filter(r => r.pass).length;
  const summary = passing === reports.length
    ? `All ${reports.length} modules pass.\n\n${FINISH}`
    : `${passing} of ${reports.length} modules pass. Failing: ${reports.filter(r => !r.pass).map(r => r.module).join(', ')}.`;
  if (opts.attemptPath) parts.push(`This attempt is saved in ${opts.attemptPath}. Add --json for the machine-readable record.`);
  return parts.join('\n\n') + '\n\n' + summary;
}
