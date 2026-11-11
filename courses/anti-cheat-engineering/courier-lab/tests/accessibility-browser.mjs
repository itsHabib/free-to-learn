import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { withServer, raceTimeout } from './harness.mjs';
import { join as joinGame } from '../clients/http-client.mjs';

// Run with `npm run test:accessibility`. Install the pinned axe-core devDependency.
// For an isolated audit, AXE_CORE_PATH may name the same version's axe.min.js.
// A11Y_PROJECT_ROOT selects the *server source*, not the test source. Default: this project.
// A11Y_INCLUDE_LEARN=0 is only for explicitly auditing a pre-/learn candidate.
const project = resolve(process.env.A11Y_PROJECT_ROOT ?? fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(process.env.A11Y_OUTPUT ?? fileURLToPath(new URL('../../../../dist/anti-cheat-browser/accessibility/', import.meta.url)));
const includeLearn = process.env.A11Y_INCLUDE_LEARN !== '0';
const timeoutMs = Number(process.env.A11Y_TIMEOUT_MS ?? 300_000);
assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 10_000 && timeoutMs <= 600_000, 'A11Y_TIMEOUT_MS must be 10000..600000');
const require = createRequire(import.meta.url);
const axePath = process.env.AXE_CORE_PATH ?? require.resolve('axe-core/axe.min.js');
const axePackage = JSON.parse(await readFile(join(dirname(axePath), 'package.json'), 'utf8'));
assert.equal(axePackage.name, 'axe-core');
assert.equal(axePackage.version, '4.11.0', 'Use the reviewed, pinned axe-core version');
const axeSource = await readFile(axePath, 'utf8');
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const viewports = [{ width: 1280, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', ['-C', project, ...args], { encoding: 'utf8' }).trim();
async function sourceIdentity() {
  const files = ['server.mjs', ...await sourceFiles('public'), ...await sourceFiles('learning')].sort();
  return {
    commit: git('rev-parse', 'HEAD'), workingTreeStatus: git('status', '--short'),
    files: Object.fromEntries(await Promise.all(files.map(async path => [path, sha256(await readFile(join(project, path)))]))),
  };
}

async function sourceFiles(directory) {
  const entries = await readdir(join(project, directory), { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

await mkdir(output, { recursive: true });
// Preserve generated attempts with this audit, away from any learner's records.
const learningDataDirectory = join(output, 'learning-records');
process.env.LEARNING_DATA_DIR = learningDataDirectory;
const initialSource = await sourceIdentity();
const manifest = {
  startedAt: new Date().toISOString(), sourceCommit: initialSource.commit, project,
  workingTreeStatus: initialSource.workingTreeStatus, sourceFiles: initialSource.files,
  testCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dirname(fileURLToPath(import.meta.url)), encoding: 'utf8' }).trim(),
  testSourceSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  axe: { version: axePackage.version, license: axePackage.license, sourceSha256: sha256(axeSource), tags },
  viewports, includeLearn, timeoutMs, learningDataDirectory,
  limitations: [
    'Automated checks cover only rules axe-core can evaluate; incomplete findings require manual review.',
    'Viewport widths are responsive layout checks, not native browser zoom.',
    'Native 200% zoom and VoiceOver were not exercised by this script.',
    'No human learning or full WCAG conformance conclusion follows from a passing run.',
  ],
  scans: [],
};
let browser;
let timedOut = false;
const watchdog = setTimeout(() => { timedOut = true; void browser?.close(); }, timeoutMs);
const hardStop = setTimeout(() => { console.error('Accessibility smoke exceeded its cleanup deadline.'); process.exit(124); }, timeoutMs + 10_000);
hardStop.unref();

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ content: axeSource });
  const result = await raceTimeout(page.evaluate(async tags => {
    const rules = axe.getRules(tags).map(rule => rule.ruleId);
    if (!rules.includes('color-contrast')) throw new Error('WCAG scan must include color-contrast');
    const results = await axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'color-contrast': { enabled: true } } });
    return { rules, results };
  }, tags), 15_000, `axe timed out: ${name}`);
  const width = page.viewportSize().width;
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  const stem = `${width}-${name}`;
  await page.screenshot({ path: join(output, `${stem}.png`), fullPage: true, timeout: 15_000 });
  await writeFile(join(output, `${stem}.json`), JSON.stringify({ name, sourceCommit: manifest.sourceCommit, url: page.url(), layout, ...result }, null, 2) + '\n');
  const compact = rule => ({ id: rule.id, impact: rule.impact, help: rule.help, helpUrl: rule.helpUrl, nodes: rule.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) });
  const scan = {
    name, width, layout, screenshot: `${stem}.png`, raw: `${stem}.json`,
    violations: result.results.violations.map(compact), incomplete: result.results.incomplete.map(compact),
    contrast: Object.fromEntries(['violations', 'incomplete', 'passes', 'inapplicable'].map(key => [key, result.results[key].filter(rule => rule.id === 'color-contrast').map(compact)])),
  };
  manifest.scans.push(scan);
  console.log(`${stem}: ${scan.violations.length} violations, ${scan.incomplete.length} incomplete, overflow=${layout.scrollWidth > width}`);
}

