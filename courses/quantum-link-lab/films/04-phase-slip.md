# The receiver that passes its tests

**0:00** The pair source passes a Bell check on a separate batch of simulated pairs. The receiver also delivers zero and one perfectly. A user says their qubit changes on delivery. Could all three checks still be right?

**0:15** Alice and Bob share a fresh pair. Alice has a third qubit to send. You control its preparation and how the tester reads Bob's output. Would you repeat the zero test, or send plus and check for plus? Pause and choose.

**0:34** Send plus. A healthy receiver returns plus every time when checked in the matching basis. This receiver returns plus only half the time. Open the trace. There are four equally likely messages Alice can send Bob.

**0:48** Follow message one zero. Its first bit tells Bob to correct the phase. Its second bit asks for no flip. Both bits arrive. The broken receiver applies no gate. The tester expects plus and reads minus on every delivery with this message.

**1:05** Here's what the zero and one tests missed. Plus has two components with the same sign. Minus has the same sizes but opposite signs. A zero or one measurement sees only the sizes. Measuring in the plus and minus basis detects the sign difference.

**1:22** Give the first bit its job back. When it is one, Bob applies Z, which changes the sign of the one component. Replay the same message and input. This time the output passes the plus check.

**1:36** Run all six inputs. The first two never exposed the bug. The other four move from half to all deliveries passing. Keep a test with both the plus input and the one zero message. If the phase correction disappears again, that test fails every time.
