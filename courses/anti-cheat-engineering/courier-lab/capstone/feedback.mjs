// Author-side answers. Never copy this module into a prepared learner workspace.
const copy = (value) => JSON.parse(JSON.stringify(value));

const predictions = [
  {
    id: 'successful-retry',
    question: 'A repair succeeds, the actor moves away, and the same request arrives again. What receipt and balances should result?',
    answer: 'Return duplicate with the original successful receipt and the current state. Do not charge or add energy again, and do not replace the receipt balances with current balances.',
    reason: 'A known actor-scoped request ID is resolved before distance or other new-operation checks. The receipt describes its original success even if movement or later repairs changed current state.',
    source: 'LEARNER.md#request-identity',
    freshVariant: { question: 'Request A succeeds, request B later changes the same actor balances, and A is retried. Which balances belong in A\'s receipt, and which belong in the returned state?' },
  },
  {
    id: 'failed-id',
    question: 'A request fails outside the radius, the actor moves inside, and the same ID is submitted again. What state should have been retained from the failure?',
    answer: 'The range failure leaves balances and receipt history unchanged, with receipt:null. It does not reserve the ID, so the later in-range request is a new operation that can succeed if the remaining checks pass.',
    reason: 'Only a successful resource change earns a receipt. Remembering a failure as success would prevent repair after the temporary cause of refusal is removed.',
    source: 'LEARNER.md#failed-requests',
    freshVariant: { question: 'A new request fails because credits are below 2. The server later grants enough credits and receives the same request ID. Should the old failure be returned as a duplicate? Explain the retained history.' },
  },
  {
    id: 'range-boundary',
    question: 'How do (400,0) and (300,300) compare with a station at (0,0)? Which calculation decides?',
    answer: '(400,0) has squared distance 160000=400², so it passes the inclusive range check. (300,300) has squared distance 180000>160000, so it fails range.',
    reason: 'Use both coordinate differences and compare their squared sum with rangeMm² using <=. Checking each axis independently would incorrectly admit the diagonal point.',
    source: 'LEARNER.md#one-resource-transaction',
    freshVariant: { question: 'A station is at (100,-100). Compare actors at (340,220) and (400,200) against its 400 mm range, showing squared coordinate differences.' },
  },
  {
    id: 'station-conflict',
    question: 'A successful request ID is reused for another station. What differs from an ordinary duplicate?',
    answer: 'Return conflict with receipt:null and unchanged state. An ordinary duplicate uses the same station and returns the original receipt.',
    reason: 'The request ID binds the original operation to its station. A changed station is a conflicting request, not an instruction to reinterpret or repeat the successful repair.',
    source: 'LEARNER.md#request-identity',
    freshVariant: { question: 'Actor A succeeds with ID q at alpha. Actor B then uses ID q at beta. Is that a conflict with actor A\'s receipt, and which history should be searched?' },
  },
  {
    id: 'receipt-bound',
    question: 'Both receipt slots are full. What happens to a new ID and to an existing successful ID?',
    answer: 'A new ID at an existing station returns history-full with no changes. An existing successful ID still returns duplicate for its original station, or conflict if the station differs.',
    reason: 'Resolve existing IDs before checking new-operation capacity. Keep retained receipts: eviction could let an old successful ID charge again. An unknown station still precedes history-full for a new ID.',
    source: 'LEARNER.md#bounded-receipts',
    freshVariant: { question: 'An actor has two receipts, is out of range and has no credits. Compare a new ID for an existing station, a new ID for an unknown station, and an exact retry of a retained success. Which reason takes precedence in each case?' },
  },
  {
    id: 'server-owned-values',
    question: 'A repair body claims new position, energy, credits and price. Which source owns these values?',
    answer: 'The server-owned state supplies position, energy, credits and configured price. The HTTP layer rejects the extra body fields with status 400 and leaves state unchanged; the valid body contains only requestId and stationId.',
    reason: 'The session token supplies actor identity and the server supplies resource state. Client resource claims are neither authorization nor an alternate input to the validated policy.',
    source: 'LEARNER.md#independent-http-tests',
    freshVariant: { question: 'A request names another actor in an extra actorId field and offers price:0. Which layer should reject it, and where should the actor and cost come from for a valid request?' },
  },
];

const freshVariantAnswers = [
  { id: 'successful-retry', answer: 'A keeps the balances recorded at A\'s original success. The returned state keeps the current balances after B. Retrying A changes neither; it is duplicate even if current state differs from the receipt.' },
  { id: 'failed-id', answer: 'No. The failure stored no success receipt and reserved no ID, so the retry is evaluated as a new operation against current server-owned state.' },
  { id: 'range-boundary', answer: 'For (340,220), offsets are (240,320), giving 57600+102400=160000: in range at the inclusive boundary. For (400,200), offsets are (300,300), giving 180000: out of range.' },
  { id: 'station-conflict', answer: 'No cross-actor conflict exists. Search actor B\'s receipts; request IDs and receipt capacity are actor-scoped. Actor B may perform its own new operation if its checks pass.' },
  { id: 'receipt-bound', answer: 'For the existing station, the new ID returns history-full before range or funds. An unknown station returns station before history-full. The retained exact retry returns duplicate before any new-operation checks.' },
  { id: 'server-owned-values', answer: 'HTTP body validation rejects the extra fields with 400. For a valid body, actor identity is resolved from the session token and cost comes from server configuration; neither comes from a client claim.' },
];

const transfer = {
  question: 'A shared printer charges quota when it accepts a job. Connections can drop, clients can retry and completed-job details cannot be stored indefinitely. Propose retry identity, receipt scope and expiration/session boundaries. Explain behavior when history is full and what durable state or protocol a restart needs.',
  rubric: [
    { criterion: 'Accepted-job identity', evidence: 'Defines request identity and owner scope, binds it to the accepted job, and resolves exact retries without charging or printing again; distinguishes conflicting reuse.' },
    { criterion: 'Receipt and state', evidence: 'Preserves the original acceptance result while reporting current state separately; failures that never accepted a job do not masquerade as success.' },
    { criterion: 'Bound and lifecycle', evidence: 'Defines an explicit retry/session horizon and behavior at capacity; does not silently evict receipts while still promising deduplication for old IDs.' },
    { criterion: 'Restart boundary', evidence: 'Requires durable receipt/acceptance identity and coordinated printer/charge state, or explicitly limits the retry guarantee across restart.' },
  ],
  referenceAnswer: 'Scope an opaque request ID to an authenticated owner and a defined session or durable job namespace. Store the accepted job identity and original quota result so an exact retry can acknowledge the earlier acceptance without charging or printing again; reject conflicting reuse. Bound retention through an explicit lifecycle that clients understand. At capacity, refuse new acceptance or move to a coordinated new session instead of evicting receipts while old IDs remain valid. Across restart, durable acceptance and charge state must be coordinated with actual print delivery, or the system must admit uncertainty and reconcile it. A memory-only receipt list cannot promise exactly-once printing or charging after a crash.',
};

/** Release only after the check has captured the learner's original response. */
export function postCheckFeedback() {
  return copy({ schema: 1, module: 'capstone', predictions });
}

/** Author/reviewer material; do not release as first prediction feedback. */
export function reviewerFeedback() {
  return copy({ schema: 1, module: 'capstone', freshVariantAnswers, transfer });
}
