const source = { path: 'lab/order/LEARNER.md', anchor: 'policy-contract' };

export const unit = {
  id: 'order', title: 'M2 · Keep the newest intent', prerequisites: ['spatial'],
  intro: 'An older direction arrives after a newer one. Predict what the owner keeps, which interaction is staged, and the last tick on which movement remains active.',
  difficulty: 'The interacting pieces are sequence comparison, a pending interaction bit and inclusive expiry. Track the five state fields separately before following a tick.',
  objectives: [
    { id: 'order.admission', kind: 'procedure', text: 'Return the unchanged admission state for an equal or older sequence and update it for a newer sequence.', prerequisites: ['spatial.tick-order'] },
    { id: 'order.coalescing', kind: 'procedure', text: 'Trace several arrivals into at most one interaction on the next owner tick.', prerequisites: ['order.admission', 'spatial.cooldown'] },
    { id: 'order.expiry', kind: 'procedure', text: 'Compute the inclusive movement expiry and distinguish new admission from stale retries or observation.', prerequisites: ['order.admission'] },
  ],
  sections: [
    {
      id: 'admission', title: 'Compare sequence before changing state', objectiveIds: ['order.admission'],
      paragraphs: [
        'A sequence is a sender’s increasing input number. It orders accepted intent; it is not a timestamp, elapsed duration or count of ticks. The owner records lastSeq, the largest sequence admitted so far. The parser has already checked the input’s shape. Here the decision is only whether its sequence is strictly greater than lastSeq.',
        'An equal or smaller sequence is stale. Every state field stays unchanged: lastSeq, lastSeen, expiresAt, move and pendingInteract. In particular, a stale interact:true cannot add an interaction. A newer input replaces move, records the receipt tick in lastSeen, sets expiresAt to that tick plus four, and combines the interaction flags with logical OR: pendingInteract is true if either the old pending flag or the new interact flag is true; it is false only when both are false.',
      ],
      worked: { prompt: 'At tick 7, state is {lastSeq:12,lastSeen:5,expiresAt:9,move:"E",pendingInteract:false}. Input {seq:11,move:"W",interact:true} arrives.', steps: ['11 is smaller than 12, so the input is stale.', 'Do not copy its direction, interaction bit or a fresh expiry into state.', 'Return stale with all five original fields unchanged.'], answer: 'The owner still intends E, expiresAt is 9, and pendingInteract is false.' },
      completion: { prompt: 'The same state receives seq 13, move W, interact false at tick 7.', steps: ['13 is strictly larger than 12, so admit it.', 'lastSeq becomes 13 and lastSeen becomes 7.'], missing: 'Compute expiresAt and fill move and pendingInteract.' }, source,
    },
    {
      id: 'coalescing', title: 'Many arrivals, one pending interaction', objectiveIds: ['order.coalescing'],
      paragraphs: [
        'Coalescing means keeping a single pending yes/no flag until the next tick, rather than queueing an action for every request. For newer inputs, pendingInteract becomes oldPending OR input.interact. A later admitted false does not erase a previously admitted true. A stale true does not create a pending action.',
        'No ticks occur between the arrivals in these exercises. At the next tick, the latest admitted direction moves the courier once. Then the engine consumes the pending flag once and applies the M1 cooldown and range rules. Three admitted true bits still produce at most one pickup or deposit, not three rewards. These rules describe state; packet clumping or retrying alone is not a cheating finding.',
      ],
      worked: { prompt: 'At tick 4 an empty courier at the core is idle and ready. Inputs arrive before the next tick: seq 8 idle true, seq 9 idle false, seq 8 idle true.', steps: ['Sequence 8 is admitted and stages true.', 'Sequence 9 is admitted; true OR false remains true.', 'The final sequence 8 is stale and changes nothing.', 'Tick 5 consumes the one pending action, picks up once, and clears the pending flag.'], answer: 'lastSeq = 9; pending before tick = true; applied interactions = 1; cargo after tick = true.' },
      completion: { prompt: 'Start with lastSeq 20 and pendingInteract false. Before a tick, receive seq 21 idle false, seq 20 idle true, seq 22 idle false.', steps: ['Sequence 21 is newer and leaves pending false.', 'Sequence 20 is stale, so its true bit is ignored.'], missing: 'Decide pending after sequence 22 and how many interactions the next tick attempts.' }, source,
    },
    {
      id: 'expiry', title: 'Count the four eligible movement ticks', objectiveIds: ['order.expiry'],
      paragraphs: [
        'A newer input admitted at tick T sets expiresAt to T + 4. Movement may run on T+1, T+2, T+3 and T+4. The movement test includes equality: currentTick <= expiresAt. At T+5 the intent has expired. Receipt itself causes no movement, and missed movement is not saved for later catch-up.',
        'A genuinely newer input at T+4 can renew the window before the next tick. An equal-sequence retry at the same time cannot. Reading state is observation only: ten polls cannot extend expiresAt. Keep tests on open floor so a wall cannot make an extra or missing movement step invisible. Later, you will test the real clock rather than treating receipt as a tick.',
      ],
      worked: { prompt: 'An east input arrives at tick 10 from x=1000. No newer input arrives and five ticks run on open floor.', steps: ['Expiry is 10 + 4 = 14.', 'Ticks 11 through 14 add four steps of 250 mm.', 'Tick 15 is outside the window and adds nothing.'], answer: 'At tick 14 x = 2000; at tick 15 x remains 2000.' },
      completion: { prompt: 'At tick 14, before the next step, the owner receives a newer west input.', steps: ['The new admission uses receipt tick 14.', 'Its window is based on the new receipt, not the old one.'], missing: 'Compute the new expiry and decide whether tick 15 can move west.' }, source,
    },
  ],
  masterySlots: ['coalescing', 'expiry', 'transfer'],
  support: {
    milestones: ['Mark each arrival newer or stale before touching state.', 'Trace a clump of inputs and write the single pending flag before a tick.', 'After the guided checks, implement admission.mjs in your prepared order workspace; keep the separately authored HTTP scenario for M3.'],
    hints: ['Which sequence was last admitted, and has a tick actually run?', 'For a stale input copy all five original fields. For a newer one OR the interaction flag and use receipt tick + 4.', 'After committing, compare each state field with the worked correction rather than replacing your original answer.'], reference: 'lab/order/LEARNER.md',
  },
};

