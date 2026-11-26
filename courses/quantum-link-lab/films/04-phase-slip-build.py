"""Run the course's real CLI and film its phase-error incident on macOS.

Use the film tools environment described in REBUILD.md, then run this file.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw
from build import FPS, FFMPEG, make_audio
from drawings import face
from story import FILMS

HERE = Path(__file__).resolve().parent
SLUG = "04-phase-slip"
W, H = 720, 900
PAPER, INK = "#F5F1E5", "#183630"
MUTED, LINE, TEAL, MINT = "#45635A", "#B9C4B8", "#005844", "#B6EACC"
RUST, BLUSH = "#8B382B", "#FAD1B9"
CUES = [
    ("health", "The pair source passes a Bell check on a separate batch of simulated pairs. The receiver also delivers zero and one perfectly. A user says their qubit changes on delivery. Could all three checks still be right?", 2.5),
    ("choose", "Alice and Bob share a fresh pair. Alice has a third qubit to send. You control its preparation and how the tester reads Bob's output. Would you repeat the zero test, or send plus and check for plus? Pause and choose.", 4),
    ("sweep", "Send plus. A healthy receiver returns plus every time when checked in the matching basis. This receiver returns plus only half the time. Open the trace. There are four equally likely messages Alice can send Bob.", 1),
    ("trace", "Follow message one zero. Its first bit tells Bob to correct the phase. Its second bit asks for no flip. Both bits arrive. The broken receiver applies no gate. The tester expects plus and reads minus on every delivery with this message.", .7),
    ("phase", "Here's what the zero and one tests missed. Plus has two components with the same sign. Minus has the same sizes but opposite signs. A zero or one measurement sees only the sizes. Measuring in the plus and minus basis detects the sign difference.", .8),
    ("repair", "Give the first bit its job back. When it is one, Bob applies Z, which changes the sign of the one component. Replay the same message and input. This time the output passes the plus check.", .7),
    ("tests", "Run all six inputs. The first two never exposed the bug. The other four move from half to all deliveries passing. Keep a test with both the plus input and the one zero message. If the phase correction disappears again, that test fails every time.", 1.0)
]
FILMS[SLUG] = ("The receiver that passes its tests", CUES)


def run_json(*args):
    data = subprocess.check_output([sys.executable, *args, "--json"], cwd=HERE.parent, text=True)
    return json.loads(data)


def record(folder):
    # Work on a fresh copy so making the film never overwrites a learner's repair.
    source = HERE.parent/"teleport"
    for name in ("bench.py", "protocol.py", "receiver.py"):
        shutil.copyfile(source/name, folder/name)
    receiver_file = folder/"receiver.py"
    correction = '    if phase:\n        commands.append("Z")\n'
    original = receiver_file.read_text()
    if original.count("    return tuple(commands)") != 1 or correction in original:
        raise ValueError("Rebuild from the unedited learner starter.")
    sample = run_json("lab.py", "simulate", "--model", "entangled", "--seed", "7")
    table = {}
    traces = {}
    for receiver in ("broken", "ideal"):
        if receiver == "ideal":
            receiver_file.write_text(original.replace("    return tuple(commands)", correction + "    return tuple(commands)"))
        result = run_json(str(folder/"bench.py"), "sweep", "--receiver", "learner")
        table[receiver] = {row["state"]: row["pass_probability"] for row in result["rows"]}
        for bits in ("00", "01", "10", "11"):
            traces[receiver, bits] = run_json(str(folder/"bench.py"), "trace", "--receiver", "learner",
                                              "--state", "plus", "--bits", bits)
    expected = {"zero": 1, "one": 1, "plus": .5, "minus": .5, "plus-i": .5, "minus-i": .5}
    for state, probability in expected.items():
        assert abs(table["broken"][state] - probability) < 1e-9
        assert abs(table["ideal"][state] - 1) < 1e-9
    assert traces["broken", "10"]["gates"] == []
    assert traces["ideal", "10"]["gates"] == ["Z"]
    for key, trace in traces.items():
        assert abs(trace["branch_probability"] - .25) < 1e-9
        probability = 1 if key[0] == "ideal" or key[1][0] == "0" else 0
        assert abs(trace["pass_probability"] - probability) < 1e-9
    return sample, table, traces


def label(d, xy, text, size=30, color=INK, style="body", anchor="lm"):
    d.text(xy, text, font=face(style, size), fill=color, anchor=anchor)


def box(d, coords, color=PAPER, outline=LINE):
    d.rounded_rectangle(coords, radius=12, fill=color, outline=outline, width=2)


def simple_row(d, y, title, result, tone=TEAL):
    d.line((48, y+36, 672, y+36), fill=LINE, width=2)
    label(d, (52, y), title, 34, INK)
    label(d, (662, y), result, 32, tone, "bold", "rm")


def note(d, title, subtitle):
    d.line((40, 690, 680, 690), fill=LINE, width=2)
    label(d, (42, 736), title, 30, TEAL, "bold")
    label(d, (42, 779), subtitle, 28, MUTED)


def feed_forward(d, bits, seconds):
    y = 248
    start, end = 202, 521
    label(d, (44, y), "ALICE", 25, MUTED, "code")
    label(d, (676, y), "BOB", 25, MUTED, "code", "rm")
    d.line((147, y, 573, y), fill=LINE, width=4)
    d.polygon(((587,y),(573,y-8),(573,y+8)), fill=MUTED)
    progress = min(1, max(0, (seconds - .3) / 1.7))
    position = round(start + (end - start) * progress)
    box(d, (position-36, y-22, position+36, y+22), TEAL, TEAL)
    label(d, (position, y), bits, 29, PAPER, "code", "mm")


def message(d, trace, y):
    for i, signal in enumerate(("phase", "flip")):
        x = 46 + i * 327
        box(d,(x, y, x+298, y+126), INK, INK)
        label(d, (x+20, y+30), signal.upper(), 24, MINT, "code")
        label(d, (x+149, y+83), str(trace[signal]), 55, PAPER, "code", "mm")


def phase_pair(d, xy, title, signs):
    x,y = xy
    box(d,(x,y,x+298,y+257))
    label(d, (x+149,y+43), title, 37, INK, "serif", "mm")
    d.line((x+30,y+139,x+268,y+139), fill=MUTED, width=3)
    for i,sign in enumerate(signs):
        mid = x+82+i*134
        end = y+139-57*sign
        d.rounded_rectangle((mid-24,min(end,y+139),mid+24,max(end,y+139)),5,fill=TEAL if sign>0 else RUST)
        label(d,(mid,y+218), "0" if i==0 else "1",27,MUTED,"code","mm")


def frame(scene, data, seconds=3):
    sample, table, traces = data
    img = Image.new("RGB", (W,H), PAPER)
    d = ImageDraw.Draw(img)
    label(d,(40,47),"FREE TO LEARN",23,TEAL,"code")
    label(d,(680,47),"QUANTUM LINK LAB",23,MUTED,"code","rm")
    d.line((40,84,680,84),fill=LINE,width=2)
    titles = {"health": "Can you trust the receiver?", "choose":"Choose your next probe",
              "sweep":"Open the plus trace", "trace":"Follow message 10",
              "phase":"Where the error hides", "repair":"Repair the receiver",
              "tests":"Keep the test that fails"}
    label(d,(40,142),titles[scene],46,INK,"serif")
    d.line((40,196,680,196),fill=LINE,width=2)
    if scene == "health":
        label(d,(48,250),f"PAIR SOURCE   /   {sample['trials']:,} SIMULATED PAIRS",23,TEAL,"code")
        simple_row(d,319,"Bell score",f"S = {sample['s']:.3f}")
        label(d,(48,416),"DELIVERY CHECK   /   NEW PAIRS",24,TEAL,"code")
        simple_row(d,486,"Send 0, verify 0",pct(table["broken"]["zero"]))
        simple_row(d,578,"Send 1, verify 1",pct(table["broken"]["one"]))
        note(d,"One user still reports a failure.","Which input would you try?")
    if scene == "choose":
        label(d,(44,246),"PREPARE",24,MUTED,"code")
        label(d,(450,246),"VERIFY",24,MUTED,"code")
        for i,(left,right) in enumerate((("0","0 or 1"),("plus","plus or minus"))):
            top = 285 + i*163
            box(d,(44,top,270,top+110))
            label(d,(157,top+55),left,42,TEAL,"serif","mm")
            d.line((287,top+54,412,top+54),fill=MUTED,width=5)
            d.polygon(((413,top+54),(397,top+44),(397,top+64)),fill=MUTED)
            label(d,(447,top+55),right,34,INK,"body")
        note(d,"Pause and choose.","Which test exercises a different property?")
    if scene == "sweep":
        simple_row(d,262,"Send plus, verify plus",pct(table["broken"]["plus"]),RUST)
        label(d,(45,365),"ALICE’S MESSAGE",23,MUTED,"code")
        label(d,(670,365),"PASS CHANCE",23,MUTED,"code","rm")
        for i,bits in enumerate(("00","01","10","11")):
            trace = traces["broken",bits]
            simple_row(d,425+i*60,bits,pct(trace["pass_probability"]),TEAL if trace["pass_probability"]>.5 else RUST)
        note(d,"Each message has a 1 in 4 chance.","The two failing messages both begin with 1.")
    if scene in ("trace","repair"):
        trace = traces["broken" if scene=="trace" else "ideal","10"]
        feed_forward(d, trace["bits"], seconds)
        message(d, trace, 283)
        op = ", ".join(trace["gates"]) or "none"
        if scene=="repair":
            box(d,(45,434,672,538),MINT,MINT)
            label(d,(62,466),"if phase:",30,INK,"code")
            label(d,(62,507),'    commands.append("Z")',30,INK,"code")
        else:
            simple_row(d,473,"Bob’s correction",op,RUST)
        measured = "plus" if trace["readout_probabilities"][0]>.99 else "minus"
        simple_row(d,566,"Bob reads",measured,TEAL if scene=="repair" else RUST)
        if scene=="trace":
            note(d,"Expected plus. Received minus.","Both bits arrived. The phase bit was ignored.")
        else:
            note(d,"When phase is 1, apply Z.","The same input and message now pass.")
    if scene == "phase":
        label(d,(44,247),"SIGNED COMPONENTS",24,TEAL,"code")
        phase_pair(d,(46,302),"Prepared plus",(+1,+1))
        phase_pair(d,(373,302),"Received minus",(+1,-1))
        label(d,(360,625),"Equal size, different relative sign.",31,INK,"bold","mm")
        note(d,"Z flips the sign of the 1 component.","The plus/minus basis reveals the difference.")
    if scene == "tests":
        label(d,(48,242),"INPUT",24,MUTED,"code")
        label(d,(455,242),"BEFORE",24,MUTED,"code","rm")
        label(d,(666,242),"AFTER",24,MUTED,"code","rm")
        for i,(key,name) in enumerate((("zero","0"),("one","1"),("plus","plus"),("minus","minus"),("plus-i","plus i"),("minus-i","minus i"))):
            y = 306+i*59
            label(d,(50,y),name,32,INK)
            label(d,(451,y),pct(table["broken"][key]),31,TEAL if i<2 else RUST,"bold","rm")
            label(d,(664,y),pct(table["ideal"][key]),31,TEAL,"bold","rm")
            d.line((48,y+26,670,y+26),fill=LINE,width=2)
        note(d,"Regression case: plus with message 10.","Keep this branch in your test suite.")
    return img


def pct(number):
    return f"{number:.0%}"


def main():
    with tempfile.TemporaryDirectory() as scratch:
        folder = Path(scratch)
        data = record(folder)
        audio, lengths = make_audio(folder, SLUG, os.getenv("FILM_VOICE", "en-us"))
        # Keep narration and its WebVTT cue boundaries together during authoring.
        out = folder / "film.mp4"
        args = [FFMPEG,"-y","-loglevel","error","-f","rawvideo","-pix_fmt","rgb24","-video_size",
                f"{W}x{H}","-framerate",str(FPS),"-i","-","-i",str(audio),"-i",str(HERE/f"{SLUG}.vtt"),
                "-map","0:v","-map","1:a","-map","2:s","-metadata:s:s:0","language=eng",
                "-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","-r","24",
                "-c:a","aac","-b:a","96k","-c:s","mov_text","-movflags","+faststart",str(out)]
        with subprocess.Popen(args,stdin=subprocess.PIPE) as encoder:
            for (scene,_,_),length in zip(CUES,lengths):
                still = frame(scene,data).tobytes()
                for i in range(length):
                    moving = scene in ("trace", "repair") and i <= 2*FPS
                    encoder.stdin.write(frame(scene,data,i/FPS).tobytes() if moving else still)
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError("Film encoder failed")
        shutil.copyfile(out, HERE / f"{SLUG}.mp4")
        frame("health",data).save(HERE/f"{SLUG}.jpg",quality=92,optimize=True)


if __name__ == "__main__":
    main()
