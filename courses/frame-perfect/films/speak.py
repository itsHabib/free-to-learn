"""Speaks the films' lines in Pip's voice, Kokoro af_heart, run locally (no network).

Called by films/build.mjs once per cut:  KOKORO_PYTHON films/speak.py KOKORO_DIR < job.json
job.json is {"voice": "af_heart", "speed": 1.0, "lines": [{"text": "...", "file": "/abs/path.wav"}, ...]}.
KOKORO_DIR holds kokoro.onnx and voices.bin (Kokoro-82M v1.0) and lib/ with the kokoro_onnx package.
Each line is written as 16-bit mono WAV at 24000 Hz, peak-normalised, with Kokoro's own padding trimmed to
40 ms either side so the measured length is the spoken length.
"""
import json, sys, wave
from pathlib import Path

tooling = Path(sys.argv[1])
sys.path.insert(0, str(tooling / "lib"))
import numpy as np
from kokoro_onnx import Kokoro

RATE, PAD = 24000, 0.04
job = json.load(sys.stdin)
model = Kokoro(str(tooling / "kokoro.onnx"), str(tooling / "voices.bin"))
for line in job["lines"]:
    data, rate = model.create(line["text"], voice=job["voice"], speed=job["speed"], lang="en-us")
    if rate != RATE:
        raise SystemExit(f"Kokoro returned {rate} Hz, expected {RATE}")
    if data.size == 0 or not np.any(data):
        raise SystemExit(f"Kokoro returned no speech for: {line['text']}")
    loud = np.flatnonzero(np.abs(data) > 0.01 * np.max(np.abs(data)))
    pad = round(PAD * RATE)
    data = data[max(0, loud[0] - pad): loud[-1] + pad]
    data = np.clip(data * (0.9 / np.max(np.abs(data))), -1, 1)
    with wave.open(line["file"], "wb") as w:
        w.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        w.writeframes((data * 32767).astype("<i2").tobytes())
    print(f"{len(data) / RATE:6.2f}s  {line['text'][:60]}", file=sys.stderr, flush=True)
