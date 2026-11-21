// Unit 13 end checkpoint: server/view.mjs with every walked-through region filled.
// examples/start-unit13.mjs copies it into a project as server/view.mjs.

// region: drawn-view
export function drawnView(game, { tick, ack }) {
  const shell = game.shell();
  const impact = game.impact();
  return {
    v: 1,
    tick,
    ack,
    round: game.round(),
    score: game.score(),
    shots: game.shots(),
    angle: Math.round(game.angle()),
    power: game.power(),
    wind: arrows(game.windLevel()),
    flag: Math.round(game.targetX()),
    shell: shell ? [Math.round(shell.x), Math.round(shell.y)] : null,
    trail: game.trail().map(([x, y]) => [Math.round(x), Math.round(y)]),
    impact: impact ? { x: Math.round(impact.x), age: impact.age } : null,
    message: game.message(),
    cloud: Math.round(game.cloud()),
  };
}
// endregion: drawn-view

// region: arrows
function arrows(level) {
  if (level === 0) return '~';
  return (level > 0 ? '>' : '<').repeat(Math.abs(level));
}
// endregion: arrows
