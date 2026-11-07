// Supplied standalone CPU backend. No tensor-course code or external package.
export function finiteVector(x,n,label='vector') {
 if(!Array.isArray(x) || x.length!==n || Array.from(x).some(v=>!Number.isFinite(v))) throw new Error(`${label} must contain ${n} finite numbers`);
 return x;
}
export const zeros=n=>Array(n).fill(0);
export const dot=(a,b)=>{finiteVector(b,a.length);return a.reduce((s,v,i)=>s+v*b[i],0);};
export function linear(x,weight) {
 const [m,n]=weight.shape; finiteVector(x,m,'linear input'); finiteVector(weight.data,m*n,'weight');
 const out=zeros(n);
 for(let j=0;j<n;j++) for(let i=0;i<m;i++) out[j]+=x[i]*weight.data[i*n+j];
 return out;
}
export const add=(a,b)=>{finiteVector(b,a.length);return a.map((v,i)=>v+b[i]);};
export const multiply=(a,b)=>{finiteVector(b,a.length);return a.map((v,i)=>v*b[i]);};
export const row=(weight,i)=>weight.data.slice(i*weight.shape[1],(i+1)*weight.shape[1]);
