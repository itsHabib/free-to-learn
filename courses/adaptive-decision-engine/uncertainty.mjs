// Supplied bound for independent episode summaries in [0,1].
// Hoeffding (1963), Theorem 2; two-sided union bound, fixed alpha.
export function episodeInterval(rates,alpha=.05){
 if(!Array.isArray(rates)||rates.some(x=>!Number.isFinite(x)||x<0||x>1)||!Number.isFinite(alpha)||alpha<=0||alpha>=1)throw Error('invalid episode summaries');
 if(!rates.length)return [0,1];
 const mean=rates.reduce((a,b)=>a+b,0)/rates.length;
 const radius=Math.sqrt(Math.log(2/alpha)/(2*rates.length));
 return [Math.max(0,mean-radius),Math.min(1,mean+radius)];
}
