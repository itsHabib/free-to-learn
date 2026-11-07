export const VERSION='beacon-keep/1';
export const ACTIONS=['rest','scout','swarm','brute'];
export const CARDS={rest:{threat:0,reward:0,cost:0},scout:{threat:1,reward:2,cost:1},swarm:{threat:2,reward:3,cost:2},brute:{threat:3,reward:4,cost:3}};
export const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function hash(x){let h=2166136261;for(const c of typeof x==='string'?x:canonical(x)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return (h>>>0).toString(16).padStart(8,'0');}
export const copy=x=>JSON.parse(JSON.stringify(x));
export const distance=(p,[lo,hi])=>Math.max(lo-p,0,p-hi);
export const targetAt=(profile,round,schedule)=>schedule?schedule[round]:profile==='pulse'?(round%6<3?[.15,.35]:[.4,.65]):[.25,.55];
export function distributionOK(d,allowed){return !!d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).sort().join()===allowed.slice().sort().join()&&Object.values(d).every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&Math.abs(Object.values(d).reduce((a,b)=>a+b,0)-1)<1e-9;}
export function wilson(y,n){if(!n)return [0,1];const z=1.96,den=1+z*z/n,c=(y/n+z*z/(2*n))/den,d=z*Math.sqrt(y/n*(1-y/n)/n+z*z/(4*n*n))/den;return [Math.max(0,c-d),Math.min(1,c+d)];}
