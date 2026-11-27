// The two cuts, as data: what is said, what is on screen, and how long a silent pause holds.
// films/build.mjs turns each segment into stills (films/stage.html), speech (Pip's voice, Kokoro af_heart), captions and a
// transcript. Every number on screen comes from the game or from a recorded output in examples/ at render
// time. The voice does not read out what a still already shows; captions carry every spoken line.
//   shot.kind: 'game' (a frame of a level), 'clip' (frames of the level 2 run with its watch table),
//   'terminal' (lines of a recorded output), 'code' (lines of game/core.mjs), 'card' (title and link).
export const COURSE_URL = 'freetolearn.world';

export const film = {
  name: 'wall-clip',
  title: 'Par is 100. A search finished in 70 frames. How did Kettle get through the wall?',
  width: 1280, height: 720, scale: 1, voice: { name: 'af_heart', speed: 1 },
  segments: [
    { shot: { kind: 'game', level: 'level2', frame: 0, label: 'Level 2 · par 100 frames' },
      say: ['Kettle is a small platformer built for the course Frame Perfect, named after the copper kettle you steer.',
        'A run is a file with one line of buttons for each frame, and the game plays that file back the same way every time.',
        'On level 2 the flag sits behind a tall wall, and the intended route climbs the platforms over it.',
        'Par is the frame count the level sets as its target.'],
      screen: 'Level 2 of Kettle, labelled "par 100 frames": a belt at the start, platforms climbing to the top of a tall wall, and the flag behind it.' },
    { shot: { kind: 'par', par: 100 },
      say: ['With the game working as its makers meant, the best run takes 186 frames.',
        'Could any run finish within par? Decide before the next result.'],
      pause: 5,
      screen: 'The words "par 100" fill the screen and hold for five seconds.' },
    { shot: { kind: 'terminal', cmd: 'node examples/06-level2.mjs ./work bfs', file: 'examples/06-bfs.txt', lines: [0], par: 100 },
      say: ['A breadth-first search assumes nothing about how the game should behave.',
        'It tries every input on every frame and merges runs that reach the same state.',
        'Its run is 116 frames shorter than the intended best, so something moves Kettle faster than its makers meant.'],
      screen: 'Recorded output: "breadth-first: 70 frames, 620,577 states expanded", beside "par 100".' },
    { shot: { kind: 'clip', frames: [62, 63, 64, 65, 66] },
      say: ['Here is that run near the wall, with position and speed read from the game\'s memory.',
        'Left presses on frames 64 and 66 each take half a pixel off the speed, which leaves the front edge just short of the wall on frame 66.'],
      screen: 'The 70-frame run steps from frame 62 to frame 66 beside its watch table: x rises from 244 to 266 px while vx falls from 6 to 5 px a frame, with left held on frames 64 and 66. The wall covers x 272 to 279.' },
    { shot: { kind: 'clip', frames: [66] },
      say: ['On the next frame, does it stop, get pushed back, or go through?'],
      pause: 5,
      screen: 'Frame 66 holds for five seconds.' },
    { shot: { kind: 'clip', frames: [67], highlight: 67 },
      say: ['It goes through.'],
      screen: 'Frame 67: x reads 280 px, the far side of the wall, and the row is highlighted.' },
    { shot: { kind: 'code', from: 130, to: 148, mark: [136, 137, 139, 141, 142], zoom: [141, 143], zoomSize: 30, parts: ['code', 'zoom', 'figure'], partAt: [0, 1, 2] },
      say: ['The game moves Kettle first, then tests only the edge it is moving toward.',
        'If that edge is inside a wall, the game pushes Kettle out on the nearer side.',
        'At walking speed the edge ends at most one and a half pixels in, so the nearer side is the one it came from.',
        'At five pixels the edge ends past the middle of the 8-pixel tile, and the nearer side is the far one.'],
      screen: 'The function moveX from game/core.mjs, lines 130 to 148, with the lines that find the edge, test it, measure its depth and choose the far side marked. Then lines 141 to 143 enlarged: farSide is true when the depth is more than half a tile. Then the lesson\'s wall-clip figure: at walking speed the front edge ends 1.5 px in and Kettle is pushed back; on frame 67 it ends 5 px in and comes out at x 280.' },
    { shot: { kind: 'code', from: 212, to: 227, mark: [215, 218], zoom: [215, 218], zoomSize: 27, table: 'examples/06-watch-speed.txt', parts: ['table', 'zoom'], partAt: [0, 1] },
      say: ['Near the start, a belt adds half a pixel a frame to walking speed, which makes two, and a jump made at that speed adds half a pixel more.',
        'The cap that holds Kettle to walking speed runs only on ground frames without a jump, so a jump on the frame Kettle lands keeps every boost.',
        'Eight of those jumps take it to six pixels a frame.'],
      screen: 'The recorded watch table for frames 9 to 20: vx goes from 1.5 to 2 px on the belt, then 2.5 and 3 px after jumps. Then lines 215 to 218 of step in game/core.mjs enlarged, with the boost line and the cap line marked.' },
    { shot: { kind: 'card', title: 'Frame Perfect', lines: ['A free course on Free to Learn', 'Eight lessons in JavaScript for Node'] },
      say: ['In Frame Perfect you write the search that found this run, and a minimiser that keeps only the presses the clip needs.',
        'The capstone is level 3, which you finish with your own tools and no lesson.'],
      screen: `End card: "Frame Perfect", "A free course on Free to Learn", "Eight lessons in JavaScript for Node" and ${COURSE_URL}.` },
  ],
};

export const short = {
  name: 'wall-clip-short',
  title: 'Par 100. By design, 186. A search found 70. How?',
  width: 540, height: 960, scale: 2, voice: { name: 'af_heart', speed: 1 }, burn: true,
  segments: [
    { shot: { kind: 'game', level: 'level2', frame: 0 },
      say: ['Par for this level of Kettle is 100 frames.', 'Under the rules its makers meant, the fastest run takes 186.', 'A search found one that takes 70.'],
      screen: 'All of level 2 of Kettle: Kettle and a belt at the left, platforms climbing to a tall wall, and the flag behind it.' },
    { shot: { kind: 'clip', frames: [64, 65, 66] },
      say: ['Here Kettle closes on the wall, slowing to five pixels a frame.'],
      screen: 'Frames 64 to 66 of the 70-frame run beside x and vx from the game\'s memory.' },
    { shot: { kind: 'clip', frames: [66] },
      say: ['Does it stop, get pushed back, or go through?'],
      pause: 4,
      screen: 'Frame 66 holds.' },
    { shot: { kind: 'clip', frames: [67], highlight: 67 },
      say: ['Through.', 'A five-pixel move puts Kettle\'s front edge more than halfway into the 8-pixel wall, and the game pushes it out of the nearer side, the far one.'],
      screen: 'Frame 67: x is 280 px, past the wall.' },
    { shot: { kind: 'card', title: 'Frame Perfect', lines: ['A free course on Free to Learn'] },
      say: ['Walking speed is one and a half pixels a frame. So how did it get to five?', 'In Frame Perfect you write the search that found this run, then read the game\'s code to see how.'],
      screen: `End card: "Frame Perfect", "A free course on Free to Learn" and ${COURSE_URL}.` },
  ],
};

export default { film, short };
