// Compiles the same ES module source graph in browser and Node workers.
export async function loadModules(sources) {
 const urls=new Map(),visiting=new Set();
 function build(name){if(urls.has(name))return urls.get(name);if(visiting.has(name))throw Error('circular learner imports');if(!(name in sources))throw Error('missing learner file: '+name);visiting.add(name);
 const source=sources[name].replace(/(from\s*|import\s*)(['"])([^'"]+)\2/g,(all,p,q,path)=>{if(['../shared.mjs','../game.mjs','../control.mjs','../fixtures.mjs','../resample.mjs','../data.mjs','../uncertainty.mjs','../audit.mjs'].includes(path))return p+q+new URL(path.replace('../','./'),import.meta.url).href+q;if(!/^\.\/[a-z-]+\.mjs$/.test(path))throw Error('Use local named course modules only: '+path);return p+q+build(path.slice(2))+q;});
 const url=typeof process==='undefined'?URL.createObjectURL(new Blob([source],{type:'text/javascript'})):'data:text/javascript;base64,'+Buffer.from(source).toString('base64');urls.set(name,url);visiting.delete(name);return url;}
 const modules={};for(const name of Object.keys(sources).filter(n=>n.endsWith('.mjs')))modules[name]=await import(build(name));return modules;
}
