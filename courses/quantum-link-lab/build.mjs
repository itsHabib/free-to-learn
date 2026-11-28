import {readFileSync, writeFileSync} from 'node:fs';
import {markdown} from './reader/markdown.mjs';

const course = new URL('./', import.meta.url);
const anchors = ['score', 'correlate', 'report', 'teleport', 'night-shift'];
const chapters = anchors.map((anchor, index) => {
  const filename = 'lessons/0' + (index + 1) + '.md';
  const prose = readFileSync(new URL(filename, course), 'utf8');
  // Keep links to neighbouring course files portable in the offline reader.
  const rendered = markdown(prose, 'https://course.invalid/lessons/')
    .replaceAll('href="https://course.invalid/', 'href="../')
    .replaceAll('src="https://course.invalid/', 'src="../');
  return '<section id="' + anchor + '">' + rendered + '</section>';
});
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test a quantum link · Free to Learn</title>
<link rel="stylesheet" href="lab.css"><link rel="stylesheet" href="code-example.css">
<header><span>Quantum link lab</span><a href="../index.html">Back to the lab</a></header>
<main class="lesson"><h1>Test a quantum link</h1>
<p>Use Python to check the pair source, then find out whether its receiver delivers the right state. Run each command from <code>courses/quantum-link-lab</code> in your Free to Learn clone. Open worked examples when you want a hint.</p>
<nav aria-label="Build-along"><a href="#score">Build the pair reporter</a> · <a href="#teleport">Repair the receiver</a> · <a href="#night-shift">Take the night shift</a></nav>
${chapters.join('\n')}
</main></html>\n`;
writeFileSync(new URL('reader/lesson.html', course), html);