async function visit(page, server, route, name) {
  const response = await page.goto(server.base + route);
  assert.equal(response.status(), 200, `Required learner route ${route}`);
  await page.locator('main').waitFor();
  if (['/evidence', '/analysis', '/completion'].includes(route)) await page.locator('.prediction-notebook').first().waitFor();
  await capture(page, name);
}

async function notebookStates(page, server) {
  await visit(page, server, '/evidence', 'evidence-initial');
  await page.click('#compare-package');
  await capture(page, 'evidence-empty-prediction');
  await page.fill('#compare-package-answer', 'I predict the approved inventory and digests match.');
  await page.click('#compare-package');
  await page.locator('#package-feedback').waitFor();
  await capture(page, 'evidence-recorded-match');
  await page.selectOption('#package-case', 'changed');
  await page.click('#compare-package-worked');
  await capture(page, 'evidence-digest-refusal');
  await page.selectOption('#trace-case', 'rolled');
  await page.click('#replay-trace-worked');
  await page.click('#step-trace');
  await capture(page, 'evidence-replay-step');
  await page.selectOption('#trace-case', 'missing');
  await page.click('#replay-trace-worked');
  await capture(page, 'evidence-missing-event-refusal');

  await visit(page, server, '/analysis', 'analysis-initial');
  await page.click('#show-evaluation');
  await capture(page, 'analysis-empty-prediction');
  await page.fill('#show-evaluation-answer', 'I will count each labelled case once and compare the flags.');
  await page.click('#show-evaluation');
  await page.locator('#evaluation-results').waitFor();
  await capture(page, 'analysis-count-feedback');
  await page.selectOption('#evaluation-setting', '6');
  await page.click('#show-evaluation-worked');
  await capture(page, 'analysis-undefined-denominator');
  await page.selectOption('#retention-setting', '1');
  await page.click('#show-retention-worked');
  await capture(page, 'analysis-retention-feedback');

  await visit(page, server, '/completion', 'completion-initial');
  await page.click('#show-timing');
  await capture(page, 'completion-empty-prediction');
  await page.selectOption('#timing-case', '6');
  await page.fill('#show-timing-answer', 'The owner clock bounds catch-up and keeps the remainder.');
  await page.click('#show-timing');
  await capture(page, 'completion-timing-feedback');
  await page.selectOption('#recovery-phase', 'codeOnly');
  await page.click('#show-recovery-worked');
  await capture(page, 'completion-recovery-refusal');
  await page.selectOption('#recovery-phase', 'recovered');
  await page.click('#show-recovery-worked');
  await capture(page, 'completion-recovery-feedback');
  await page.selectOption('#repair-step', '1');
  await page.click('#show-repair-worked');
  await capture(page, 'completion-duplicate-feedback');
}

