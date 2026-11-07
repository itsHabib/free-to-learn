export type Kind='rest'|'scout'|'swarm'|'brute';
export type Action={kind:Kind};
export interface Observation {episodeId:string;revision:number;round:number;health:number;supplies:number;charge:number;budget:number;lastKind:Kind|null;recentDamage:number[];recentMoves:string[];pressure:number|null;target:[number,number];flags:{historyComplete:boolean;available:boolean}}
export interface Choice {action:Action;memory:{recovering:boolean};reason?:string;origin?:'rules'|'synthetic-fixture'|'recorded'|'live'}
export interface Request {body:{model:string;state:string;questions:Record<string,unknown>};binding:{requestId:string;stateHash:string;questionHash:string;episodeId:string;revision:number;allowed:Kind[];model:string;host:string;adapterVersion:string}}
export type Proposal={ok:true;action:Action;distribution:Record<Kind,number>;binding:Request['binding'];origin:string}|{ok:false;error:string};
export interface Reservation {token:number;episodeId:string;revision:number;deadline:number}
export interface Scheduler {used:number;maxRequests:number;timeoutMs:number;serial:number;pending:Reservation|null;armed:boolean}

// Runtime recovery metadata is supplied; it does not serialize network promises.
export type PlayMode='demo'|'learner'|'project';
export interface SavedSelection {version:1;episodeId:string;revision:number;stateHash:string;memoryHash:string;source:string;playMode:PlayMode;decisionHash:string;decision:Choice & {proposed?:Kind;executed:Kind;violation:boolean}}
export interface RuntimeRecovery {version:1;phase:'selected'|'unselected'|'terminal';selection:SavedSelection|null}