function stateCase(n) {
  const tick = 5 + Math.floor(n / 3) % 23;
  const lastSeq = 10 + Math.floor(n / 7) % 40;
  const state = { lastSeq, lastSeen: tick - 2, expiresAt: tick + 2, move: ['N', 'E', 'S', 'W'][n % 4], pendingInteract: Boolean(Math.floor(n / 2) % 2) };
  const input = { v: 1, seq: lastSeq + [-2, 0, 3][n % 3], move: ['S', 'W', 'N', 'E'][n % 4], interact: Boolean(Math.floor(n / 3) % 2) };
  const expected = input.seq <= lastSeq ? { status: 'stale', next: { ...state } } : { status: 'admitted', next: { lastSeq: input.seq, lastSeen: tick, expiresAt: tick + 4, move: input.move, pendingInteract: state.pendingInteract || input.interact } };
  return { inputs: { state, input, tick }, expected, prompt: 'The input is already parsed. Return exactly JSON {status,next}; status is "stale" or "admitted". next must contain exactly lastSeq, lastSeen, expiresAt, move, pendingInteract. pendingInteract is a boolean, move is the retained or new direction string, and the other state fields are numbers.', explanation: `${input.seq} ${input.seq <= lastSeq ? 'is not greater than' : 'is greater than'} ${lastSeq}. ${input.seq <= lastSeq ? 'Return stale and preserve every field, even if the request carries a different direction or true interaction bit.' : `Admit it at tick ${tick}: expiry becomes ${tick + 4}, direction becomes ${input.move}, and pending is ${state.pendingInteract} OR ${input.interact}.`}` };
}

function coalescingCase(n) {
  const lastSeq = 20 + Math.floor(n / 9) % 40;
  const tick = 3 + Math.floor(n / 4) % 15;
  const inputBits = [[true, false, true], [false, true, false], [false, false, true], [true, true, false]][n % 4];
  const sequences = n % 2 ? [lastSeq + 1, lastSeq, lastSeq + 2] : [lastSeq + 2, lastSeq + 3, lastSeq + 1];
  const inputs = sequences.map((seq, index) => ({ seq, move: 'idle', interact: inputBits[index] }));
  const initialPending = Boolean(Math.floor(n / 5) % 2);
  let pending = initialPending;
  let newest = lastSeq;
  for (const input of inputs) {
    if (input.seq <= newest) continue;
    newest = input.seq;
    pending ||= input.interact;
  }
  const cargo = Boolean(Math.floor(n / 3) % 2);
  return {
    inputs: { receiptTick: tick, state: { lastSeq, pendingInteract: initialPending }, arrivals: inputs, actorAtTarget: { cargo, score: 2, move: 'idle', cooldownReady: true }, nextTick: tick + 1 },
    expected: { lastSeq: newest, pendingBeforeTick: pending, attemptedInteractions: Number(pending), cargoAfterTick: pending ? !cargo : cargo, scoreAfterTick: 2 + Number(pending && cargo), pendingAfterTick: false },
    prompt: 'No tick occurs between these arrivals. The idle actor is on the relevant target and cooldown is ready. Trace admission, then one tick. Return JSON {lastSeq,pendingBeforeTick,attemptedInteractions,cargoAfterTick,scoreAfterTick,pendingAfterTick}.',
    explanation: `Only newer sequences can contribute their true bit. The newest admitted sequence is ${newest} and the combined flag is ${pending}. A single flag allows ${Number(pending)} interaction, then is cleared. ${pending && cargo ? 'This is one deposit, so score rises once.' : pending ? 'This is one pickup, so score does not rise.' : 'No interaction is staged, so cargo and score stay put.'}`,
  };
}

