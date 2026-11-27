# How the Frame Perfect films are made

This folder holds two cuts, each with a `.vtt` caption file and a `.md` transcript:

- the episode `wall-clip.mp4`, 1280 × 720, with its thumbnail `wall-clip.jpg`;
- the Short `wall-clip-short.mp4`, 1080 × 1920, with captions drawn into the picture.

The transcripts name the course commit the pictures show. You can play the files without installing anything.

## The cuts can't be rebuilt from this copy

The build scripts are included so you can read how each picture is made. They need the author's reference run of level 2, the 70-frame movie in `reference/movies/level2.movie`. That run is lesson 6's answer, so the published course leaves out `reference/`, and `build.mjs`, `capture.mjs` and `check-bench.mjs` stop without it.

## What the build uses

- **Software:** Node 22 or newer, Google Chrome (set `CHROME` if it isn't at the macOS default path), eSpeak NG with its `en-us` voice (the cuts were made with 1.52.0), and ffmpeg. ffmpeg needs no subtitle or text filters, because captions are drawn into the stills.
- **Fonts:** `fonts/` holds Barlow and IBM Plex Mono, both under the SIL Open Font License 1.1. Nothing is downloaded.

From `courses/frame-perfect/`, with the reference run in place:

```sh
node films/capture.mjs
node films/build.mjs SCRATCH_DIR
```

- **`capture.mjs`** re-derives every number the cuts show or say, from the game, the reference run and the recorded outputs, and stops if any differs.
- **`build.mjs`** writes the cuts into `films/`. Add `film` or `short` to build one cut.
  - It starts a static server on 127.0.0.1 and one headless Chrome, closes both when it ends, and deletes its stills and audio once each cut is encoded.
  - On a shared machine, run one headless Chrome at a time.

## How the pictures are made

`stage.html?cut=film|short&seg=N&frame=I&cap=K` draws one still.

- **The game:** Kettle is drawn with `game/draw.mjs`, the movie player's own drawing code, from states replayed with `game/core.mjs`.
- **Tables:** watch tables come from `examples/06-watch*.txt`, read at render time and never retyped.
- **Search results:** the breadth-first result comes from `examples/06-bfs.txt`, read the same way.
- **Code:** listings come from `game/core.mjs`, read the same way.
- **Captions in the Short:** the build gives `cap`, the spoken line to draw into the still.

`script.mjs` holds every spoken line and on-screen note. `check-bench.mjs` tries `bench/` the same way, at 320 and 358 px.
