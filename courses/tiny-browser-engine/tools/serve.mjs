// Optional local launcher. Not started during authoring without a shared server slot.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../build');
const manifest=JSON.parse(readFileSync(join(root,'build.json'),'utf8'));
const allowed=new Set([...manifest.files.map(f=>f.name),'build.json']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
const server=createServer((req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';}catch{res.writeHead(400);res.end();return;}
 if(!allowed.has(name)){res.writeHead(404);res.end('Not in the learner package.');return;}
 try{const bytes=readFileSync(join(root,name));res.writeHead(200,{'Content-Type':types[extname(name)]??'application/octet-stream','Content-Length':bytes.length,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':name==='worker.js'?"default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'"});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(500);res.end('Could not read learner asset.');}
});
server.listen(Number(process.argv[2]??0),'127.0.0.1',()=>console.log(`Tiny Browser local candidate: http://127.0.0.1:${server.address().port}/`));
