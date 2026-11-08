import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withServer } from './harness.mjs';
const output = fileURLToPath(new URL('../../../../dist/anti-cheat-browser/analysis/', import.meta.url));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for(const [name,width,height] of [['desktop',1280,1000],['mobile',390,844],['narrow',320,740]]) {
  await withServer(async server=>{
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(server.base+'/analysis');
   await page.locator('#show-evaluation-worked').waitFor();
   assert.equal(await page.locator('#evaluation-results').isVisible(),false);
   assert.equal(await page.locator('#retention-results').isVisible(),false);
   await page.click('#show-evaluation-worked');
   assert.equal(await page.locator('#tp').textContent(),'1');
   await page.selectOption('#evaluation-setting','5');await page.click('#show-evaluation-worked');
   assert.equal(await page.locator('#tp').textContent(),'1');
   assert.equal(await page.locator('#fn').textContent(),'0');
   await page.selectOption('#evaluation-setting','6');await page.click('#show-evaluation-worked');
   assert.match(await page.locator('#evaluation-rates').textContent(),/undefined/);
   await page.selectOption('#retention-setting','1');await page.click('#show-retention-worked');
   assert.match(await page.locator('#retention-note').textContent(),/128 of 4096/);
   assert.match(await page.locator('#retention-time').textContent(),/max/);
   await page.selectOption('#evaluation-setting','3');await page.click('#show-evaluation-worked');
   assert.equal(await page.locator('#tp').textContent(),'0');
   assert.equal(await page.locator('#fn').textContent(),'1');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   await page.locator('#show-retention-worked').focus();await page.keyboard.press('Enter');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`${output}/${name}-analysis.png`,fullPage:true});
   results.push({name,width,counts:true,zeroDenominator:true,retention:true,keyboard:true,overflow:false,errors});
   await page.close();
  });
 }
} finally {await browser.close();}
await writeFile(output+'/browser-result.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
