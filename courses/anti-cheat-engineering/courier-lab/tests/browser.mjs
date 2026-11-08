import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withServer } from './harness.mjs';
import { join } from '../clients/http-client.mjs';

// Browser evidence uses the same real server and owner-clock boundary as the HTTP suite.
const output = fileURLToPath(new URL('../../../../dist/anti-cheat-browser/game/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [name, width, height] of [['desktop', 1280, 1050], ['mobile', 390, 844], ['narrow', 320, 740]]) {
    await withServer(async (server) => {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = [];
      let joins = 0;
      page.on('request', request => { if (request.url().endsWith('/join')) joins += 1; });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(server.base);
      await page.getByRole('button', { name: 'Connect to server', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('connection').textContent === 'Connected');
      async function input(action) {
        const reply = page.waitForResponse((response) => response.url().endsWith('/input') && response.request().method() === 'POST');
        await action();
        return (await reply).json();
      }
      async function tick(count) {
        const reply = await server.advance(count);
        await page.waitForFunction((target) => Number(document.getElementById('tick').textContent) >= target, reply.tick);
      }
      async function move(key, ticks) {
        await input(() => page.keyboard.down(key));
        await tick(ticks);
        await input(() => page.keyboard.up(key));
      }
      await move('ArrowRight', 4);
      await move('ArrowRight', 2);
      await input(() => page.locator('#interact').click());
      await tick(1);
      assert.equal(await page.locator('#cargo').textContent(), 'Core aboard');
      await move('ArrowLeft', 4);
      await move('ArrowLeft', 2);
      await input(() => page.locator('#interact').click());
      await tick(1);
      assert.equal(await page.locator('#score').textContent(), '1');
      assert.equal(await page.locator('#cargo').textContent(), 'Empty');
      await page.reload();
      await page.waitForFunction(() => document.getElementById('connection').textContent === 'Connected');
      assert.equal(await page.locator('#score').textContent(), '1', 'same-tab reload resumes score');
      assert.equal(joins, 1, 'reload must not consume another session');
      const forged = await input(() => page.locator('#forge').click());
      assert.equal(forged.error, 'input-keys');
      await tick(1);
      assert.equal(await page.locator('#score').textContent(), '1');
      // Native keyboard activation of the visible direction button also moves.
      await page.locator('[data-move="N"]').focus();
      await input(() => page.keyboard.down('Enter'));
      await tick(1);
      await input(() => page.keyboard.up('Enter'));
      assert.match(await page.locator('#actor').getAttribute('transform'), /1000 750/);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll('[data-move]')].map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })) }));
      assert.equal(layout.scroll, layout.width, 'no horizontal overflow');
      assert.ok(layout.controls.every((rect) => rect.width >= 44 && rect.height >= 44), '44px movement controls');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
      results.push({ name, ...layout, errors, honestDelivery: true, forgedScoreRejected: true, nativeButtonKeyboard: true, reloadResumes: true });
      await page.goto(server.base + '/order');
      await page.getByRole('heading', { name: 'Old input. New consequences.' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.screenshot({ path: `${output}/${name}-lesson.png`, fullPage: true });
      await page.goto(server.base + '/evidence');
      await page.getByRole('heading', { name: 'Which bytes? Which history?' }).waitFor();
      await page.locator('#compare-package-worked').waitFor();
      assert.equal(await page.locator('#package-feedback').isVisible(), false);
      await page.locator('#compare-package-worked').click();
      await page.getByText('RECORDED MATCH', { exact: false }).waitFor();
      await page.locator('#package-case').selectOption('changed');
      await page.locator('#compare-package-worked').click();
      assert.match(await page.locator('#package-verdict').textContent(), /REFUSAL.*digest/);
      await page.locator('#trace-case').selectOption('missing');
      await page.locator('#replay-trace-worked').click();
      assert.match(await page.locator('#trace-verdict').textContent(), /REFUSAL.*sequence/);
      await page.locator('#trace-case').selectOption('rolled');
      await page.locator('#replay-trace-worked').click();
      assert.match(await page.locator('#trace-verdict').textContent(), /REPLAY/);
      const stepBefore = await page.locator('#trace-step').textContent();
      await page.locator('#step-trace').click();
      assert.notEqual(await page.locator('#trace-step').textContent(), stepBefore);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/${name}-evidence.png`, fullPage: true });
      await page.goto(server.base + '/course');
      await page.getByRole('heading', { name: 'Build the rule. Test the claim.' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.screenshot({ path: `${output}/${name}-course.png`, fullPage: true });
      results.push({ name: name + '-evidence', width, packageMismatch: true, missingEventRefused: true, rolloverPlayback: true, errors });
      await page.close();
    });
  }
  await withServer(async (server) => {
    const page = await browser.newPage();
    await page.addInitScript(() => sessionStorage.setItem('ivy.courier.session.v1', 'A'.repeat(43)));
    await page.goto(server.base);
    await page.waitForFunction(() => document.getElementById('connection').textContent === 'Connected');
    assert.equal(await page.locator('#score').textContent(), '0', 'invalid old capability creates a fresh session');
    await page.close();
    const blocked = await browser.newPage();
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('storage disabled'); };
      Storage.prototype.setItem = () => { throw new Error('storage disabled'); };
    });
    await blocked.goto(server.base);
    await blocked.getByRole('button', { name: 'Connect to server', exact: true }).click();
    await blocked.waitForFunction(() => document.getElementById('connection').textContent === 'Connected');
    assert.match(await blocked.locator('#announcement').textContent(), /storage is unavailable/);
    await blocked.close();
    await join(server.base);
    await join(server.base);
    const full = await browser.newPage();
    await full.goto(server.base);
    await full.getByRole('button', { name: 'Connect to server', exact: true }).click();
    await full.waitForFunction(() => document.getElementById('announcement').textContent.includes('All four lab slots'));
    assert.match(await full.locator('#announcement').textContent(), /restart your local server/);
    await full.close();
    results.push({ sessionControls: 'invalid capability, blocked storage and full-session remedy passed' });
  });
} finally { await browser.close(); }
await writeFile(`${output}/browser-result.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