async function learningStates(page, server) {
  const response = await page.goto(server.base + '/learn');
  assert.equal(response.status(), 200, '/learn is required unless A11Y_INCLUDE_LEARN=0 is explicitly set');
  await page.locator('#units a').first().waitFor();
  const links = await page.locator('#units a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  assert.equal(links.length, 10, 'All ten units must be available to the audit');
  for (const href of links) {
    await page.locator(`#units a[href="${href}"]`).click();
    const [unit, section] = href.slice(1).split('/');
    await page.locator(`#prediction-${unit}-${section}`).waitFor();
    await page.waitForFunction(() => document.querySelector('#global-status').textContent === '');
    await capture(page, `learn-${href.slice(1).split('/')[0]}-initial`);
  }
  await page.locator(`#units a[href="${links[0]}"]`).click();
  await page.locator('#prediction-spatial-range').waitFor();
  await page.waitForFunction(() => document.querySelector('#global-status').textContent === '');
  await page.getByRole('button', { name: 'Save prediction and reveal example', exact: true }).click();
  await page.locator('#global-status[role="alert"]').waitFor();
  await capture(page, 'learn-empty-prediction');
  await page.locator('textarea[id^="prediction-"]').fill('I will identify the authoritative state and apply the stated boundary.');
  await page.getByRole('button', { name: 'Save prediction and reveal example', exact: true }).click();
  await page.getByText('Worked answer:', { exact: false }).waitFor();
  await capture(page, 'learn-worked-feedback');
  await page.getByRole('button', { name: 'Start completion item', exact: true }).click();
  await page.locator('[data-item-id]').waitFor();
  await capture(page, 'learn-completion-item');
  await page.getByRole('button', { name: 'Commit answer and check', exact: true }).click();
  await page.locator('.feedback.error').waitFor();
  await capture(page, 'learn-format-error');
  const answer = page.locator('[id^="answer-"]').first();
  const tag = await answer.evaluate(node => node.tagName);
  if (tag === 'SELECT') await answer.selectOption({ index: 1 });
  if (tag !== 'SELECT') await answer.fill(await answer.getAttribute('class') === 'json' ? '{}' : '-999999');
  await page.getByRole('button', { name: 'Save a revision', exact: true }).click();
  await page.locator('.feedback:not(.error)').waitFor();
  await capture(page, 'learn-scored-feedback');
  await page.getByRole('button', { name: 'Request hint 1', exact: true }).click();
  await page.locator('.hint').waitFor();
  await capture(page, 'learn-hint-feedback');
  await page.locator('.history summary').first().click();
  await capture(page, 'learn-attempt-history');
  await page.getByRole('button', { name: 'Start independent practice', exact: true }).click();
  await page.locator('[data-item-id]').nth(1).waitFor();
  await capture(page, 'learn-independent-practice');
  await page.getByRole('button', { name: 'Open implementation reference', exact: true }).click();
  await page.locator('#reference[open]').waitFor();
  await capture(page, 'learn-reference-dialog');
  await page.click('#close-reference');
  await page.locator('.sections a[href$="/mastery"]').click();
  await page.getByRole('button', { name: 'Start the three-item check', exact: true }).click();
  await page.locator('[data-item-id]').nth(2).waitFor();
  await capture(page, 'learn-mastery-items');
  await page.getByText('Session and recovery', { exact: true }).click();
  await page.fill('#session-id', 'invalid-session-for-accessibility-test');
  await page.click('#restore');
  await page.locator('#global-status[role="alert"]').waitFor();
  await capture(page, 'learn-session-error');
  await page.locator('#units a[href^="#telemetry/"]').click();
  await page.locator('#prediction-telemetry-checkpoint').waitFor();
  await page.waitForFunction(() => document.querySelector('#global-status').textContent === '');
  await page.getByRole('button', { name: 'Start completion item', exact: true }).click();
  await page.locator('input[id^="answer-"]').waitFor();
  await capture(page, 'learn-numeric-item');
  await page.locator('input[id^="answer-"]').fill('-999999');
  await page.getByRole('button', { name: 'Commit answer and check', exact: true }).click();
  await page.locator('.feedback.wrong').waitFor();
  await capture(page, 'learn-numeric-feedback');
}

async function storageStates(server, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota full', 'QuotaExceededError'); }; });
  await page.goto(server.base + '/completion');
  await page.fill('#show-timing-answer', 'Preserve this answer when saving is unavailable.');
  await page.click('#show-timing');
  await capture(page, 'completion-storage-error');
  if (includeLearn) {
    await page.goto(server.base + '/learn');
    await page.locator('#global-status[role="alert"]').waitFor();
    await capture(page, 'learn-storage-error');
  }
  await context.close();
}

try {
  browser = await chromium.launch({ headless: true, timeout: 15_000 });
  manifest.browserVersion = browser.version();
  for (const viewport of viewports) {
    await withServer(async server => {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      page.setDefaultNavigationTimeout(15_000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await visit(page, server, '/course', 'course-initial');
      await visit(page, server, '/', 'game-initial');
      await page.click('#connect');
      await page.waitForFunction(() => document.querySelector('#connection').textContent === 'Connected');
      await capture(page, 'game-connected');
      await page.click('#forge');
      await page.waitForFunction(() => document.querySelector('#exchange').textContent.includes('input-keys'));
      await capture(page, 'game-forged-input-error');
      await visit(page, server, '/order', 'order-initial');
      await notebookStates(page, server);
      await visit(page, server, '/sources', 'sources-initial');
      if (includeLearn) await learningStates(page, server);
      assert.deepEqual(errors, [], 'No unhandled learner-page errors');
      await context.close();
      await storageStates(server, viewport);
      // Each viewport has a fresh four-slot game server. Fill it through real HTTP.
      for (let index = 0; index < 3; index += 1) await joinGame(server.base);
      const full = await browser.newPage({ viewport });
      await full.goto(server.base);
      await full.click('#connect');
      await full.waitForFunction(() => document.querySelector('#announcement').textContent.includes('All four lab slots'));
      await capture(full, 'game-session-capacity-error');
      await full.close();
    }, { entry: join(project, 'server.mjs') });
  }
  assert.equal(timedOut, false, 'Accessibility smoke completed inside its deadline');
} catch (error) {
  manifest.error = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await browser?.close();
  clearTimeout(watchdog);
  clearTimeout(hardStop);
  manifest.finishedAt = new Date().toISOString();
  manifest.finalSource = await sourceIdentity();
  manifest.sourceStable = manifest.finalSource.commit === manifest.sourceCommit
    && JSON.stringify(manifest.finalSource.files) === JSON.stringify(manifest.sourceFiles);
  if (!manifest.sourceStable) manifest.error ??= { message: 'Server source changed during the audit; rerun against a stable candidate.' };
  manifest.summary = {
    scans: manifest.scans.length,
    violations: manifest.scans.reduce((sum, scan) => sum + scan.violations.length, 0),
    incomplete: manifest.scans.reduce((sum, scan) => sum + scan.incomplete.length, 0),
    overflow: manifest.scans.filter(scan => scan.layout.scrollWidth > scan.width).map(scan => `${scan.width}-${scan.name}`),
  };
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ sourceCommit: manifest.sourceCommit, output, ...manifest.summary, error: manifest.error?.message }, null, 2));
}
if (manifest.error || manifest.summary.violations || manifest.summary.overflow.length) process.exitCode = 1;
