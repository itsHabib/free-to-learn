import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const publicFiles=['index.html','style.css','app.mjs','content.mjs','supplier.mjs','font.mjs','raster.mjs','pages.mjs','progression.mjs','diagnostics.mjs','notebook.mjs','checks.mjs','starter.body.js','CONTRACT.md','SOURCES.md'];
export function build(output=join(root,'build')){
 const target=resolve(output);if(existsSync(target)&&lstatSync(target).isSymbolicLink())throw Error('Build target cannot be a symlink.');mkdirSync(target,{recursive:true});
 const sourceFiles=publicFiles.map(name=>[name,readFileSync(join(root,'public',name))]);
 const strip=source=>source.replace(/^import[^\n]+\n/gm,'').replace(/^export\s*\{[^\n]+\n/gm,'').replace(/\bexport\s+(?=(?:const|function|async function))/g,'');
 const worker=['supplier.mjs','font.mjs','raster.mjs','checks.mjs','progression.mjs','worker-entry.js'].map(name=>strip(readFileSync(join(root,'public',name),'utf8'))).join('\n');
 sourceFiles.push(['worker.js',Buffer.from(worker)]);
 const demo=join(root,'public','demo.json');if(existsSync(demo))sourceFiles.push(['demo.json',readFileSync(demo)]);
 const manifest=sourceFiles.map(([name,data])=>({name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')}));
 const buildId=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
 for(const [name,data]of sourceFiles)writeFileSync(join(target,name),data);
 writeFileSync(join(target,'build.json'),JSON.stringify({course:'tiny-browser-engine',status:'local-candidate-not-released',buildId,files:manifest},null,2)+'\n');
 console.log(JSON.stringify({output:target,buildId,files:manifest.length,authorCodeIncluded:false}));return {target,buildId,manifest};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))build(process.argv[2]);
