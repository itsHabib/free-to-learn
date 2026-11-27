// Lesson 07's practice items. Shape: see lessons/practice.mjs.
const q = (objective, prompt, answer, feedback, wrong = [], section = '') =>
  ({ objective, prompt, answer, feedback, wrong, section });
const w = (answer, feedback) => ({ answer, feedback });

export default {
  // ---------------------------------------------------------------- 07
  'p07a': [
    q('07', 'A plan rings the bell on its 7th frame. You put 5 idle frames before it. On which frame of the movie does the bell ring now?',
      12,
      'Frame 12. Kettle stands still through the idle frames, so everything in the plan happens 5 frames later. The generator advances on those 5 frames too, so the bell reads a different value when it rings.',
      [w(7, 'The idle frames are frames of the movie. The plan starts on frame 6 now, so its 7th frame is frame 12.'),
       w(2, 'The idle frames come before the plan, so they delay it rather than shorten it.')],
      'The bell and its four drops'),
    q('07', 'On a frame where Kettle jumps but doesn\'t touch the bell, how many times does the generator advance?',
      2,
      'Twice: once at the start of every frame, and once more for the jump. That extra advance is what lets jumps steer the drop.',
      [w(1, 'Every frame advances it once, and a jump advances it once more, on the same frame.'),
       w(3, 'The third advance happens only when the bell rings. A jump that misses the bell gives two.')],
      'The bell and its four drops'),
  ],
  'p07b': [
    q('07', 'Idle steering rang the bell with drop 3 on frame 12. Could a search over all the ways to start find a ring with drop 3 before frame 12?',
      true,
      'Yes: on frame 5. Jumps advance the generator as well as frames, so a start that jumps at the right moments reaches the right value sooner, without standing still.',
      [w(false, 'Idle frames are one way to change how often the generator has advanced. Jumps are another, and they cost less time. The search finds a ring with drop 3 on frame 5.')],
      'Steering with jumps, found by search'),
    q('07', 'With the block already in place from the start, the room takes 70 frames. Could any steered route finish in fewer than 70?',
      false,
      'No, in this room. A steered route differs from the block-in-place route only before the ring, while the block is missing. A missing block could help only a route that passes through its place, row 7 column 18, before the bell rings. Every steered route is under the bell at column 9 when it rings. The room has no belt, so Kettle never moves across faster than 1.5 px a frame, and going from under the bell to column 18 and back takes more than 80 frames, more than the 70 the whole route takes with the block in place. So no steered route here finishes in fewer than 70 frames, and the searched route takes 71.',
      [w(true, 'A steered route has to ring the bell first, and until then the block isn\'t there. A route that has the block from frame 0 can do everything a steered route can.')],
      'Steering with jumps, found by search'),
  ],
  'r07-jumps': [
    q('07', 'A version of Kettle whose generator advances only on jumps and when the bell rings. Would steering with idle frames before the plan still change the drop?',
      false,
      'No. An idle frame no longer advances the generator, so the bell reads the same value however long you wait. Only the number of jumps before the ring changes it, so steering by jumps still works.',
      [w(true, 'In this version idle frames don\'t touch the generator. Five idle frames or fifty, the value at the ring is the same.')],
      'A new case: a generator that advances only on jumps'),
    q('07', 'In that version, does the frame on which the bell rings make any difference to the drop?',
      false,
      'No. Only the number of advances matters, and now only jumps make them. Two routes with the same number of jumps before the ring get the same drop, whatever frame they ring on.',
      [w(true, 'Time no longer moves the generator. Count the jumps before the ring: that alone decides the drop.')],
      'A new case: a generator that advances only on jumps'),
  ],
};
