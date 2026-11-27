// Practice items for the Frame Perfect lessons, keyed by the {{practice:ID}} lines in lessons/NN.md.
//   q(objective, prompt, answer, feedback, wrong, section)
//   objective: the lesson that teaches the item ('01' to '08').
//   answer:    a number, a yes/no boolean, a list of numbers, or one word.
//   feedback:  the reason shown with the right answer, and for any wrong answer not in `wrong`.
//   wrong:     [{ answer, feedback }] for the likeliest wrong answers.
//   section:   the exact '## ' heading in lessons/<objective>.md that teaches the item.
// Ids starting with p and a digit are predictions, committed before the lesson shows the outcome.
// Every id has at least two questions, the second a fresh case on the same idea.
// Every number here is produced by a command listed in lessons/NUMBERS.md.
// Each lesson's items live in lessons/practice/NN.mjs.
import p01 from './practice/01.mjs';
import p02 from './practice/02.mjs';
import p03 from './practice/03.mjs';
import p04 from './practice/04.mjs';
import p05 from './practice/05.mjs';
import p06 from './practice/06.mjs';
import p07 from './practice/07.mjs';
import p08 from './practice/08.mjs';

export const practice = { ...p01, ...p02, ...p03, ...p04, ...p05, ...p06, ...p07, ...p08 };
