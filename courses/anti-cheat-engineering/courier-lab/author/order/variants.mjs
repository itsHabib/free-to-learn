export const CORRECT_VARIANTS = ['baseline', 'alternate-correct'];
export const WRONG_VARIANTS = ['equal-seq-admitted', 'stale-admitted', 'stale-interact', 'expiry-T+3', 'expiry-T+5', 'read-renews', 'stale-finding'];

const alternate = `// Independent elapsed-time implementation; public expiry is still part of the contract.
export function admitInput(state, input, tick) {
  if (!(input.seq > state.lastSeq)) return { status: 'stale', next: { ...state } };
  const next = Object.assign({}, state);
  Object.assign(next, { move: input.move, lastSeen: tick, lastSeq: input.seq, expiresAt: tick + 4 });
  next.pendingInteract = Boolean(state.pendingInteract || input.interact);
  return { status: 'admitted', next };
}
export function movementActive(state, tick) {
  return state.lastSeq > 0 && tick - state.lastSeen <= 4;
}
`;

function wrapper(body) {
  return `import { admitInput as original, movementActive } from './reference-admission.mjs';\nexport { movementActive };\nexport function admitInput(state, input, tick) {\n${body}\n}\n`;
}

function inject(source, marker, code) {
  if (source.split(marker).length !== 2) throw new Error(`Expected one runtime marker: ${marker}`);
  return source.replace(marker, marker + '\n' + code);
}

/** These mutations exist only in owner-side runtime copies, never server flags. */
export function variantFiles(variant, referencePolicy, referenceEngine) {
  let policy = referencePolicy;
  let engine = referenceEngine;
  if (variant === 'alternate-correct') policy = alternate;
  if (variant === 'equal-seq-admitted') policy = wrapper(`  if (input.seq === state.lastSeq) return original({ ...state, lastSeq: input.seq - 1 }, input, tick);
  return original(state, input, tick);`);
  if (variant === 'stale-admitted') policy = wrapper(`  if (input.seq < state.lastSeq) return original({ ...state, lastSeq: input.seq - 1 }, input, tick);
  return original(state, input, tick);`);
  if (variant === 'stale-interact') policy = wrapper(`  const result = original(state, input, tick);
  if (result.status === 'stale') return { ...result, next: { ...result.next, pendingInteract: state.pendingInteract || input.interact } };
  return result;`);
  if (variant === 'expiry-T+3' || variant === 'expiry-T+5') policy = wrapper(`  const result = original(state, input, tick);
  if (result.status === 'admitted') result.next.expiresAt += ${variant === 'expiry-T+3' ? '-1' : '1'};
  return result;`);
  if (variant === 'read-renews') engine = inject(engine, '// ORDER_LAB_STATE_READ', '  actor.expiresAt = world.tick + 4;');
  if (variant === 'stale-finding') engine = inject(engine, '// ORDER_LAB_ADMISSION_RESULT', "  if (result.status === 'stale') observeDenial(actor.detector, world.tick, 'range', 250001);");
  if (![...CORRECT_VARIANTS, ...WRONG_VARIANTS, 'submitted-component'].includes(variant)) throw new Error(`Unknown assessment variant: ${variant}`);
  return { 'admission.mjs': Buffer.from(policy), 'engine.mjs': Buffer.from(engine), 'reference-admission.mjs': Buffer.from(referencePolicy) };
}
