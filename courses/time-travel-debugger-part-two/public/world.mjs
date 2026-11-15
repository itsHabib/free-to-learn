// Supplied by the course: the outside world the game talks to. Lob imports four
// functions from it: sin(x) and cos(x), which the game uses to aim a shot, and
// two "server" calls: server_round(round), the wind level the server announces
// for a new round, and server_wind(), the exact wind the server reports while a
// shell is in the air. The server's answers come from a seed the game never
// sees and change from call to call, the way a real server's do, so a run can
// only be repeated by recording them.
//
// makeWorld(seed) returns { imports, answered } where imports is the object a
// machine is built with and answered counts the calls answered so far.
export function makeWorld(seed = 1) {
  let x = (seed * 2654435761) >>> 0 || 0x9e3779b9;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  let gust = 0;
  const world = { answered: 0 };
  world.imports = {
    sin: (v) => { world.answered++; return Math.sin(v); },
    cos: (v) => { world.answered++; return Math.cos(v); },
    server_round: (round) => { world.answered++; gust = (next() * 2 - 1) * 4; return Math.max(-3, Math.min(3, Math.round(gust / 1.5))) | 0; },   // | 0: never -0
    server_wind: () => { world.answered++; return Math.fround(gust + (next() * 2 - 1) * 0.6); },
  };
  return world;
}
