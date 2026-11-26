"""Cross-check Figure 4a using a local copy of the original 4TU data.zip.

Usage: python3 fixtures/verify_delft.py /path/to/data.zip
Prints parity counts; never writes to either input.
"""

import csv
import io
import sys
import zipfile
from pathlib import Path

# Before counting output parity, apply the authors' pre-specified herald,
# excitation, and invalid-marker cuts in bell_open_data_analysis_example.py.
def accepted(row):
    starts = (5426350, 5425700)  # picoseconds, detector-specific first windows
    first_time, first_ch, second_time, second_ch = row[2:6]
    first_offset = first_time - starts[first_ch]
    second_offset = second_time - starts[second_ch] - 250000
    return (first_ch != second_ch
            and 0 <= first_offset < 52450 and 0 <= second_offset < 52450
            and row[12] == row[13] == 0
            and all(marker == 0 or marker > 250 for marker in row[14:16]))


def extract(archive):
    counts = {(x, y): [0, 0] for x in range(2) for y in range(2)}
    with zipfile.ZipFile(archive) as data, data.open("bell_open_data.txt") as source:
        for raw in csv.reader(io.TextIOWrapper(source, encoding="ascii")):
            row = [int(field) for field in raw[1:17]]  # omit the timestamp
            if not accepted(row):
                continue
            a_click = 10620 < row[10] <= 14320  # nanoseconds
            b_click = 10620 < row[11] <= 14320
            counts[row[6], row[7]][a_click != b_click] += 1
    return [[x, y, *counts[x, y]] for x, y in sorted(counts)]


if __name__ == "__main__":
    result = extract(sys.argv[1])
    path = Path(__file__).with_name("delft-2015.csv")
    with path.open(newline="") as reference:
        expected = list(csv.reader(reference))[1:]
    print("x,y,equal,opposite")
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerows(result)
    if result != [[int(value) for value in row] for row in expected]:
        sys.exit("Mismatch with Figure 4a fixture")
