// Unit 6: warps. Eight lanes (a 4x2 block of pixels) share one
// program counter. Each instruction is issued once for the whole warp
// and runs on the lanes whose bit is set in the active mask.
import { loadLane, read, step } from './shader.mjs';

export const LANES = 8;

// region: laneOf
// The lane of pixel (x, y) in the warp whose block starts at (x0, y0).
export function laneOf(x, y, x0, y0) {
  return (y - y0) * 4 + (x - x0);
}
// endregion: laneOf

// region: lanesWhere
// The active lanes (bits of mask) where operand a is not zero.
export function lanesWhere(lanes, mask, a) {
  let bits = 0;
  for (let k = 0; k < LANES; k++) {
    if (mask & (1 << k) && read(lanes[k], a) !== 0) bits |= 1 << k;
  }
  return bits;
}
// endregion: lanesWhere

// A loop that turns this many times has a break that never fires.
export const MAX_TRIPS = 100_000;

// region: runWarp
export function runWarp(program, lanes, mask, env, opts = {}) {
  throw new Error('runWarp: not written yet');
}
// endregion: runWarp

// region: onIf
export function onIf(st, ins, lanes, opts) {
  throw new Error('onIf: not written yet');
}
// endregion: onIf

// region: onElse
export function onElse(st, ins, lanes, opts) {
  throw new Error('onElse: not written yet');
}
// endregion: onElse

// region: onEndif
export function onEndif(st) {
  throw new Error('onEndif: not written yet');
}
// endregion: onEndif

// region: onLoop
export function onLoop(st) {
  st.stack.push({ kind: 'loop', saved: st.mask, trips: 0 });
  return { pc: st.pc + 1, mask: st.mask, stack: st.stack };
}
// endregion: onLoop

// region: onBreak
// Lanes where the operand is not zero leave the loop: they drop out of
// the mask and out of every if entry opened inside the loop, so no
// endif or else brings them back. When no lane is left in the loop
// (and skipping), drop those if entries and go to the endloop.
export function onBreak(st, ins, lanes, opts) {
  const leaving = lanesWhere(lanes, st.mask, ins.args[0]);
  const mask = st.mask & ~leaving;
  let i = st.stack.length - 1;
  let alive = mask;
  for (; st.stack[i].kind !== 'loop'; i--) {
    st.stack[i].saved &= ~leaving;
    alive |= st.stack[i].saved;
  }
  if (alive === 0 && opts.skip !== false) {
    st.stack.length = i + 1;
    return { pc: ins.match.end, mask: 0, stack: st.stack };
  }
  return { pc: st.pc + 1, mask, stack: st.stack };
}
// endregion: onBreak

// region: onEndloop
// Lanes still active go round again. With none left, pop the loop and
// bring back the lanes that entered it.
export function onEndloop(st, ins) {
  const top = st.stack.at(-1);
  if (st.mask !== 0) {
    top.trips += 1;
    if (top.trips > MAX_TRIPS) {
      throw new Error(`loop at ${ins.match.start}: over ${MAX_TRIPS} ` +
        'trips: a break never fires');
    }
    return { pc: ins.match.start + 1, mask: st.mask, stack: st.stack };
  }
  st.stack.pop();
  return { pc: st.pc + 1, mask: top.saved, stack: st.stack };
}
// endregion: onEndloop

// region: HANDLERS
export const HANDLERS = {
  if: onIf, else: onElse, endif: onEndif,
  loop: onLoop, break: onBreak, endloop: onEndloop,
};
// endregion: HANDLERS

// region: loadWarp
// Eight lanes for one 4x2 block. attrsOf(k) gives lane k's
// interpolated attributes in ATTRS order, or null for a lane with no
// fragment (its registers stay zero; leave its bit out of the mask).
export function loadWarp(program, attrsOf) {
  const lanes = [];
  for (let k = 0; k < LANES; k++) {
    const attrs = attrsOf(k);
    lanes.push(attrs ? loadLane(program, attrs)
      : { r: new Float32Array(16), out: null });
  }
  return lanes;
}
// endregion: loadWarp
