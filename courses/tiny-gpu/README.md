# Build a tiny GPU

Early edition · nine units, the last a capstone. AI agents have taken it from a learner copy; no human learner has yet.

You write a GPU in JavaScript. It takes a scene of triangles and makes a picture: it moves
the corners into place on the screen, decides exactly which pixels each triangle covers,
blends colours across the triangle, keeps the nearest surface in front, and runs shaders,
small programs that decide each pixel's colour, eight pixels at a time. Then you count how
much memory it reads and writes, and how many instructions it issues, and you make those
numbers smaller.

From unit 4 on, your pictures are also compared with the same scenes drawn by your own
browser's GPU through WebGL. Where WebGL's rules fix the answer, such as a pixel with no
edge near it, the two pictures should agree pixel for pixel. The lab shows you where they
differ.

## What you build

Nine units. Each one adds a part to the same project, `project/gpu/`:

| Unit | What it adds |
| --- | --- |
| 1. Edge functions and the fill rule | which pixels a triangle covers, and who owns a pixel that sits exactly on a shared edge |
| 2. From 3D to the screen | the camera, clipping at the near plane, and snapping corners to a grid of 1/16 pixel |
| 3. Perspective-correct interpolation and depth | colours that vary evenly over the 3D surface, and the nearest surface in front |
| 4. The browser's GPU as the oracle | comparing pictures, and textures |
| 5. A shader core | a small shader language, its assembler, and one pixel at a time |
| 6. Warps, masks and divergence | eight pixels per instruction |
| 7. Memory transactions, coalescing and a texture cache | what a warp's reads and writes cost, merged into as few 32-byte transactions as they can be |
| 8. Tiled rendering | the picture drawn one 16 by 16 tile at a time, with colour and depth held on chip |
| 9. Capstone | a scene you have not seen, under a budget for shading and memory |

In each unit you write the few functions that carry the idea, about 500 lines across the
course. In units 1 to 5 you type them from listings, from unit 6 some come as rules you
turn into code, and the capstone is all your own. The rest of the GPU is supplied, and each lesson tells you which supplied functions
to read.

## What you need

- Node.js 22 or newer. It runs the lab, every check and every picture. No packages,
  account or network.
- For the comparison page, a browser with WebGL2: a current Chrome, Firefox or Safari, on
  a computer or a phone.
- JavaScript you can write without help: functions, loops and typed arrays. You do not
  need any graphics background. The lessons explain vectors, matrices and the rest when
  they first come up, with a worked number.

## Start

Run every command from this folder. Make your project:

```sh
node lab.mjs start project
```

This copies the starter into `project/gpu/`. Every function you will write is there, and
each one throws "not written yet" until you write it. No command of the lab writes over
your code.

Then read lesson 1 and pick a route for unit 1:

```sh
node lab.mjs lesson 1
node lab.mjs next project 1 write
```

- `write`: type the unit's functions yourself, as the lesson shows them.
- `supplied`: start from working functions for this unit and study them. Earlier units
  must be written or supplied first. Units 1 to 8 offer it; the capstone does not.
- `ai`: write a brief and give it to an AI agent. `node lab.mjs brief 1` checks that the
  brief names the interface, the constraints and the check command.

Check your work, and draw the unit's picture:

```sh
node lab.mjs check 1
node lab.mjs view 1
```

`check` runs the unit's checks in Node and saves each attempt in `project/attempts/`. When
a check fails, it names the lesson section to read again. `view` writes a PNG into
`project/out/`.

From unit 4 on, compare your picture with your browser's (the command also works for unit 3):

```sh
node lab.mjs compare 4
```

It prints an address on `127.0.0.1`. Open it in your browser. The page draws the same
scene with WebGL, sends the pixels back, and the lab prints where the two pictures differ.

`node lab.mjs help` lists every command. `node lab.mjs status` shows your routes, what you
have written and your saved attempts.

## What is in this folder

- `lessons/`: the lessons. `node lab.mjs lesson N` reads one in the terminal. It stops at
  each question until you commit an answer with `node lab.mjs predict`.
- `starter/`: the project you start from, and the working functions the `supplied` route
  fills in.
- `scenes/`: the scenes the lab draws, and the shader programs from unit 5 on.
- `checks/`: the checks and the fixed numbers they compare with.
- `public/`: the comparison page.
- `practice.json`: the questions and their answers. The lab asks them, so you do not need
  to read it.
