"""Bell link report: compare two local settings and two one-bit measurements."""

import argparse
import csv
import json
import math
import random
from pathlib import Path


SETTINGS = ((0, 0), (0, 1), (1, 0), (1, 1))
DELFT = Path(__file__).resolve().parent / "fixtures" / "delft-2015.csv"


def wins(x, y, a, b):
    """The outputs must differ only when both settings are 1."""
    return (a ^ b) == (x & y)


def correlation(equal, total):
    """Score each equal pair +1 and each opposite pair -1."""
    if total == 0:
        raise ValueError("A correlation needs at least one trial.")
    return (2 * equal - total) / total


def chsh(by_setting):
    """Combine four correlations, giving each setting pair one vote."""
    return (by_setting[0, 0] + by_setting[0, 1]
            + by_setting[1, 0] - by_setting[1, 1])


def bit(value):
    if value not in ("0", "1"):
        raise ValueError(f"expected a bit, got {value!r}")
    return int(value)


def count(value):
    if not value.isascii() or not value.isdecimal():
        raise ValueError(f"expected a nonnegative integer count, got {value!r}")
    return int(value)


def load_counts(path):
    """Read measured parity totals or individual output pairs and multiplicities."""
    totals = {setting: [0, 0] for setting in SETTINGS}
    with path.open(newline="", encoding="utf-8-sig") as source:
        rows = csv.reader(source, strict=True)
        header = next(rows, [])
        paired = header == ["x", "y", "a", "b", "count"]
        if not paired and header != ["x", "y", "equal", "opposite"]:
            raise ValueError("expected CSV header x,y,a,b,count or x,y,equal,opposite")
        for row in rows:
            try:
                if len(row) != len(header):
                    raise ValueError(f"expected {len(header)} columns, found {len(row)}")
                setting = bit(row[0]), bit(row[1])
                if paired:
                    parity = bit(row[2]) ^ bit(row[3])
                    totals[setting][parity] += count(row[4])
                else:
                    totals[setting][0] += count(row[2])
                    totals[setting][1] += count(row[3])
            except ValueError as error:
                raise ValueError(f"{path.name}, line {rows.line_num}: {error}") from error
    return totals


def equal_probability(x, y, visibility):
    """Born-rule parity probability for a Bell pair measured in the XZ plane.

    For the state (|00> + |11>)/sqrt(2), E = cos(alpha - beta).
    White noise contributes zero correlation and visibility scales the signal.
    """
    alice_angle = (0, math.pi / 2)[x]
    bob_angle = (math.pi / 4, -math.pi / 4)[y]
    return (1 + visibility * math.cos(alice_angle - bob_angle)) / 2


def simulate(model, trials, seed, visibility=1.0):
    if model not in ("entangled", "classical"):
        raise ValueError("choose the classical or entangled model")
    if trials < 1:
        raise ValueError("trials must be a positive integer")
    if not 0 <= visibility <= 1:
        raise ValueError("visibility must be between 0 and 1")
    if model == "classical" and visibility != 1:
        raise ValueError("visibility controls white noise in the entangled model")
    rng = random.Random(seed)
    totals = {setting: [0, 0] for setting in SETTINGS}
    for _ in range(trials):
        x, y = rng.randrange(2), rng.randrange(2)
        a = rng.randrange(2)
        # The classical stations share a fair bit and return it for every setting.
        b = a
        if model == "entangled":
            # Sample a joint distribution on one computer; both marginals are fair.
            equal = rng.random() < equal_probability(x, y, visibility)
            b = a if equal else 1 - a
        totals[x, y][a ^ b] += 1
    return totals


def summarize(totals, score=wins, normalize=correlation, combine=chsh):
    missing = [f"{x}{y}" for x, y in SETTINGS if sum(totals[x, y]) == 0]
    if missing:
        raise ValueError("Missing trials for setting " + ", ".join(missing)
                         + ". Collect that setting before computing S.")
    settings = []
    correlations = {}
    wins_total = 0
    trials = 0
    for x, y in SETTINGS:
        equal, opposite = totals[x, y]
        n = equal + opposite
        # Parity is sufficient. (0,0) and (0,1) stand for same and different.
        # A figure with only parity totals cannot recover individual station bits.
        wins_total += equal * score(x, y, 0, 0) + opposite * score(x, y, 0, 1)
        trials += n
        correlations[x, y] = normalize(equal, n)
        settings.append(dict(x=x, y=y, equal=equal, opposite=opposite,
                             trials=n, correlation=correlations[x, y]))
    return dict(wins=wins_total, trials=trials, win_rate=wins_total / trials,
                s=combine(correlations), settings=settings)


