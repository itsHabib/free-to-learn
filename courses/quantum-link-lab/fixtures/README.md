# Measurement records

`delft-2015.csv` contains the four pairs of equal and opposite measurement counts
printed above the bars in Figure 4a of B. Hensen et al., *Loophole-free Bell
inequality violation using electron spins separated by 1.3 kilometres* (2015).
The recorded measurement basis choices are named `x,y` here. The authors call
them *a,b*. The figure reports the parity of the outcomes and the number of
occurrences. Its 245 trials have no time order in this fixture. These counts
cannot recover either station's individual output frequencies. [Article, Figure 4](https://doi.org/10.1038/nature15759) · [Figure 4a, preprint p. 6](https://arxiv.org/pdf/1508.05949#page=6).

| Settings | Equal outcomes | Opposite outcomes |
| --- | ---: | ---: |
| 00 | 46 | 7 |
| 01 | 63 | 16 |
| 10 | 46 | 16 |
| 11 | 10 | 41 |

For individual timestamps, measurement outcomes, detector windows, and the
authors' example analysis, see Hensen et al. (2015), *Loophole-free
Bell-inequality violation using electron spins separated by 1.3 kilometres*,
4TU.ResearchData. The repository hosts that separate archive under its own terms.
[Original data and code](https://doi.org/10.4121/uuid:6e19e9b2-4a2d-40b5-8dd3-a660bf3c0a31).

`skewed-classical.csv` and `missing-setting.csv` are constructed teaching cases.
Each station outputs zero on every trial. In the first file the 11 setting appears
three times in 100 trials. In the second the pair of settings 11 is absent.
For other runs, supply either the parity totals used by the Delft figure or the
bit outputs of both stations with a count. In both formats each count denotes
trials, and each setting label and individual output is a bit.

To reproduce the eight numbers independently, download the original archive from
4TU and run `python3 fixtures/verify_delft.py /path/to/data.zip`. It applies the
authors' pre-specified filters and checks its output against the figure. The
verified archive's SHA-256 is `c28eb0f075759aef620a0b2e00a70fd675ce712bc8214d11c103f5a3d29492c0`.
