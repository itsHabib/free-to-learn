# Sources and limits

This local course prototype uses original prose, schemas, exercises, policy code and fixtures. It includes the accepted recoverable-store public support component as supplied prerequisite code; exact provenance and verified existing MIT coverage for `runtime/foundation.mjs` and `runtime/disk.mjs` are in [FOUNDATION-NOTICE.md](runtime/FOUNDATION-NOTICE.md). The complete Free to Learn copyright and permission notice accompanies those files. This correction makes no licensing determination for newer course code, lesson material or other assets. The original source and accepted learner archives were left unchanged.

Primary conceptual references:

- [Berenson et al., A Critique of ANSI SQL Isolation Levels](https://arxiv.org/abs/cs/0701157): isolation definitions and Snapshot Isolation.
- [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html): snapshots, anomalies and transaction retries. Our declared read-only route and conservative validation are a smaller original contract, not PostgreSQL compatibility.
- [PostgreSQL 18 index consistency](https://www.postgresql.org/docs/18/index-locking.html) and [vacuuming](https://www.postgresql.org/docs/18/routine-vacuuming.html): historical visibility, lifetime and reclamation distinctions.
- [PostgreSQL 18 planner statistics](https://www.postgresql.org/docs/18/planner-stats.html) and [EXPLAIN](https://www.postgresql.org/docs/18/using-explain.html): estimates versus observations and alternative access/join plans. This prototype's work units are its own defined model.
- [Selinger et al., Access Path Selection](https://research.ibm.com/publications/access-path-selection-in-a-relational-database-management-system): original cost-based access/join-planning reference; abstract/metadata consulted.

These sources ground technical distinctions. No university project source, purchased book material, third-party data or copied exercise is bundled. MVCC and database-building courses already exist; no novelty claim is made.

The local engineering evidence is source-aware. It does not establish human learning, difficulty, duration, complete accessibility, browser behavior, power-loss durability or production suitability. The full Node route uses only the installed runtime and local files. No API account, inference service or network call is part of normal execution. Browser checks cover a smaller set of pure policies. Direct-file practice journeys have bounded checks; complete engine and project checks use Node, and broad browser/accessibility coverage is not established.

The separate instructor reference, defective controls and calibration scenarios are excluded from the learner export. Public practice answers and checker requirements are intentionally readable; they are learning aids, not held-out learning measures. Rights for other material, publication authorization, review and live-delivery acceptance remain separate from the verified MIT coverage of the two supplied foundation files.
