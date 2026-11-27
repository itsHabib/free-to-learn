# Par is 100. A search finished in 70 frames. How did Kettle get through the wall?

Narration and on-screen text of `wall-clip.mp4`, built by `films/build.mjs` from `films/script.mjs`. The game, levels, recorded outputs and figure it shows are the course's as of commit `706e3fce0ffc`.

**00:00**

Kettle is a small platformer built for the course Frame Perfect, named after the copper kettle you steer.

A run is a file with one line of buttons for each frame, and the game plays that file back the same way every time.

On level 2 the flag sits behind a tall wall, and the intended route climbs the platforms over it.

Par is the frame count the level sets as its target.

*On screen: Level 2 of Kettle, labelled "par 100 frames": a belt at the start, platforms climbing to the top of a tall wall, and the flag behind it.*

**00:25**

With the game working as its makers meant, the best run takes 186 frames.

Could any run finish within par? Decide before the next result.

*On screen: The words "par 100" fill the screen and hold for five seconds.*

**00:42**

A breadth-first search assumes nothing about how the game should behave.

It tries every input on every frame and merges runs that reach the same state.

Its run is 116 frames shorter than the intended best, so something moves Kettle faster than its makers meant.

*On screen: Recorded output: "breadth-first: 70 frames, 620,577 states expanded", beside "par 100".*

**01:01**

Here is that run near the wall, with position and speed read from the game's memory.

Left presses on frames 64 and 66 each take half a pixel off the speed, which leaves the front edge just short of the wall on frame 66.

*On screen: The 70-frame run steps from frame 62 to frame 66 beside its watch table: x rises from 244 to 266 px while vx falls from 6 to 5 px a frame, with left held on frames 64 and 66. The wall covers x 272 to 279.*

**01:17**

On the next frame, does it stop, get pushed back, or go through?

*On screen: Frame 66 holds for five seconds.*

**01:28**

It goes through.

*On screen: Frame 67: x reads 280 px, the far side of the wall, and the row is highlighted.*

**01:30**

The game moves Kettle first, then tests only the edge it is moving toward.

If that edge is inside a wall, the game pushes Kettle out on the nearer side.

At walking speed the edge ends at most one and a half pixels in, so the nearer side is the one it came from.

At five pixels the edge ends past the middle of the 8-pixel tile, and the nearer side is the far one.

*On screen: The function moveX from game/core.mjs, lines 130 to 148, with the lines that find the edge, test it, measure its depth and choose the far side marked. Then lines 141 to 143 enlarged: farSide is true when the depth is more than half a tile. Then the lesson's wall-clip figure: at walking speed the front edge ends 1.5 px in and Kettle is pushed back; on frame 67 it ends 5 px in and comes out at x 280.*

**01:54**

Near the start, a belt adds half a pixel a frame to walking speed, which makes two, and a jump made at that speed adds half a pixel more.

The cap that holds Kettle to walking speed runs only on ground frames without a jump, so a jump on the frame Kettle lands keeps every boost.

Eight of those jumps take it to six pixels a frame.

*On screen: The recorded watch table for frames 9 to 20: vx goes from 1.5 to 2 px on the belt, then 2.5 and 3 px after jumps. Then lines 215 to 218 of step in game/core.mjs enlarged, with the boost line and the cap line marked.*

**02:17**

In Frame Perfect you write the search that found this run, and a minimiser that keeps only the presses the clip needs.

The capstone is level 3, which you finish with your own tools and no lesson.

*On screen: End card: "Frame Perfect", "A free course on Free to Learn", "Eight lessons in JavaScript for Node" and freetolearn.world.*
