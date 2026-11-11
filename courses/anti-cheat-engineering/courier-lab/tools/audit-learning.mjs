// Structural curriculum receipt. Semantic teaching quality still needs a reviewer.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadUnits } from '../learning/runtime.mjs';
import { grade, validateItem } from '../learning/grade.mjs';

const modules = await loadUnits();
const project = fileURLToPath(new URL('../', import.meta.url));
const errors = [];
const known = new Set();
const allObjectives = new Set();
const priorUnits = new Set();
const units = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
for (const { unit } of modules) {
  for (const objective of unit.objectives) {
    check(!allObjectives.has(objective.id), `Duplicate objective ${objective.id}`);
    allObjectives.add(objective.id);
  }
}
for (const { unit, makeItem } of modules) {
  for (const prerequisite of unit.prerequisites ?? []) check(priorUnits.has(prerequisite), `${unit.id}: unit prerequisite ${prerequisite} is missing or later`);
  priorUnits.add(unit.id);
  const sourceFile = resolve(project, 'learning/units', `${unit.id}.mjs`);
  const source = await readFile(sourceFile, 'utf8');
  const localIds = new Set(unit.objectives.map(({ id }) => id));
  const objectiveRows = unit.objectives.map((objective) => {
    check(['fact', 'concept', 'procedure', 'principle'].includes(objective.kind), `${objective.id}: missing kind`);
    for (const prerequisite of objective.prerequisites ?? []) {
      check(known.has(prerequisite), `${objective.id}: prerequisite ${prerequisite} is missing or later`);
    }
    known.add(objective.id);
    return { ...objective, sections: [], practiceKeys: [], completionKeys: [], masteryKeys: [] };
  });
  check(unit.sections.length >= 2 && unit.sections.length <= 4, `${unit.id}: expected 2–4 focused sections`);
  check(unit.masterySlots.length === 3, `${unit.id}: expected three mastery slots`);
  const sectionRows = unit.sections.map((section) => {
    check(section.paragraphs?.length > 0 && section.worked?.steps?.length > 0 && section.completion?.steps?.length > 0, `${unit.id}/${section.id}: missing teaching ladder`);
    for (const id of section.objectiveIds) {
      check(localIds.has(id), `${unit.id}/${section.id}: unknown objective ${id}`);
      objectiveRows.find((row) => row.id === id)?.sections.push(section.id);
    }
    const words = section.paragraphs.join(' ').trim().split(/\s+/).length;
    return { id: section.id, title: section.title, objectiveIds: section.objectiveIds, teachingWords: words, source: section.source };
  });
  const items = [];
  for (const mode of ['completion', 'practice', 'mastery']) {
    for (const key of mode === 'mastery' ? unit.masterySlots : unit.sections.map(({ id }) => id)) {
      const signatures = new Set();
      const answers = new Set();
      const objectives = new Set();
      for (let seed = 1; seed <= 128; seed += 1) {
        const item = makeItem({ mode, key, seed });
        validateItem(item);
        const answer = item.format.type === 'json' ? JSON.stringify(item.expected) : String(item.expected);
        const result = grade(item, answer);
        check(result.status === 'scored' && result.correct, `${unit.id}/${mode}/${key}/${seed}: authored key rejected`);
        check(item.explanation?.trim().length > 20, `${item.id}: insufficient explanation`);
        check(mode === 'mastery' ? item.hints.length === 0 : item.hints.length === 3, `${item.id}: wrong hint policy`);
        for (const id of item.objectiveIds) { check(localIds.has(id), `${item.id}: unknown objective ${id}`); objectives.add(id); }
        signatures.add(JSON.stringify([item.prompt, item.inputs]));
        answers.add(JSON.stringify(item.expected));
      }
      check(signatures.size > 1 && answers.size > 1, `${unit.id}/${mode}/${key}: seeds do not change cases and answers`);
      for (const id of objectives) objectiveRows.find((row) => row.id === id)?.[`${mode}Keys`].push(key);
      items.push({ mode, key, objectiveIds: [...objectives], seedsChecked: 128, distinctCases: signatures.size, distinctAnswers: answers.size });
    }
  }
  for (const objective of objectiveRows) {
    for (const role of ['sections', 'completionKeys', 'practiceKeys', 'masteryKeys']) check(objective[role].length > 0, `${objective.id}: no ${role}`);
  }
  units.push({ id: unit.id, title: unit.title, prerequisites: unit.prerequisites, sourceFile: `learning/units/${unit.id}.mjs`, sourceSha256: createHash('sha256').update(source).digest('hex'), objectives: objectiveRows, sections: sectionRows, items });
}
const report = {
  schema: 'ivy-learning-structure/v1',
  checkedAt: new Date().toISOString(),
  scope: 'Declared objective sequence, teaching/item links, generated keys and case variation. Not a semantic transfer, difficulty, accessibility or learning-effect verdict.',
  units, errors,
};
const output = JSON.stringify(report, null, 2) + '\n';
if (process.argv[2]) await writeFile(resolve(process.argv[2]), output);
else process.stdout.write(output);
if (errors.length) { process.stderr.write(errors.slice(0, 20).join('\n') + `\n${errors.length} failures; see the complete JSON report.\n`); process.exitCode = 1; }
