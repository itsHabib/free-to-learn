# My local relay network evidence

Record source changes and terminal output locally. No automatic uploads or credentials are needed. State any help you used. Preserve unsuccessful attempts as well as your final result; green output alone does not answer these questions.

## Before running

- My runtime/version and transport:
- My circuit diagram, relay process boundaries and expected neighbors:
- What I predict when a middle process dies:
- What I predict if an authentic packet arrives twice while the first call awaits its successor:
- What a missing reply can and cannot establish:

## Implementation evidence

- My seven completed functions (attach my source):
- Check results and one failure I diagnosed:
- Four distinct PIDs and the actual chosen three-hop path:
- A round trip with forward and backward layer order annotated:
- A trace showing which process served the archive:

## Controlled experiments

For each: write prediction, command sequence, observation, comparison to prediction, and explanation. Clearly distinguish client evidence from operator evidence.

1. Kill the chosen middle process; show a failed send and a fresh replacement succeeding.
2. Lose the exit's next reply; show that the archive receipt and client failure coexist.
3. Leave too few eligible relays; show an explicit stop and explain why shortening changes the intended path policy.
4. Restart a killed relay; explain why its new PID cannot use the old circuit state.

## Claims and limits

- One property demonstrated by the checks:
- One implementation bug those checks might miss:
- Why my local IPC transport is not a distributed Internet network:
- What would remain missing even if the optional TCP adapter worked:
- What the entry, middle, exit, client, and local operator can each learn:
- Why encryption here does not establish anonymity, Tor compatibility or exactly-once delivery:
- A useful next engineering experiment, bounded to fictional traffic on a permitted local environment:
