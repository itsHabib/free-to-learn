/** Module 4 learner work. You own the denominator and experimental unit. */
import {blockBootstrap} from '../lib/statistics.mjs';

export function summarize(records, plan) {
  // records: [{slotId,record}], plan.roster is the full expected schedule.
  // Return {complete,expected,observed,missing:[],duplicates:[],invalid:[],
  //   matrix,comparisons:[{pair,blocks:[{scenarioId,value}],estimate,interval,units}]}.
  // Matrix order is plan.policyIds. For each pair, average both seats and all
  // randomness replicates within each scenario before blockBootstrap(values).
  // Missing, duplicate, wrong-plan or misassigned evidence cannot be complete.
  // An incomplete result may use matrix:null; never invent outcomes.
  throw new Error('Implement the paired report after lessons 4.1–4.2.');
}
