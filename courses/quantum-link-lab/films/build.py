"""Render the two narrated, captioned films. Requires macOS, Pillow and imageio-ffmpeg."""
import argparse
import array
import math
import os
import re
from pathlib import Path
import subprocess
import tempfile
import textwrap
import wave

import imageio_ffmpeg

from story import FILMS

HERE = Path(__file__).resolve().parent
FPS = 8
RATE = 22050
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def run(args):
    subprocess.run(args, check=True)


def timestamp(seconds):
    millis = round(seconds * 1000)
    mins, millis = divmod(millis, 60000)
    secs, millis = divmod(millis, 1000)
    return f"00:{mins:02}:{secs:02}.{millis:03}"


def caption_phrases(sentence):
    """Keep each caption at one or two phone-size lines and time it to its own audio."""
    phrases = []
    for phrase in re.split(r"(?<=[.!?])\s+", sentence):
        while len(textwrap.wrap(phrase, 41)) > 2:
            marks = [m.end() for m in re.finditer(r",| and | when | without | how | each | to | with | at ", phrase)
                     if 25 < m.end() < 73]
            stop = marks[-1] if marks else phrase.rfind(" ", 25, 70)
            # Keep a conjunction or preposition with the clause it introduces.
            if marks and phrase[stop-1] == " ":
                stop = phrase.rfind(" ", 0, stop-1) + 1
            phrases.append(phrase[:stop].strip())
            phrase = phrase[stop:].strip()
        phrases.append(phrase)
    return phrases


def make_audio(folder, slug, voice):
    title, script = FILMS[slug]
    output = folder / "voice.wav"
    lines = ["WEBVTT", ""]
    transcript = [f"# {title}", ""]
    lengths = []
    with wave.open(str(output), "wb") as soundtrack:
        soundtrack.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        frame = 0
        for i, (scene, sentence, pause) in enumerate(script):
            begin_seconds = frame / FPS
            spoken_seconds = 0.0
            for j, phrase in enumerate(caption_phrases(sentence)):
                speech = folder / f"{i:02}-{j:02}.wav"
                run(["espeak-ng", "-v", voice, "-s", "163", "-w", str(speech), "--", phrase])
                pcm = subprocess.check_output([FFMPEG, "-loglevel", "error", "-i", str(speech),
                                               "-ar", str(RATE), "-ac", "1", "-f", "s16le", "-"])
                samples = array.array("h", pcm)
                if not samples or max(map(abs, samples)) < 400:
                    raise RuntimeError(f"No audible speech in {scene}")
                begin = begin_seconds + spoken_seconds
                spoken_seconds += len(samples) / RATE
                end = begin_seconds + spoken_seconds
                lines += [f"{timestamp(begin)} --> {timestamp(end)}", *textwrap.wrap(phrase, 41), ""]
                soundtrack.writeframes(pcm)
            count = math.ceil((spoken_seconds + pause) * FPS)
            lengths.append(count)
            at = int(begin_seconds)
            transcript += [f"**{at//60}:{at%60:02}** {sentence}", ""]
            frame += count
            remaining = round(frame / FPS * RATE) - soundtrack.tell()
            soundtrack.writeframes(b"\x00\x00" * remaining)
    (HERE / f"{slug}.vtt").write_text("\n".join(lines).rstrip() + "\n")
    (HERE / f"{slug}.md").write_text("\n".join(transcript))
    return output, lengths


def render(slug, voice):
    from drawings import frame_image, WIDTH, HEIGHT
    script = FILMS[slug][1]
    poster_scene, poster_name = {"01-fourth-card": ("guess", "01-public.jpg"),
                                 "02-196-wins": ("compare", "02-public.jpg")}[slug]
    frame_image(poster_scene, 2).save(HERE / poster_name, quality=92, optimize=True)
    with tempfile.TemporaryDirectory() as temp:
        folder = Path(temp)
        audio, lengths = make_audio(folder, slug, voice)
        output = folder / "film.mp4"
        args = [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pixel_format", "rgb24",
                "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS), "-i", "-",
                "-i", str(audio), "-i", str(HERE / f"{slug}.vtt"),
                "-map", "0:v", "-map", "1:a", "-map", "2:s", "-metadata:s:s:0", "language=eng",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                "-r", "24", "-c:a", "aac", "-b:a", "96k", "-c:s", "mov_text",
                "-movflags", "+faststart", str(output)]
        with subprocess.Popen(args, stdin=subprocess.PIPE) as encoder:
            for (scene, _, _), length in zip(script, lengths):
                for i in range(length):
                    picture = frame_image(scene, i / FPS)
                    encoder.stdin.write(picture.tobytes())
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError(f"Video encoder failed for {slug}")
        # Rename via the destination filesystem even when temp is on another volume.
        import shutil
        shutil.copyfile(output, HERE / f"{slug}.mp4")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("films", nargs="*", help="film slugs; defaults to both")
    parser.add_argument("--voice", default=os.environ.get("FILM_VOICE", "en-us"))
    options = parser.parse_args()
    for slug in options.films or FILMS:
        if slug not in FILMS:
            parser.error(f"unknown film: {slug}")
        render(slug, options.voice)
