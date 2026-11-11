# Sources and scope

The small game implementation, course text, exercise scaffolding and local tooling in this package were written for this course. No Arcfield, duel-director, MIT lecture text or external library source was copied into the learner package.

The design draws on these primary references:

- [OpenSpiel framework paper](https://arxiv.org/abs/1908.09453): game/state interfaces and distinctions among game classes.
- [OpenSpiel Breakthrough implementation](https://github.com/google-deepmind/open_spiel/tree/master/open_spiel/games/breakthrough): an external rules reference. The course uses a declared 5×5 configuration and its own action encoding.
- [MIT 6.034, search in games](https://ocw.mit.edu/courses/6-034-artificial-intelligence-fall-2010/resources/lecture-6-search-games-minimax-and-alpha-beta/): foundational minimax and alpha-beta concepts. MIT material is linked, not republished; its terms apply on the linked site.
- [Stanford CS229 notes](https://cs229.stanford.edu/main_notes.pdf): linear least-squares fitting and optimization.
- [Policy-Space Response Oracles](https://arxiv.org/abs/1711.00832): overfitting to training partners and learning against populations. This teaching league is not a reproduction of the paper's experiments.
- [Alpha-Rank](https://arxiv.org/abs/1903.01373): strategic interactions and ranking. The course's matrix/graph view is not an implementation of Alpha-Rank.
- [Deep Reinforcement Learning at the Edge of the Statistical Precipice](https://arxiv.org/abs/2108.13264): uncertainty in comparisons and independent training-run variability.
- [SciPy bootstrap documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html): paired resampling and interval-method distinctions. SciPy is not a required dependency.

Examples and reported toy numbers in lessons are illustrative unless explicitly accompanied by a retained run record. A successful local checker run is evidence for its finite contract, not a proof of optimal play, learning gains, or generalization to all games. The public practice feedback is available in this package; it is not a hidden assessment.
