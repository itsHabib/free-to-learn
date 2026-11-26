"""Rebuild the worked terminal demonstration on macOS with Pillow and imageio-ffmpeg."""
import ast
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont
from build import FFMPEG, FPS, make_audio
from story import FILMS

HERE = Path(__file__).resolve().parent
COURSE = HERE.parent
SLUG = "03-scorekeeper"
W, H = 720, 900
INK, PANEL, PAPER = "#102B30", "#17373D", "#F8F1DD"
MINT, CORAL, MUTED = "#72E4BE", "#F48666", "#ACC1C1"
FONTS = Path("/System/Library/Fonts")
FONT = {name: ImageFont.truetype(str(FONTS / file), size) for name, file, size in [
    ("title", "Supplemental/Georgia.ttf", 48),
    ("label", "Supplemental/Arial Bold.ttf", 25),
    ("note", "Supplemental/Arial.ttf", 34),
    ("terminal", "Menlo.ttc", 30),
]}

CUES = [
    ("draft", "Open starter dot py and find wins. In a scratch copy, I'll replace the exception with my first guess. Give the players a point whenever their answers match. Which pair of settings breaks it?", 2.5),
    ("fail", "Run the Game check. Four cases fail. Here, both stations got a one, both answered zero, and our scorer gave them a point. The check expected a loss.", 0.6),
    ("fix", "Let's fix that case. If both settings are one, the answers have to differ. For every other setting, they have to match.", 0.6),
    ("pass", "Run the same check again. It passes. The one test tries all four settings against all four possible pairs of answers.", 0.5),
    ("rows", "Now use the finished reporter, lab dot py, to inspect a different run. These boxes always answered zero. Pause and count how many trials could possibly lose.", 2.5),
    ("score", "Only three. The boxes won ninety-seven times because the one-one setting hardly appeared. Each setting has the same correlation, plus one. Add the first three, subtract the last, and the Bell score is two, right at the classical bound.", 1.0),
]
FILMS[SLUG] = ("How did two zeroes win 97 times?", CUES)

GAME = ["python3", "-m", "unittest", "learner_checks.Game"]
REPLAY = ["python3", "lab.py", "replay", "fixtures/skewed-classical.csv"]


