"""Each cue supplies a diagram state, narration and a pause for the viewer."""
FILMS = {
    "01-fourth-card": (
        "Can the fourth card win?",
        [
            ("deal", "Alice and Bob sit in separate rooms. Each receives one card, marked zero or one.", 0.35),
            ("rooms", "They can agree on a plan beforehand. Once the cards arrive, each must answer with one bit, without seeing the other card.", 0.35),
            ("rules", "For three deals, their answers have to match. If both cards show one, their answers have to differ.", 0.6),
            ("guess", "Suppose they always answer zero. Which deal costs them a point? Pause and pick it.", 2.6),
            ("turn", "One and one. They give matching answers just when the referee needs different answers.", 0.5),
            ("change", "What if Alice alone changes her answer on a one? Watch the lost point move.", 0.6),
            ("moved", "She saves the last deal. Now she loses when her card is one and Bob's is zero. Could a cleverer plan win all four?", 0.9),
            ("chain1", "Put each possible answer on a pin. To win the first deal, Alice on zero must equal Bob on zero.", 0.4),
            ("chain2", "To win the next two, Bob on one must match Alice on zero, and Alice on one must match Bob on zero.", 0.4),
            ("chain3", "Follow the green path. All four answers must now match. The last deal asks the two ends to differ.", 0.7),
            ("limit", "With independent fair cards, every deal has a one in four chance. A local plan can win at most three quarters on average. Mixing plans cannot improve that limit.", 0.6),
            ("axes", "A quantum pair offers a different move. Let each card choose the angle at which its holder measures one half of an entangled pair.", 0.45),
            ("quantum", "At these angles the ideal quantum win rate is about eighty five percent. Each answer alone still looks random. The pattern appears when you compare the two logs.", 1.0),
        ],
    ),
    "02-196-wins": (
        "Which eighty percent?",
        [
            ("compare", "Two runs both won eighty percent of their trials. One scored eight out of ten. The other scored a hundred and ninety six out of two hundred and forty five.", 0.45),
            ("choose", "Imagine each run had a fixed length before the first trial. Which score is harder for separated players using an ordinary shared plan to produce? Make your pick.", 2.5),
            ("ten", "Start with ten independent fair deals. Players who always answer zero win three times out of four on average. They still get lucky.", 0.35),
            ("tenTail", "Each bar shows how often they finish with that many wins. The bright bars cover eight or more. Together, those results happen about fifty three percent of the time.", 0.55),
            ("long", "Now give the same players two hundred and forty five deals. Their wins cluster around a hundred and eighty four.", 0.4),
            ("longTail", "A hundred and ninety six sits farther out. The chance of that many wins or more falls to about three point nine percent under this model.", 0.45),
            ("paper", "That larger score comes from a real Bell experiment in Delft. In twenty fifteen, researchers measured electron spins one point three kilometers apart.", 0.5),
            ("meaning", "The percentage answers a question about the shared plan. If that plan generated the data, how often would its score reach this far?", 0.45),
            ("erase", "Now imagine quietly deleting losing trials. Keep the same one hundred and ninety six wins. Delete all forty nine losses. What will your dashboard report?", 2.0),
            ("erased", "A perfect run, manufactured with a filter. Decide which trials count before reading their outcomes. Keep a record of the rule.", 0.45),
            ("audit", "A file can reproduce the tally. To judge the physical claim, read how the team separated the stations, chose the settings, and decided when a trial began.", 0.8),
        ],
    ),
}
