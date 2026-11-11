import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createLearningHandler, createLearningService, saveAtomic } from '../learning/service.mjs';
import { modules } from './learning-fixtures.mjs';

const directory = await mkdtemp(join(tmpdir(), 'ivy-learning-browser-'));
const output = fileURLToPath(new URL('../../../../dist/anti-cheat-browser/learning/', import.meta.url));
await mkdir(output, { recursive: true });
let seed = 200;
let failWrites = false;
const learning = createLearningHandler(createLearningService({ modules, directory, nextSeed: () => ++seed, persist: async (...args) => { if (failWrites) throw new Error('Injected full disk'); await saveAtomic(...args); } }));
const assets = { '/learn': ['learn.html', 'text/html'], '/learn.js': ['learn.js', 'text/javascript'], '/learn.css': ['learn.css', 'text/css'] };
const server = http.createServer(async (request, response) => {
  if (request.url.startsWith('/learning/')) return learning(request, response);
  const asset = assets[request.url];
  if (!asset) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': asset[1] }); response.end(await readFile(new URL(`../public/${asset[0]}`, import.meta.url)));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const results = [];

async function click(page, name) { await page.getByRole('button', { name, exact: true }).click(); await page.waitForFunction(() => !document.querySelector('#global-status').textContent.includes('Saving')); }
async function answerMastery(page, incorrect = -1) {
  const items = await page.locator('[data-item-id]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.itemId, inputs: JSON.parse(node.querySelector('pre').textContent) })));
  for (const [index, item] of items.entries()) {
    const panel = page.locator(`[data-item-id="${item.id}"]`);
    await panel.locator('input').fill(String(index === incorrect ? 0 : item.inputs.available - item.inputs.spent));
    await panel.getByRole('button', { name: 'Commit answer and check', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#global-status').textContent.includes('Saving'));
  }
}

try {
  for (const [name, width, height] of [['desktop', 1280, 1000], ['mobile', 390, 844], ['narrow', 320, 740]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/learn`); await page.getByRole('button', { name: 'Start completion item', exact: true }).waitFor();
    assert.equal(await page.locator('#units a').count(), 10);
    assert.equal(await page.getByText('Worked answer: Accepted', { exact: true }).count(), 0);
    await click(page, 'Save prediction and reveal example'); assert.match(await page.locator('#global-status').textContent(), /prediction/);
    await page.locator('#prediction-spatial-boundary').fill('I expect accepted.');
    await click(page, 'Save prediction and reveal example'); assert.equal(await page.getByText('Worked answer: Accepted', { exact: true }).count(), 1);
    await click(page, 'Start completion item');
    assert.equal(await page.getByText('Finish a boundary comparison.', { exact: true }).count(), 0);
    const firstId = await page.locator('[data-item-id]').getAttribute('data-item-id');
    const first = page.locator(`[data-item-id="${firstId}"]`);
    await first.locator('input').fill('not a number'); await click(page, 'Commit answer and check');
    assert.match(await first.textContent(), /Saved format error/); assert.doesNotMatch(await first.textContent(), /Expected:/);
    await first.locator('input').fill('0'); failWrites = true;
    await click(page, 'Save a revision'); assert.match(await page.locator('#global-status').textContent(), /could not be saved/); assert.equal(await first.locator('input').inputValue(), '0');
    failWrites = false; await click(page, 'Save a revision'); assert.match(await first.textContent(), /This decision needs repair/);
    await click(page, 'Start independent practice'); assert.equal(await page.locator('[data-item-id]').count(), 2);
    await page.screenshot({ path: join(output, `${name}-guided.png`), fullPage: true });
    await page.reload(); await page.getByText('This decision needs repair', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-item-id]').count(), 2);
    await click(page, 'Open implementation reference');
    await page.locator('#reference-content').focus(); await page.keyboard.press('PageDown');
    await page.waitForFunction(() => document.querySelector('#reference-content').scrollTop > 0);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#reference').evaluate((node) => node.open), false);
    await page.waitForFunction(() => document.activeElement === document.querySelector('.ref-link'));
    await page.getByRole('link', { name: 'Mastery check', exact: true }).click();
    await click(page, 'Start the three-item check'); await answerMastery(page, 1);
    assert.match(await page.locator('.status-box').textContent(), /Current status: needs practice/);
    await click(page, 'Start a fresh three-item set'); await answerMastery(page);
    assert.match(await page.locator('.status-box').textContent(), /Current status: mastered/);
    assert.equal(await page.getByRole('button', { name: /^Request hint/ }).count(), 0);
    await page.screenshot({ path: join(output, `${name}-mastery.png`), fullPage: true });
    const exported = await page.evaluate(async () => { const sessionId = document.querySelector('#session-id').value; return (await fetch('/learning/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })).json(); });
    assert.equal(exported.masterySets.length, 2); assert.equal(exported.exposures[0].prediction, 'I expect accepted.');
    assert.equal(exported.items[0].attempts.length, 2); assert.equal(exported.items[0].attempts[0].status, 'format-error');
    await page.getByRole('link', { name: /10.*Test capstone/ }).focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash.includes('capstone'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    results.push({ name, width, units: 10, savedFailureWithheld: true, reloadPreservesHistory: true, masteryFirstResponseOnly: true, retake: true, keyboard: true, overflow: false, errors });
    await page.close();
  }
} finally {
  await browser.close(); await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true });
}
await writeFile(join(output, 'browser-result.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
