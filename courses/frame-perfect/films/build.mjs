// Builds the Frame Perfect films from films/script.mjs: speech with eSpeak NG, stills from films/stage.html in
// headless Chrome, captions, a transcript, then one MP4 per cut with the system ffmpeg.
//   node films/build.mjs SCRATCH_DIR [film|short ...]
// Needs: Node 22+, Google Chrome, espeak-ng with the en-us voice, ffmpeg. Writes into films/:
//   NAME.mp4, NAME.vtt, NAME.md for each cut, and wall-clip.jpg (the thumbnail). Deletes its stills when done.
// On a shared machine take the Chrome lock around it (see films/REBUILD.md).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import script from './script.mjs';
import { serve, launch } from './browser.mjs';

const films = dirname(fileURLToPath(import.meta.url));
const course = resolve(films, '..');
const scratch = resolve(process.argv[2] ?? join(course, '.scratch', 'film'));
const which = process.argv.slice(3).length ? process.argv.slice(3) : ['film', 'short'];
const LEAD = 0.5, GAP = 0.35, TAIL = 0.7, END_HOLD = 1.6, RATE = 22050;

// ---------------------------------------------------------------- speech
function speak(text, voice, file) {
  execFileSync('espeak-ng', ['-v', 'en-us', '-s', String(voice.speed), '-p', String(voice.pitch), '-w', file, '--', text]);
  const buf = readFileSync(file);
  // A WAV from espeak-ng: find the "data" chunk; 16-bit mono at 22050 Hz.
  if (buf.readUInt16LE(22) !== 1 || buf.readUInt32LE(24) !== RATE || buf.readUInt16LE(34) !== 16) throw new Error(`unexpected WAV format from espeak-ng: ${file}`);
  let at = 12;
  while (buf.toString('ascii', at, at + 4) !== 'data') at += 8 + buf.readUInt32LE(at + 4);
  const size = Math.min(buf.readUInt32LE(at + 4), buf.length - at - 8);
  return new Int16Array(buf.buffer.slice(buf.byteOffset + at + 8, buf.byteOffset + at + 8 + size));
}

function wav(samples) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples.length * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(RATE, 24); out.writeUInt32LE(RATE * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 2, 40);
  Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2).copy(out, 44);
  return out;
}

// ---------------------------------------------------------------- timeline
function timeline(cut, dir) {
  let t = LEAD;
  const lines = [], segs = [];
  cut.segments.forEach((seg, si) => {
    const start = t;
    seg.say.forEach((text, k) => {
      const audio = speak(text, cut.voice, join(dir, `say-${si}-${k}.wav`));
      const dur = audio.length / RATE;
      lines.push({ si, k, text, start: t, end: t + dur, audio });
      t += dur + GAP;
    });
    t += (seg.pause ?? 0) + TAIL - GAP;
    if (si === cut.segments.length - 1) t += END_HOLD;
    segs.push({ si, start: si === 0 ? 0 : start, end: t }); // the picture starts at 0, before the first line
  });
  // A caption stays up until the next line starts, so a question stays on screen through its pause.
  lines.forEach((l, i) => { l.capEnd = i + 1 < lines.length && lines[i + 1].si === l.si ? lines[i + 1].start - 0.05 : segs[l.si].end - 0.05; });
  return { lines, segs, duration: t };
}

// Pieces of picture: a new still whenever the clip frame or the burned caption changes.
function pieces(cut, tl) {
  const out = [];
  for (const s of tl.segs) {
    const seg = cut.segments[s.si];
    const segLines = tl.lines.filter((x) => x.si === s.si);
    const n = seg.shot.frames?.length ?? seg.shot.parts?.length ?? 1;
    // A clip's frames step during its first spoken line and the last one holds; parts start at the lines named in partAt.
    const firstEnd = segLines.length > 1 ? segLines[1].start : s.end;
    const starts = seg.shot.partAt ? seg.shot.partAt.map((k, i) => (i === 0 ? s.start : segLines[k].start)) : Array.from({ length: n }, (_, i) => s.start + ((firstEnd - s.start) * i) / n);
    const cuts = new Set([...starts, s.end]);
    if (cut.burn) for (const l of segLines) if (l.start > s.start) cuts.add(l.start);
    const times = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < times.length; i++) {
      const mid = (times[i] + times[i + 1]) / 2;
      const frame = starts.filter((st) => st <= mid).length - 1;
      const line = tl.lines.filter((x) => x.si === s.si && x.start <= mid).at(-1);
      out.push({ si: s.si, frame, cap: cut.burn && line ? line.k : -1, start: times[i], end: times[i + 1] });
    }
  }
  return out;
}

