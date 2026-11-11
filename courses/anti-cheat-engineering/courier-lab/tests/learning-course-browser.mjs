// Source-aware integration check: validates delivery/grading, not human learning.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadUnits } from '../learning/runtime.mjs';
import { withServer } from './harness.mjs';

const modules = await loadUnits();
const directory = await mkdtemp(join(tmpdir(), 'ivy-learning-course-'));
const output = fileURLToPath(new URL('../../../../dist/anti-cheat-browser/learning-course/', import.meta.url));
await mkdir(output, { recursive: true });
const previous = process.env.LEARNING_DATA_DIR;
process.env.LEARNING_DATA_DIR = directory;
const browser = await chromium.launch({ headless: true });
const results = [];

async function action(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#global-status').textContent.includes('Saving'));
  assert.equal(await page.locator('#global-status').textContent(), '');
}
async function state(page) {
  return page.evaluate(async () => (await fetch('/learning/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: document.querySelector('#session-id').value }) })).json());
}
async function answer(page, module, item) {
  const generated = module.makeItem({ mode: item.mode, key: item.key, seed: item.seed });
  const panel = page.locator(`[data-item-id="${item.id}"]`);
  if (item.format.type === 'choice') await panel.locator('select').first().selectOption(String(generated.expected));
  if (item.format.type !== 'choice') await panel.locator('input,textarea').fill(item.format.type === 'json' ? JSON.stringify(generated.expected) : String(generated.expected));
  await panel.getByRole('button', { name: 'Commit answer and check', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#global-status').textContent.includes('Saving'));
  assert.equal(await page.locator('#global-status').textContent(), '');
  assert.match(await panel.locator('.feedback').textContent(), /Correct for this case/);
}

try {
  await withServer(async (server) => {
    for (const [name, width, height] of [['desktop', 1280, 1000], ['mobile', 390, 844], ['narrow', 320, 740]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(server.base + '/learn'); await page.locator('#units a').first().waitFor();
      assert.equal(await page.locator('#units a').count(), 10);
      let sectionCount = 0;
      for (const module of modules) {
        const { unit } = module;
        for (const section of unit.sections) {
          await page.evaluate((hash) => { location.hash = hash; }, `${unit.id}/${section.id}`);
          await page.getByRole('heading', { name: section.title, exact: true }).waitFor();
          await page.waitForFunction(() => !document.querySelector('#global-status').textContent.includes('Saving'));
          assert.equal(await page.locator('.teaching p').count(), section.paragraphs.length);
          await page.locator(`#prediction-${unit.id}-${section.id}`).fill('My first prediction before the worked example.');
          await action(page, 'Save prediction and reveal example');
          await action(page, 'Start completion item');
          let current = await state(page);
          await answer(page, module, current.items.at(-1));
          await action(page, 'Start independent practice');
          current = await state(page);
          await answer(page, module, current.items.at(-1));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} ${unit.id}/${section.id} overflow`);
          sectionCount += 1;
        }
        await page.screenshot({ path: join(output, `${name}-${unit.id}.png`), fullPage: true });
        await page.getByRole('link', { name: 'Mastery check', exact: true }).click();
        await action(page, 'Start the three-item check');
        const current = await state(page);
        for (const id of current.masterySets.at(-1).itemIds) await answer(page, module, current.items.find((item) => item.id === id));
        assert.match(await page.locator('.status-box').textContent(), /Current status: mastered/, `${name} ${unit.id} objective coverage`);
      }
      const saved = await state(page);
      assert.equal(saved.units.filter((unit) => unit.status === 'mastered').length, 10);
      assert.equal(saved.exposures.length, sectionCount);
      assert.equal(saved.items.length, sectionCount * 2 + 30);
      assert.deepEqual(errors, []);
      results.push({ name, width, units: 10, sections: sectionCount, committedItems: saved.items.length, mastered: 10, overflow: false, errors, sourceAware: true });
      await page.close();
    }
  });
} finally {
  await browser.close(); await rm(directory, { recursive: true, force: true });
  if (previous === undefined) delete process.env.LEARNING_DATA_DIR;
  if (previous !== undefined) process.env.LEARNING_DATA_DIR = previous;
}
await writeFile(join(output, 'browser-result.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
