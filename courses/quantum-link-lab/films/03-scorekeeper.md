# How did two zeroes win 97 times?

**0:00** Open starter dot py and find wins. In a scratch copy, I'll replace the exception with my first guess. Give the players a point whenever their answers match. Which pair of settings breaks it?

**0:14** Run the Game check. Four cases fail. Here, both stations got a one, both answered zero, and our scorer gave them a point. The check expected a loss.

**0:26** Let's fix that case. If both settings are one, the answers have to differ. For every other setting, they have to match.

**0:34** Run the same check again. It passes. The one test tries all four settings against all four possible pairs of answers.

**0:43** Now use the finished reporter, lab dot py, to inspect a different run. These boxes always answered zero. Pause and count how many trials could possibly lose.

**0:56** Only three. The boxes won ninety-seven times because the one-one setting hardly appeared. Each setting has the same correlation, plus one. Add the first three, subtract the last, and the Bell score is two, right at the classical bound.
