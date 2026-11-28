export const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inline=s=>escape(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
// base: the folder a lesson's relative picture paths start from, as the page that shows it sees it.
export function renderMarkdown(md,base=''){
 let code=false,list=false,parts=[];
 for(const line of md.split('\n')){
   if(line.startsWith('```')){if(list){parts.push('</ul>');list=false;}parts.push(code?'</code></pre>':'<pre><code>');code=!code;continue;}
   if(code){parts.push(escape(line)+'\n');continue;}
   if(/^[-*] /.test(line)){if(!list){parts.push('<ul>');list=true;}parts.push('<li>'+inline(line.slice(2))+'</li>');continue;}
   if(list){parts.push('</ul>');list=false;}
   if(!line.trim())continue;
   if(/^#{1,3} /.test(line)){const n=line.indexOf(' ');parts.push(`<h${n}>${inline(line.slice(n+1))}</h${n}>`);continue;}
   const img=line.match(/^!\[([^\]]*)\]\(([A-Za-z0-9_\/.-]+\.svg)\)$/);if(img&&/^[A-Za-z0-9_]/.test(img[2])&&!img[2].split('/').includes('..')){parts.push(`<figure><img src="${escape(base+img[2])}" alt="${escape(img[1])}"></figure>`);continue;}
   const m=line.match(/^\{\{practice:([a-z0-9-]+)\}\}$/);if(m){parts.push(`<div class="practice" data-practice="${m[1]}"></div>`);continue;}
   parts.push('<p>'+inline(line)+'</p>');
 }
 if(list)parts.push('</ul>');if(code)throw new Error('unclosed code fence');return parts.join('\n');
}
