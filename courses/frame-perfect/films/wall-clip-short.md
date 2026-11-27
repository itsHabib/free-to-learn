# Par 100. By design, 186. A search found 70. How?

Narration and on-screen text of `wall-clip-short.mp4`, built by `films/build.mjs` from `films/script.mjs`. The game, levels, recorded outputs and figure it shows are the course's as of commit `132b313e4cd8`.

**00:00**

Par for this level of Kettle is 100 frames.

Under the rules its makers meant, the fastest run takes 186.

A search found one that takes 70.

*On screen: All of level 2 of Kettle: Kettle and a belt at the left, platforms climbing to a tall wall, and the flag behind it.*

**00:11**

Here Kettle closes on the wall, slowing to five pixels a frame.

*On screen: Frames 64 to 66 of the 70-frame run beside x and vx from the game's memory.*

**00:15**

Does it stop, get pushed back, or go through?

*On screen: Frame 66 holds.*

**00:22**

Through.

A five-pixel move puts Kettle's front edge more than halfway into the 8-pixel wall, and the game pushes it out of the nearer side, the far one.

*On screen: Frame 67: x is 280 px, past the wall.*

**00:32**

Walking speed is one and a half pixels a frame. So how did it get to five?

In Frame Perfect you write the search that found this run, then read the game's code to see how.

*On screen: End card: "Frame Perfect", "A free course on Free to Learn" and freetolearn.world.*