function expiryCase(n) {
  const admittedAt = 5 + Math.floor(n / 5) % 27;
  const lastSeq = 30 + Math.floor(n / 7) % 40;
  const probeTick = admittedAt + [3, 4, 5][n % 3];
  const renewal = Math.floor(n / 3) % 3;
  const renewed = renewal === 2;
  const expiresAt = renewed ? probeTick + 4 : admittedAt + 4;
  const inputs = { admittedAt, lastSeq, initialExpiry: admittedAt + 4, probeTick, pollsSinceAdmission: n % 6, arrivalBeforeProbe: renewal ? { seq: lastSeq + (renewed ? 1 : 0), move: 'E', interact: false } : null };
  return { inputs, expected: { activeAtProbe: probeTick <= expiresAt, expiresAt, lastSeq: lastSeq + Number(renewed) }, prompt: 'The original intent is E. Polls are read-only; if an arrival is listed, process it at probeTick before testing movement for that tick. Return JSON {activeAtProbe,expiresAt,lastSeq}.', explanation: `${renewed ? `The strictly newer arrival renews expiry to ${probeTick} + 4 = ${expiresAt}.` : `Neither polls nor an equal-sequence retry renews expiry, so it stays ${expiresAt}.`} Movement is active when probeTick <= expiresAt: ${probeTick} <= ${expiresAt} is ${probeTick <= expiresAt}.` };
}

function transferCase(n) {
  const seq = 40 + Math.floor(n / 4) % 90;
  const initial = { lastSeq: seq, frame: 100 + n % 51 };
  const commands = [
    { kind: 'seek', seq: seq + 2, frame: 300 + n % 91 },
    { kind: 'read' },
    { kind: 'seek', seq: seq + (n % 3), frame: 700 + n % 83 },
    { kind: 'read' },
    ...(n % 2 ? [{ kind: 'seek', seq: seq + 3, frame: 200 + n % 47 }, { kind: 'read' }] : []),
  ];
  let state = { ...initial };
  const framesRead = [];
  for (const command of commands) {
    if (command.kind === 'read') { framesRead.push(state.frame); continue; }
    if (command.seq > state.lastSeq) state = { lastSeq: command.seq, frame: command.frame };
  }
  return { inputs: { initial, commands }, expected: { ...state, framesRead }, prompt: 'An owned replay scrubber applies a seek only if its sequence is strictly newer. A read reports the current frame without changing state. This scrubber has no movement, interaction flag or expiry. Return JSON {lastSeq,frame,framesRead} after all commands, with read results in order.', explanation: `The newer seek selects a frame; the equal or older conflicting seek cannot replace it. Read commands append observations only. The final selection is frame ${state.frame} at sequence ${state.lastSeq}; reads are ${JSON.stringify(framesRead)}. Do not import the game’s four-tick expiry into a contract that has none.` };
}

export function makeItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new TypeError('unknown item mode');
  if (!Number.isSafeInteger(seed) || seed < 0) throw new TypeError('seed must be a non-negative safe integer');
  const valid = mode === 'mastery' ? unit.masterySlots : unit.sections.map((section) => section.id);
  if (!valid.includes(key)) throw new TypeError('unknown order item key');
  const n = seed + (mode === 'completion' ? 137 : mode === 'mastery' ? 277 : 0);
  const builders = { admission: stateCase, coalescing: coalescingCase, expiry: expiryCase, transfer: transferCase };
  const item = builders[key](n);
  if (mode === 'completion') {
    item.inputs.completedSteps = key === 'admission'
      ? [`Compare ${item.inputs.input.seq} with lastSeq ${item.inputs.state.lastSeq}. The input is ${item.inputs.input.seq > item.inputs.state.lastSeq ? 'newer' : 'stale'}; now fill every returned state field.`]
      : key === 'coalescing'
        ? [`The first arrival has sequence ${item.inputs.arrivals[0].seq}, which is newer than ${item.inputs.state.lastSeq}. After it, pending is ${item.inputs.state.pendingInteract || item.inputs.arrivals[0].interact}. Continue with the remaining arrivals.`]
        : [`The original inclusive endpoint is ${item.inputs.admittedAt} + 4 = ${item.inputs.initialExpiry}. Next check whether the listed arrival is new enough to replace this endpoint.`];
  }
  const objectiveIds = key === 'admission' ? ['order.admission'] : key === 'coalescing' ? ['order.admission', 'order.coalescing'] : key === 'expiry' ? ['order.admission', 'order.expiry'] : ['order.admission'];
  return { id: `order:${mode}:${key}:${seed}`, objectiveIds, ...item, prompt: `${mode === 'completion' ? 'Complete the missing state transition after applying the comparison. ' : ''}${item.prompt}`, format: { type: 'json' }, hints: mode === 'mastery' ? [] : ['Separate arrivals from processed ticks and from read-only polls.', 'Reject equal or older sequences before touching direction, expiry or the pending bit.', item.explanation], source };
}
