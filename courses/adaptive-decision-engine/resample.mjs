import {hash} from './shared.mjs';
// Resample complete paired episodes, never individual correlated rounds.
export function pairedInterval(rows,key='distance',count=1000){if(!rows.length)return null;const means=[];for(let b=0;b<count;b++){let sum=0;for(let i=0;i<rows.length;i++){const n=parseInt(hash(['bootstrap',b,i]),16)%rows.length;sum+=rows[n].difference[key];}means.push(sum/rows.length);}means.sort((a,b)=>a-b);return [means[Math.floor(count*.025)],means[Math.min(count-1,Math.floor(count*.975))]];}
