export function calibrationReport(c,calibration,evaluation,threshold=.65){
 const table=c.fitCalibration(calibration),reports=[];
 for(const domain of [...new Set(evaluation.map(r=>r.domain))].sort()){
  const rows=evaluation.filter(r=>r.domain===domain),training=calibration.filter(r=>r.domain===domain),slice=table.domains[domain];
  const mapped=rows.filter(r=>slice?.bins.some(b=>r.score>=b.lo&&r.score<b.hi&&b.p!==null));
  const chosen=rows.filter(r=>c.select({ok:true,score:r.score},table,domain,threshold).use);
  const prevalence=training.length?training.reduce((n,r)=>n+r.label,0)/training.length:null;
  reports.push({domain,rows:rows.length,episodes:new Set(rows.map(r=>r.episodeId)).size,events:rows.reduce((n,r)=>n+r.label,0),rawBrier:c.brier(rows,r=>r.score),mappedRows:mapped.length,mappedBrier:mapped.length?c.brier(mapped,r=>slice.bins.find(b=>r.score>=b.lo&&r.score<b.hi).p):null,prevalenceBrier:prevalence===null?null:c.brier(rows,()=>prevalence),selected:chosen.length,coverage:chosen.length/rows.length,risk:chosen.length?chosen.reduce((n,r)=>n+1-r.label,0)/chosen.length:null});
 }
 return {table,rows:calibration.length,evaluationRows:evaluation.length,threshold,domains:reports};
}
