// The "send everything" view: every field of the game decoded, plus what the server
// keeps outside the game's memory (the exact wind). It is what part one's /state did,
// the baseline that unit 13 replaces. The corpus also generates its views with it and
// lets the official client draw only what a screen draws from them.
export function fullView(game, { tick, ack }) {
  const fields = game.fields();
  return {
    v: 1,
    tick,
    ack,
    game: { ...fields, flying: fields.flying !== 0, windExact: game.serverWind(), trail: game.trail() },
    hud: { line: game.line(), message: game.message() },
  };
}