def uniform_null(wins_total, trials):
    """One-sided best-local binomial bound in log space at fixed n and p=3/4."""
    if not 0 <= wins_total <= trials <= 100_000:
        raise ValueError("uniform-null requires 0 <= wins <= trials <= 100000")
    if wins_total == 0:
        return 0.0

    # Begin with P(K=k), then P(K=k+1)/P(K=k) = 3(n-k)/(k+1).
    # Log-sum-exp retains tiny nonzero tails for the printed scientific notation.
    k = wins_total
    log_mass = (math.lgamma(trials + 1) - math.lgamma(k + 1)
                - math.lgamma(trials - k + 1)
                + k * math.log(.75) + (trials - k) * math.log(.25))
    log_tail = log_mass
    for k in range(wins_total, trials):
        log_mass += math.log(3 * (trials - k) / (k + 1))
        high, low = max(log_mass, log_tail), min(log_mass, log_tail)
        log_tail = high + math.log1p(math.exp(low - high))
    return min(0.0, log_tail)


def null_report(wins_total, trials):
    log_p = uniform_null(wins_total, trials)
    # JSON numbers cannot express all possible tails. Keep the natural log as well.
    value = math.exp(log_p)
    return dict(p_value=value if value > 0 else None, log_p_value=log_p,
                assumptions="Fixed trial count, no communication, fresh independent uniform settings independent of the devices.")


def replay_label(path, totals):
    published = [[46, 7], [63, 16], [46, 16], [10, 41]]
    if path.resolve() == DELFT and [totals[key] for key in SETTINGS] == published:
        return "Recorded experiment | Delft 2015, Figure 4a"
    return f"CSV input | {path.name}"


def display(label, result, as_json):
    if as_json:
        print(json.dumps(dict(source=label, **result), allow_nan=False))
        return
    print(label)
    print("xy  equal  opposite  correlation")
    for row in result["settings"]:
        print("{x}{y}  {equal:5}  {opposite:8}  {correlation:+.3f}".format(**row))
    print("Wins: {wins}/{trials} ({win_rate:.1%})   S = {s:.3f}".format(**result))
    print("Local strategies: S <= 2 in expectation with fresh settings independent of the devices.")
    print("Finite samples fluctuate. Scoring a file cannot verify physical separation.")
    print("The 75% local win bound assumes independent, uniform settings.")
    if "uniform_null" in result:
        null = result["uniform_null"]
        value = null["p_value"]
        if value is None:
            p_text = f"10^({null['log_p_value'] / math.log(10):.2f})"
        else:
            p_text = f"{value:.6g}"
        print(f"Uniform local null: P(at least {result['wins']} wins) <= {p_text}")
        print("Assumptions:", null["assumptions"])
    print()


def main(score=wins, normalize=correlation, combine=chsh):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("demo", help="compare two simulations with a measured experiment")
    replay = commands.add_parser("replay", help="score a CSV capture")
    replay.add_argument("path", type=Path)
    replay.add_argument("--json", action="store_true")
    replay.add_argument("--uniform-null", action="store_true",
                        help="one-sided local binomial bound; asserts fixed n (up to 100000), "
                             "no communication, fresh uniform independent settings")
    sim = commands.add_parser("simulate", help="sample a model on this computer")
    sim.add_argument("--model", choices=("classical", "entangled"), required=True)
    sim.add_argument("--trials", type=int, default=4096)
    sim.add_argument("--seed", type=int, default=7)
    sim.add_argument("--visibility", type=float, default=1.0)
    sim.add_argument("--json", action="store_true")
    args = parser.parse_args()

    def show(label, totals):
        result = summarize(totals, score, normalize, combine)
        if getattr(args, "uniform_null", False):
            result["uniform_null"] = null_report(result["wins"], result["trials"])
        display(label, result, getattr(args, "json", False))

    try:
        if args.command == "demo":
            for model in ("classical", "entangled"):
                show(f"Simulation | {model} | seed 7", simulate(model, 4096, 7))
            totals = load_counts(DELFT)
            show(replay_label(DELFT, totals), totals)
        elif args.command == "replay":
            totals = load_counts(args.path)
            show(replay_label(args.path, totals), totals)
        else:
            label = f"Simulation | {args.model} | seed {args.seed}"
            if args.model == "entangled":
                label += f" | visibility {args.visibility:g}"
            show(label, simulate(args.model, args.trials, args.seed, args.visibility))
    except (ValueError, csv.Error, OSError, NotImplementedError) as error:
        parser.exit(2, f"Lab: {error}\n")


if __name__ == "__main__":
    main()
