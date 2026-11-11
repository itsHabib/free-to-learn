import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {learnerFiles,sourceIdentity} from './lib/identity.mjs';
import {items} from './lib/practice.mjs';
import {sha256} from './lib/support.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline=x=>esc(x).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>');
function markdown(source){
  const lines=source.split('\n'),out=[];let paragraph=[],code=null;
  const flush=()=>{if(paragraph.length){out.push('<p>'+inline(paragraph.join(' '))+'</p>');paragraph=[];}};
  for(const line of lines){
    if(line.startsWith('```')){flush();if(code===null)code=[];else{out.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');code=null;}continue;}
    if(code!==null){code.push(line);continue;}
    const practice=line.match(/^\{\{practice:(\w+)\}\}$/);if(practice){flush();out.push('<div class="practice" data-item="'+practice[1]+'"></div>');continue;}
    if(line==='{{diagram:merkle}}'){flush();out.push('<figure><div class="diagram-scroll" role="region" aria-label="Merkle proof diagram; scroll horizontally to inspect all nodes" tabindex="0"><img src="reader/merkle.svg" alt="Merkle proof of C: combine C with sibling D on the right, then combine sibling AB on the left; bind leaf count four." style="display:block;width:100%;min-width:720px;height:auto"></div><figcaption>The supplied proof contains D and AB. The verifier reconstructs the green path from C; it does not receive every account. On narrow screens, scroll the diagram horizontally to read every label.</figcaption></figure>');continue;}
    const heading=line.match(/^(#{1,3}) (.+)/);if(heading){flush();const n=heading[1].length;out.push(`<h${n}>${inline(heading[2])}</h${n}>`);continue;}
    if(!line.trim()){flush();continue;}
    paragraph.push(line);
  }
  flush();return out.join('\n');
}
const identity=await sourceIdentity(root),stamp=new Date().toISOString().replaceAll(':','-');
const stage=join(root,'dist',`learner-${identity.hash.slice(0,12)}-${stamp}`);
await mkdir(stage,{recursive:true});
for(const name of learnerFiles){await mkdir(dirname(join(stage,name)),{recursive:true});await copyFile(join(root,name),join(stage,name));}
const lessons=learnerFiles.filter(x=>x.startsWith('lessons/'));
const chapters=[];for(const name of lessons){const source=await readFile(join(root,name),'utf8');chapters.push({id:name.slice(8,10),title:source.split('\n')[0].replace(/^# /,''),html:markdown(source)});}
const nav=chapters.map(c=>`<a href="#module-${c.id}">${esc(c.title)}</a>`).join('');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Build a Blockchain Laboratory</title><link rel="stylesheet" href="reader/style.css"></head><body>
<a class="skip" href="#content">Skip to lessons</a><header><span class="eyebrow">SYSTEMS LAB · OFFLINE CANDIDATE</span><h1>Build a Blockchain Laboratory</h1><p>Make a node defend its state when histories disagree.</p><p class="scope">Synthetic counters · ephemeral keys · no live chain · no production security claim</p></header>
<div class="layout"><aside><nav aria-label="Course modules">${nav}</nav><a href="README.md">Terminal setup and run commands</a><a href="CONTRACT.md">Protocol contract</a><a href="REPORT-TEMPLATE.md">Incident report template</a><a href="SOURCES.md">Sources and model limits</a><button id="export" type="button">Export practice history</button><p id="storage-status" role="status"></p><small>Build ${identity.hash.slice(0,16)}. Practice is saved in this browser.</small></aside>
<main id="content"><section class="start"><h2>Your node, your rules</h2><p>You implement validation, state, commitments, local policy and recovery. Node’s cryptography, the in-process scheduler and this reader are supplied. Begin in a terminal in this folder:</p><pre><code>node lab.mjs start\nnode lab.mjs lesson 01\nnode lab.mjs check 01</code></pre><p>The starter should fail. Edit <code>work/protocol.mjs</code>, then check again. These browser questions are practice, separate from code checks and the final reasoning rubric. All modules stay open.</p></section>
${chapters.map(c=>`<article id="module-${c.id}" data-module="${c.id}">${c.html}</article>`).join('\n')}
<footer>Local source and test results are milestones. This candidate is not live on Free to Learn, and browser practice and terminal code work save separately. Human learning and comprehensive accessibility remain unverified.</footer></main></div>
<script id="practice-data" type="application/json">${JSON.stringify({identity,items}).replaceAll('<','\\u003c')}</script><script src="reader/app.js"></script></body></html>`;
await writeFile(join(stage,'index.html'),html,{flag:'wx'});
const manifest={createdAt:new Date().toISOString(),runtime:process.version,source:identity,generated:{'index.html':sha256(html)},excluded:['instructor/','evidence/','work/','QA.md','HANDOFF.md'],verification:'Source build only. Browser/native/live/network NOT RUN.'};
await writeFile(join(stage,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
console.log(JSON.stringify({stage,...manifest},null,2));
