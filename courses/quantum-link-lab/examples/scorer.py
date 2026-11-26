"""Three worked policies for the learner reporter. Run for a quick check."""


# region: game
def wins(x, y, a, b):
    need_different = x == 1 and y == 1
    return (a != b) == need_different


# endregion: game


# region: corr
def correlation(equal, total):
    if total == 0:
        raise ValueError("No trials for this setting")
    opposite = total - equal
    return (equal - opposite) / total


# endregion: corr


# region: witness
def chsh(by_setting):
    return by_setting[0, 0] + by_setting[0, 1] + by_setting[1, 0] - by_setting[1, 1]


# endregion: witness

if __name__ == "__main__":
    print("Input 11, answers 01:", wins(1, 1, 0, 1))
    print("Three equal answers in four trials:", correlation(3, 4))
    settings = dict.fromkeys(((0, 0), (0, 1), (1, 0), (1, 1)), 1)
    print("Two boxes that always agree:", chsh(settings))
