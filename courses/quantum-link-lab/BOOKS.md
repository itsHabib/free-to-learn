# A reading guide for Quantum Link Lab

Start with Hidary §7.4 if you want to understand the game your report scores. Start with Vos chapter 5 if you want to know how software describes a pair of entangled qubits. You can build the project without buying a book.

## For the link lab

| Book and edition | What you can do with it |
| --- | --- |
| *Quantum Computing: An Applied Approach*, Jack D. Hidary (2019, first edition) | §7.4 poses a Bell test as a two-player game, works through the classical limit, and simulates a quantum strategy in Cirq. Try writing down both players’ answers to each possible input before looking at the circuit. Find the input pair that makes your strategy lose. [Springer](https://link.springer.com/book/10.1007/978-3-030-23922-0) |
| *Quantum Computing in Action*, Johan Vos (2022) | Chapters 4–5 use the Java simulator Strange to construct a superposition and then a Bell pair. Ask whether a shared random bit could also produce two matching answers when the parties use the same measurement setting. Chapter 6 uses entanglement and ordinary communication for teleportation. Chapter 8 implements the BB84 key-distribution protocol, a different use of measurement. [Manning](https://www.manning.com/books/quantum-computing-in-action) |
| *Practical Quantum Computing for Developers*, Vladimir Silva (2018, first edition) | Chapter 3 experiments with Bell states. Chapter 5 generates and tests random bits, and chapter 6 adapts a Battleship game to run on a remote backend. A useful question for our report is whether two outcome streams can each look random yet show a pattern when you compare them. The book’s IBM setup instructions describe its 2018 environment. [Apress](https://link.springer.com/book/10.1007/978-1-4842-4218-6) |

To interpret the recorded trials, turn to the experiment itself. Hensen and colleagues describe how they chose measurement settings, separated the stations by 1.3 km, and identified an eligible trial. A score calculated from a file depends on those physical arrangements. You can check the arithmetic locally and read the experimental methods to understand the assumptions behind it. [Hensen et al., 2015](https://www.nature.com/articles/nature15759)

## For a different project

| Book and edition | What you can do with it |
| --- | --- |
| *Quantum Walks and Search Algorithms*, Renato Portugal (2013, first edition) | Chapters 5–6 follow quantum walks on a line and finite graphs. Simulate a walker, plot its position distribution after successive steps, and compare it with a coin-flipping walker. Chapter 8 turns the walk into spatial search. This is a good starting point for a graph-algorithm visualizer. [Springer](https://link.springer.com/book/10.1007/978-1-4614-6336-8) |
| *Introduction to Quantum Mechanics*, David J. Griffiths (1995, first edition) | Chapter 7 shows how a trial wave function gives an upper bound on ground-state energy. Try changing a parameter to lower that bound. The worked systems include helium and the hydrogen molecular ion H₂⁺. Hidary §9.1 picks up this idea with an adjustable quantum circuit and a classical optimizer. [First-edition library record](https://search.worldcat.org/title/1026276994) |
| *Introduction to Quantum Mechanics*, A. C. Phillips (2003) | §5.2 calculates transmission through a potential barrier. §6.4 uses the shape of a diatomic molecule’s energy curve near its minimum to explain its vibrations. If you built a tool that plotted molecular energy against the distance between nuclei, this section would help you read the plot. [Wiley](https://www.wiley-vch.de/en/areas-interest/natural-sciences/physics-11ph/theoretical-physics-11phg1/quantum-physics-field-theory-11phg1/introduction-to-quantum-mechanics-978-0-470-85324-5) |

For the receiver incident, read Vos chapter 6 alongside [the two-bit trace](lessons/04.md). Pause just after Alice measures. Predict Bob’s correction for message 10, then compare your prediction with the local program.
