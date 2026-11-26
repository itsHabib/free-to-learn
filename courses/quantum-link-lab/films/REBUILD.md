# Rebuild the lab films

**Can the fourth card win?** Pause when Alice and Bob both plan to answer zero. Try switching Alice’s answer on a one. The colored edges in the second diagram follow the three equalities that force the remaining pair to match. The final axes are Bloch-sphere directions in the X–Z plane for the entangled state Φ⁺. Individual outcomes are uniform and the quantum prediction is an expected win rate. [CHSH game derivation, IBM Quantum Learning](https://quantum.cloud.ibm.com/learning/en/courses/basics-of-quantum-information/entanglement-in-action/chsh-game)

**Which eighty percent?** Predict whether 8/10 or 196/245 wins are harder to obtain with a local plan. The histograms are computed binomial masses under an always-zero strategy and independent uniform settings. The two upper-tail sums are 0.52559 and 0.03908. The second tally comes from the published Delft experiment. The lab’s physical separation, timing and predeclared trial conditions are part of its evidence. The percentage is conditional on the model used for comparison. [Hensen et al., Nature (2015)](https://doi.org/10.1038/nature15759)

The MP4s contain H.264 video, AAC narration and a selectable English subtitle stream. Each has a companion WebVTT track, timestamped text transcript and a portrait poster. The drawings are original. A learner can play the files locally without installing any rendering software.

## Regenerate on macOS

From this directory, using Python 3 and the built-in American English formant voice in eSpeak NG 1.52.0:

```sh
brew install espeak-ng
python3 -m venv /tmp/quantum-film-tools
/tmp/quantum-film-tools/bin/python -m pip install Pillow==13.0.0 imageio-ffmpeg==0.8.1
/tmp/quantum-film-tools/bin/python -B build.py
```

`story.py` holds the narration and prediction pauses. `drawings.py` defines the card table, equality graph, measurement axes and count distributions. `build.py` runs eSpeak NG, generates captions from the duration of each spoken phrase, and encodes 720 × 900 video. To rebuild one film, append its slug to the last command. Rebuilding regenerates the corresponding captions, transcript and poster as well.


## Teleportation incident film

From this directory run `/tmp/quantum-film-tools/bin/python -B 04-phase-slip-build.py` with the environment described above. The script reads a separate calibration run from the Bell simulator, follows the receiver traces, patches a disposable learner copy, and renders its results. The video, poster, transcript and captions share the `04-phase-slip` stem.

## Narration credits

Free to Learn wrote the four scripts. eSpeak NG 1.52.0 synthesized the narration with its included `en-us` formant voice. The renderer calls the installed program to produce WAV files; it ships the resulting audio with the films. eSpeak’s maintainer describes the use of generated WAV files in products. [eSpeak NG](https://github.com/espeak-ng/espeak-ng) · [Maintainer’s explanation](https://sourceforge.net/p/espeak/discussion/538920/thread/c6944a60/)
