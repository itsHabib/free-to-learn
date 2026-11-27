// Lesson 01's practice items. Shape: see lessons/practice.mjs.
const q = (objective, prompt, answer, feedback, wrong = [], section = '') =>
  ({ objective, prompt, answer, feedback, wrong, section });
const w = (answer, feedback) => ({ answer, feedback });

export default {
  // ---------------------------------------------------------------- 01
  'p01a': [
    q('01', 'A movie\'s frames are the lines |.R.|, |...|, |.RJ| and |L..|. What input number does readMovie give for the third frame?',
      6,
      'Six. The third line holds right (2) and jump (4), and the bits add: 2 + 4 = 6.',
      [w(2, 'That is right alone. The third line holds jump as well, which adds 4.'),
       w(3, '3 is left (1) plus right (2). The third line holds right (2) and jump (4): 2 + 4 = 6.')],
      'A movie is one line per frame'),
    q('01', 'What input number does the line |L.J| stand for?',
      5,
      'Five: left is 1 and jump is 4.',
      [w(4, 'That is jump alone. The L in the first column adds 1.')],
      'A movie is one line per frame'),
  ],
  'p01b': [
    q('01', 'Predict: you put one idle frame, |...|, before the 24 lines of |.R.| in your room 0 movie. On which frame does Kettle reach the flag now?',
      25,
      'Frame 25. Kettle stands still on the idle frame, then moves exactly as before, one frame later.',
      [w(24, 'The idle frame is a frame of play like any other. Kettle stands still during it, so everything after it happens one frame later.'),
       w(26, 'One idle frame delays everything by exactly one frame. Kettle was standing still at the start, so there is no speed to lose.')],
      'Your first movie'),
    q('01', 'Predict: compare the game\'s RAM at the finish of the two movies, with and without the idle frame. Kettle stands in the same place at the same speed in both. Which of these differ: the frame counter, the random generator, both, or neither? Answer counter, generator, both or neither.',
      'both',
      'Both. The frame counter (address 0) reads 25 instead of 24, and the random generator, which advances once on every frame, idle ones included, has advanced once more: its bytes at addresses 11 and 12 differ. Module 7 uses that fact to change what the game draws at random.',
      [w('counter', 'The frame counter differs, but so does the random generator: it advances once on every frame, idle ones included.'),
       w('generator', 'The generator differs, but so does the frame counter: the movie with the idle frame finishes on frame 25, not 24.'),
       w('neither', 'Kettle is in the same place, but the frame counter is one higher, and the random generator has advanced once more.')],
      'Your first movie'),
  ],
  'r01-runs': [
    q('01', 'How many frames long is the run-length movie R*20 J R*3?',
      24,
      'Twenty-four: 20 frames of right, one of jump, three of right.',
      [w(23, 'J with no count is one frame. 20 + 1 + 3 = 24.')],
      'A new case: a run-length movie'),
    q('01', 'A 120-frame movie holds right for 80 frames, then alternates right-and-jump and right for 40 frames. How many runs does its run-length form need?',
      41,
      'Forty-one: one run for the first 80 frames, then a new run for each of the 40 frames that differ from the frame before. Run-length is short only when inputs repeat: the last 40 frames here change on every frame, so they need 40 runs for 40 frames.',
      [w(2, 'Each change of buttons starts a new run. The last 40 frames change on every frame, so each is a run of its own.'),
       w(81, 'The first 80 frames are all the same, so they make one run.')],
      'A new case: a run-length movie'),
  ],
};