def run(folder, command, expected=0):
    args = [sys.executable, *command[1:]]
    result = subprocess.run(args, cwd=folder, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
    if result.returncode != expected:
        raise RuntimeError(result.stdout)
    return result.stdout


def write_wins(folder, body):
    path = folder / "starter.py"
    text = path.read_text()
    function = next(node for node in ast.parse(text).body
                    if isinstance(node, ast.FunctionDef) and node.name == "wins")
    lines = text.splitlines(keepends=True)
    lines[function.lineno:function.end_lineno] = [line + "\n" for line in body]
    path.write_text("".join(lines))
    # Each displayed code line comes from the edited copy on disk.
    return path.read_text().splitlines()[function.lineno - 1:function.lineno + len(body)]


def record(folder):
    for name in ["starter.py", "learner_checks.py", "lab.py"]:
        shutil.copyfile(COURSE / name, folder / name)
    draft = write_wins(folder, ["    return a == b"])
    failure = run(folder, GAME, expected=1)
    case = re.search(r"settings=\(1, 1\), outputs=\(0, 0\)", failure).group()
    assertion = next(line for line in failure.splitlines() if line.startswith("AssertionError:"))
    repair = write_wins(folder, ["    if x == 1 and y == 1:", "        return a != b", "    return a == b"])
    success = run(folder, GAME)
    output = run(COURSE, REPLAY).splitlines()
    if "FAILED (failures=4)" not in failure or "OK" not in success.splitlines():
        raise RuntimeError("The recorded learner checks have changed. Inspect the change before filming.")
    if len(output) < 8 or "97.0%" not in output[6] or "S = 2.000" not in output[6]:
        raise RuntimeError("The recording no longer shows the expected fixture. Review the worked example.")
    return {
        "draft": draft, "case": case, "assertion": assertion, "failed": failure.strip().splitlines()[-1],
        "repair": repair, "success": [s for s in success.splitlines() if s.startswith("Ran ") or s == "OK"],
        "rows": output[1:6], "score": output[6],
    }


def frame(scene, recording, seconds):
    picture = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(picture)
    d.text((34, 34), "FREE TO LEARN   /   QUANTUM LINK LAB", font=FONT["label"], fill=MINT)
    titles = {"draft": "Score a round", "fail": "A counterexample", "fix": "Repair the rule",
              "pass": "Run the same check", "rows": "Count the losing deals", "score": "Why did 97% look good?"}
    d.text((31, 90), titles[scene], font=FONT["title"], fill=PAPER)
    d.rounded_rectangle((23, 201, 697, 647), radius=17, fill=PANEL)
    is_code = scene in ("draft", "fix")
    label = "starter.py    /    wins" if is_code else "Terminal    /    captured output"
    d.text((43, 224), label, font=FONT["label"], fill=MUTED)
    d.line((42, 274, 677, 274), fill="#416064", width=2)
    def rows(items):
        for i, (line, color) in enumerate(items):
            if d.textlength(line, font=FONT["terminal"]) > 642:
                raise ValueError("Terminal line exceeds screen width: " + line)
            d.text((40, 303 + i * 44), line, font=FONT["terminal"], fill=color)
    game_cmd = [("$ python3 -m unittest " + chr(92), PAPER), ("    learner_checks.Game", PAPER)]
    replay_cmd = [("$ python3 lab.py replay " + chr(92), PAPER), ("    fixtures/skewed-classical.csv", PAPER)]
    if is_code:
        code = recording["draft" if scene == "draft" else "repair"]
        source = "\n".join(code[1:])
        typed = min(len(source), int(max(0, seconds - 0.45) * 30))
        lines = source[:typed].split("\n")
        if typed < len(source):
            lines[-1] += "▏"
        rows([(code[0], PAPER)] + [(line, CORAL if scene == "draft" else MINT) for line in lines])
    if scene == "fail":
        rows(game_cmd + [("", PAPER), (recording["case"], CORAL), (recording["assertion"], PAPER),
                         ("", PAPER), (recording["failed"], CORAL)])
    if scene == "pass":
        rows(game_cmd + [("", PAPER)] + [(s, MINT) for s in recording["success"]])
    if scene == "rows":
        rows(replay_cmd + [(s, CORAL if s.startswith("11") else PAPER) for s in recording["rows"]])
    if scene == "score":
        rows([(s, CORAL if s.startswith("11") else PAPER) for s in recording["rows"]] +
             [("", PAPER), (recording["score"], MINT)])
    captions = {
        "draft": ("PREDICT", ["Two matching answers.", "Do they always win a point?"]),
        "fail": ("OFFENDING ROUND", ["Settings 11 require different answers.", "Our first rule rewards two zeroes."]),
        "fix": ("WORKED REPAIR", ["x, y  = the settings", "a, b  = the players’ answers"]),
        "pass": ("WHAT PASSED?", ["4 setting pairs × 4 answer pairs", "= 16 cases checked"]),
        "rows": ("PREDICT", ["Both boxes answer zero every time.", "How many trials can they lose?"]),
        "score": ("BELL SCORE", ["S = 1 + 1 + 1 − 1 = 2", "Each setting contributes once."]),
    }
    label, notes = captions[scene]
    d.text((35, 699), label, fill=MINT, font=FONT["label"])
    for i, line in enumerate(notes):
        d.text((34, 752 + i * 53), line, fill=PAPER, font=FONT["note"])
    # A terminal cursor indicates playback without moving the text while the learner reads.
    if scene == "pass" and int(seconds * 1.5) % 2 == 0:
        d.rectangle((42, 557, 57, 581), fill=MINT)
    return picture


def main():
    with tempfile.TemporaryDirectory() as scratch:
        folder = Path(scratch)
        recording = record(folder)
        audio, lengths = make_audio(folder, SLUG, os.getenv("FILM_VOICE", "en-us"))
        out = folder / "film.mp4"
        args = [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                "-video_size", f"{W}x{H}", "-framerate", str(FPS), "-i", "-", "-i", str(audio),
                "-i", str(HERE / f"{SLUG}.vtt"), "-map", "0:v", "-map", "1:a", "-map", "2:s",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "24",
                "-c:a", "aac", "-b:a", "96k", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
                "-movflags", "+faststart", str(out)]
        with subprocess.Popen(args, stdin=subprocess.PIPE) as encoder:
            for (scene, _, _), count in zip(CUES, lengths):
                still = frame(scene, recording, 0).tobytes()
                for index in range(count):
                    animated = scene in ("draft", "fix", "pass")
                    encoder.stdin.write(frame(scene, recording, index / FPS).tobytes() if animated else still)
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError("Film encoder failed")
        shutil.copyfile(out, HERE / f"{SLUG}.mp4")
        frame("rows", recording, 0).save(HERE / f"{SLUG}.jpg", quality=91)


if __name__ == "__main__":
    main()