// ---------------------------------------------------------------- text outputs
const stamp = (t, ms = true) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return ms ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}` : `${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}`;
};
function wrap(text, width) {
  if (text.length <= width) return text;
  const words = text.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const score = Math.max(a.length, b.length);
    if (!best || score < best.score) best = { score, text: `${a}\n${b}` };
  }
  return best.text;
}
function vtt(tl) {
  return 'WEBVTT\n\n' + tl.lines.map((l) => `${stamp(l.start)} --> ${stamp(l.capEnd)}\n${wrap(l.text, 42)}\n`).join('\n');
}
function transcript(cut, tl, title, commit) {
  const out = [`# ${title}`, '', `Narration and on-screen text of \`${cut.name}.mp4\`, built by \`films/build.mjs\` from \`films/script.mjs\`. The game, levels, recorded outputs and figure it shows are the course's as of commit \`${commit}\`.`, ''];
  for (const s of tl.segs) {
    const seg = cut.segments[s.si];
    out.push(`**${stamp(s.start, false)}**`, '', ...seg.say.flatMap((line) => [line, '']), `*On screen: ${seg.screen}*`, '');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- build
// The last commit to change anything the films show: the game, its levels, the recorded outputs, the reference
// level 2 run and the lesson figures. Edits to the films' own tooling do not move it.
const SHOWN = ['game/core.mjs', 'game/levels', 'game/fixtures.mjs', 'examples', 'reference/movies/level2.movie', 'lessons/figures', 'lessons/06.md'];
const commit = execFileSync('git', ['-C', course, 'log', '-1', '--format=%h', '--abbrev=12', '--', ...SHOWN], { encoding: 'utf8' }).trim();
mkdirSync(scratch, { recursive: true });
const server = await serve(course);
const page = await launch(scratch);
const report = [];
try {
  for (const key of which) {
    const cut = script[key];
    const dir = join(scratch, cut.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const tl = timeline(cut, dir);
    const ps = pieces(cut, tl);
    // Stills: each distinct (segment, frame, caption) once.
    await page.size(cut.width, cut.height, cut.scale);
    const stills = new Map();
    for (const p of ps) {
      const id = `${p.si}-${p.frame}-${p.cap}`;
      if (stills.has(id)) continue;
      await page.goto(`${server.url}/films/stage.html?cut=${key}&seg=${p.si}&frame=${p.frame}&cap=${p.cap}`);
      for (let i = 0; i < 100 && !(await page.eval('window.__ready === true')); i++) await new Promise((r) => setTimeout(r, 50));
      const err = await page.eval('window.__error || null');
      if (err) throw new Error(`stage ${id}: ${err}`);
      const file = join(dir, `still-${id}.png`);
      writeFileSync(file, await page.shot());
      stills.set(id, file);
    }
    if (page.errors.length) throw new Error(`stage errors: ${page.errors.join(' / ')}`);
    // Audio: every line at its start time in one track.
    const mix = new Int16Array(Math.ceil(tl.duration * RATE));
    for (const l of tl.lines) mix.set(l.audio.subarray(0, Math.max(0, mix.length - Math.round(l.start * RATE))), Math.round(l.start * RATE));
    writeFileSync(join(dir, 'mix.wav'), wav(mix));
    // Picture: the stills with their durations, for ffmpeg's concat reader.
    const list = ps.map((p) => `file '${stills.get(`${p.si}-${p.frame}-${p.cap}`)}'\nduration ${(p.end - p.start).toFixed(4)}`).join('\n');
    writeFileSync(join(dir, 'frames.txt'), `${list}\nfile '${stills.get(`${ps.at(-1).si}-${ps.at(-1).frame}-${ps.at(-1).cap}`)}'\n`);
    const title = cut.title;
    writeFileSync(join(films, `${cut.name}.vtt`), vtt(tl));
    writeFileSync(join(films, `${cut.name}.md`), transcript(cut, tl, title, commit));
    const fps = cut.burn ? 24 : 25;
    const mp4 = join(films, `${cut.name}.mp4`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt'),
      '-i', join(dir, 'mix.wav'), '-i', join(films, `${cut.name}.vtt`), '-map', '0:v:0', '-map', '1:a:0', '-map', '2:s:0',
      '-vf', `fps=${fps},scale=${cut.width * cut.scale}:${cut.height * cut.scale}:flags=lanczos,format=yuv420p`, '-t', tl.duration.toFixed(3),
      '-c:v', 'libx264', '-preset', 'slow', '-tune', 'stillimage', '-crf', cut.burn ? '24' : '25', '-pix_fmt', 'yuv420p',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', '48000', '-c:a', 'aac', '-b:a', '96k',
      '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-disposition:s:0', '0', '-movflags', '+faststart', mp4]);
    if (key === 'film') {
      const reveal = ps.find((p) => cut.segments[p.si].shot.highlight);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', stills.get(`${reveal.si}-${reveal.frame}-${reveal.cap}`), '-q:v', '3', join(films, 'wall-clip.jpg')]);
    }
    report.push(`${cut.name}: ${tl.duration.toFixed(1)} s, ${tl.lines.length} lines, ${stills.size} stills, ${(readFileSync(mp4).length / 1e6).toFixed(2)} MB`);
    rmSync(dir, { recursive: true, force: true });
  }
} finally {
  await page.close();
  await server.close();
}
console.log(report.join('\n'));
