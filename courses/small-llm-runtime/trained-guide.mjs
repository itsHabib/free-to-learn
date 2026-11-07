import {renderMarkdown} from './render.mjs';
const article=document.querySelector('#trained-content');
try{
 const response=await fetch('./TRAINED.md');
 if(!response.ok)throw new Error(`Guide unavailable (${response.status})`);
 article.innerHTML=renderMarkdown(await response.text());
 article.focus({preventScroll:true});
}catch(error){
 article.textContent=String(error?.message??error)+'. Read TRAINED.md from the extracted offline ZIP; your existing lesson/work history is unchanged.';
 article.focus({preventScroll:true});
}
