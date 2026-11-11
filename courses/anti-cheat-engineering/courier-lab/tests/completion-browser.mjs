import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withServer } from './harness.mjs';
const output = fileURLToPath(new URL('../../../../dist/anti-cheat-browser/completion/', import.meta.url));
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];
try{for(const [name,width,height] of [['desktop',1280,1000],['mobile',390,844],['narrow',320,740]]){
 await withServer(async server=>{
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.base+'/completion');await page.locator('#show-timing-worked').waitFor();
  assert.equal(await page.locator('#timing-checkpoints').textContent(),'');
  assert.equal(await page.locator('#recovery-state').textContent(),'');
  assert.equal(await page.locator('#repair-state').textContent(),'');
  assert.equal(await page.locator('#timing-checkpoints').textContent(),'');await page.selectOption('#timing-case','7');assert.match(await page.locator('#timing-input').textContent(),/disconnect/);await page.click('#show-timing-worked');assert.match(await page.locator('#timing-checkpoints').textContent(),/recovered-one-step/);
  await page.selectOption('#recovery-phase','codeOnly');await page.click('#show-recovery-worked');assert.match(await page.locator('#recovery-result').textContent(),/state-schema/);
  await page.selectOption('#recovery-phase','recovered');await page.click('#show-recovery-worked');assert.match(await page.locator('#recovery-result').textContent(),/applied/);
  await page.selectOption('#repair-step','1');await page.click('#show-repair-worked');assert.match(await page.locator('#repair-result').textContent(),/duplicate/);
  await page.locator('#show-repair-worked').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  assert.deepEqual(errors,[]);await page.screenshot({path:`${output}/${name}-completion.png`,fullPage:true});
  await page.goto(server.base+'/course');assert.equal(await page.locator('.course-grid article').count(),10);assert.equal(await page.locator('.course-grid article a').count(),10);await page.screenshot({path:`${output}/${name}-course.png`,fullPage:true});
  await page.goto(server.base+'/sources');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await page.screenshot({path:`${output}/${name}-sources.png`,fullPage:true});
  results.push({name,width,recovery:true,retry:true,timing:true,navigation:10,overflow:false,errors});await page.close();
 });}}finally{await browser.close();}
await writeFile(output+'/browser-result.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
