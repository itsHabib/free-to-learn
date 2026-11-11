# Repair-station capstone

Assistance used:

## First predictions before implementation or a run

1. A repair succeeds, the actor moves away, and the same request arrives again. What receipt and balances should result?
2. A request fails outside the radius, the actor moves inside, and the same ID is submitted again. What state should have been retained from the failure?
3. How do (400,0) and (300,300) compare with a station at (0,0)? Which calculation decides?
4. A successful request ID is reused for another station. What differs from an ordinary duplicate?
5. Both receipt slots are full. What happens to a new ID and to an existing successful ID?
6. A repair body claims new position, energy, credits and price. Which source owns these values?

## Independent test plan before running

For each wrong variant, name the request sequence, state observation and assertion that should expose it. Do not paste a reference scenario.

- Duplicate charge:
- Range checked before receipt:
- Station conflict ignored:
- Failed ID reserved:
- Exact range boundary excluded:
- Wrong price:
- Receipt eviction:
- Vertical distance ignored:
- Request IDs incorrectly shared across actors:
- Client resource claims accepted:

## Attempt and repair

- First captured attempt/evidence path:
- Policy result and first failed expected/actual criterion:
- Scenario result on both correct implementations:
- Wrong variants detected by assertions:
- Wrong variants that survived or failed only through runtime errors:
- Repair and why it addresses the identified defect:
- New captured attempt/evidence path:

Append later attempts without replacing this account.

## Authority and resource transaction

Explain how identity, position, balances, configuration and receipt history reach the policy. Explain why a rejected body cannot change state, which updates must be atomic and why idempotency requires the original receipt as well as current balances. State what your local HTTP evidence does and does not establish.

## Transfer for review (not automatically graded)

A shared printer charges quota when it accepts a job. Connections can drop, clients can retry and completed-job details cannot be stored indefinitely. Propose retry identity, receipt scope and expiration/session boundaries. Explain behavior when history is full and what durable state or protocol a restart needs.

First answer:

Later repair and evidence:
