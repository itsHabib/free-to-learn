// Unit 13, new application: a view for spectators. Lesson 13, "Use the idea on a new case",
// gives the task; examples/check-spectator.mjs checks it. No finished spectatorView is
// supplied.
//
// spectatorView(game, info): the message a spectator's screen gets after a tick. It holds
// the same fields as your drawnView, with the same values, except angle and power: those
// are the player's aim, and a spectator may see them only while the shell is in the air.
// At every other moment both are null, and nothing about the aim may reach the message.
export function spectatorView(game, info) {
  throw new Error('spectatorView: not written yet');
}
