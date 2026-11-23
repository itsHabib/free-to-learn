# Build a world in one file

Early edition · nine lessons. First-time human learner and physical-phone trials are pending.

You build one HTML file, with no images, models, sound files, fonts or libraries, that grows an island coast
from the seed in its link and lets you fly through it on a phone. Each lesson adds one layer to your
`project/world.html`, and you can open the world after every lesson.

Watch the last ferry cross the reflection of the tide station. For the same opening offline, open `stages/world-09.html` in your browser and add `?seed=7` to the address. [Fly through the harbour](https://freetolearn.world/courses/one-file-world/island.html?seed=7)

Follow a lamp down to the wet boards in [lesson 6](lessons/06.md#look-closely-at-the-quay). In [lesson 9](lessons/09.md#frame-the-last-ferry), move the camera along the shore and find the moment when the ferry cuts across the light.

## What you need

- Node.js 22 or newer, for the lab and its checks. No packages, account or network.
- A browser with WebGL2 to fly through the world: a current Chrome, Firefox or Safari, on a computer or a phone.

## Start

Run every command from this folder. Read [lesson 1](lessons/01.md), then make your project by one of its
three routes; [lesson 2](lessons/02.md) and later lessons continue it:

```sh
node lab.mjs start project write      # type the lesson's functions yourself
node lab.mjs start project supplied   # start from the working functions and study them
node lab.mjs start project ai         # write a brief and have an agent fill the holes
```

Each later lesson makes the next file, `world-02.html` and so on, with `node lab.mjs next project N write` (or
`supplied`, or `ai`), which carries your earlier work in and never overwrites it.

`node lab.mjs help` lists every command. `node lab.mjs check project N` runs lesson N's checks in Node, with no
browser, and saves each attempt under `project/attempts/`. No command writes over your `world.html`.

## What is in this folder

- `lessons/`: the lessons and their figures.
- `stages/world-01.html` to `world-09.html`: the world after each lesson. `node lab.mjs recover project N`
  copies one into `project/recovery/` for comparison.
- `examples/`: small scripts and the outputs the lessons show.
- `checks/`: the lab's checks. `practice.json` holds the prediction questions and their answers; the lab asks
  them, so you need not read it.
