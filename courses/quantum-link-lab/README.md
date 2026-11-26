# Quantum Link Lab

Open [the experiment](index.html) and change Bob's answer for input 1. The loss moves to another card. Can you find a shared rulebook that wins all four? The course turns that puzzle into a Python reporter for a real physics experiment.

## Start here

Clone the public learner repository, then run the commands in this guide from the course folder.

```sh
git clone --depth 1 https://github.com/itsHabib/free-to-learn.git
cd free-to-learn/courses/quantum-link-lab
```

This course uses Python 3.10+ and the standard library. Open `index.html` directly or run `python3 -m http.server 8080 --bind 127.0.0.1` from this directory and visit `http://127.0.0.1:8080/`. All films and lessons are included. Serving the files also enables browser caption tracks in browsers with local-file restrictions. For seeking inside films, open the videos directly from disk, or use a server with HTTP range support. On a Mac with Ruby and WEBrick installed, run `ruby -run -e httpd . -b 127.0.0.1 -p 8080` from this folder.

```sh
python3 lab.py demo
python3 -m unittest test_lab
```

Open [the build-along](reader/lesson.html) and edit `starter.py`. The first checkpoint is `python3 -m unittest learner_checks.Game`. Beginners can use the worked lines as hints, or inspect the [reference](lab.py). After all three checkpoints, the reporter reads compatible CSVs and emits human-readable or JSON results. Ordinary tests check the supplied program; learner checks run against the file you edit. All checks are local.

## The teleportation incident

Open [the receiver bench](teleport/index.html) on a phone or computer and send a test state. The desktop [build-along](reader/lesson.html#teleport) puts you on call for the receiver. You edit the two-bit correction policy, inspect a single failed delivery, and verify all 24 combinations of test input and message. The [night shift](reader/lesson.html#night-shift) gives you a separate failure to localize, repair, and capture in a regression test. You can start here with the supplied Bell reporter and known-good receiver available as checkpoints.

```sh
python3 teleport/bench.py sweep --receiver learner
python3 teleport/bench.py trace --receiver learner --state plus --bits 10
python3 -m unittest discover -s teleport -p 'test_*.py'
```

`python3 teleport/learner_checks.py` exercises your editable receiver. It starts red. `python3 teleport/incident_regression.py` exercises your own night-station regression against the current station and the preserved incident. Each CLI reports exact simulated probabilities. Earlier Delft measurements came from separate experiments.

## Take the lab home

- [Score one round](lessons/01.md). Predict what a change to one box does. Write a scorer, run the classical and entangled simulations, and inspect the [circuit generator](examples/measurement.py).
- [Catch a false alarm](lessons/02.md). Write the per-setting correlation and signed sum. Diagnose a misleading 97% and an input with missing measurements.
- [Run the Delft report](lessons/03.md). Recover a published measurement, compare evidence at two sample sizes, and deliver a calibration diagnosis on a fresh case.
- [Repair the receiver](lessons/04.md). Use a phase-sensitive probe and repair a two-bit receiver.
- [Take the night shift](lessons/05.md). Separate readout from delivery, then write a regression that catches the original incident.

Save your first predictions, any assistance and your revisions in your own notes. Keep the measured counts and the original starter available in version control. Use `lab.py` as a separate reference checkpoint at any time. To preserve the original starter before editing, duplicate the whole course folder into a new directory. No command resets learner work.

## Watch alongside the project

1. [The fourth card](films/01-fourth-card.mp4) walks through the four-setting puzzle. [Transcript](films/01-fourth-card.md)
2. [196 wins](films/02-196-wins.mp4) compares a short lucky streak to the Delft measurements. [Transcript](films/02-196-wins.md)
3. [The scorekeeper](films/03-scorekeeper.mp4) follows one wrong implementation through a failed test, a repair, and the 97% fixture. [Transcript](films/03-scorekeeper.md)
4. [The receiver that passed](films/04-phase-slip.mp4) follows one message from a passing smoke test to a failed delivery and repair. [Transcript](films/04-phase-slip.md)

## Where the measurements come from

The real fixture preserves the eight published parity counts from Hensen et al. The course replays them offline. Its other runs and operator handoff are simulations or constructed examples. The local simulator samples the joint outcome distribution for the Bell pair and measurement axes in the lesson. The [four circuit settings](examples/measurement.py) can also be printed in OpenQASM 2. The authors' figure and archive, plus a verification script for the original archive, are linked in the [data notes](fixtures/README.md).

Read the [guide to the six books](BOOKS.md) for the Bell game, quantum protocols, graph walks and molecular physics.
