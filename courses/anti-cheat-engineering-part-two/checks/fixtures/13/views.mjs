// Planted views for 13.leaks-finds. Each one sends what the official client draws, plus
// one leak (or two), and lists exactly the hidden names (game.hidden) it leaks at the
// moment 13.leaks-finds tries it at (LEAK_PLAN in checks/13.mjs). A hidden thing that is
// absent at a moment (no shell in the air, no impact mark, no trail) leaks nothing there.
//
// They share a base, `screen`, which leaks nothing. It is not API.md's drawn view: it has
// fields of its own (the HUD line as the game prints it, the trail as one flat list), so
// a finder that works by comparing against the drawn view, instead of changing hidden
// things one at a time, gets these wrong.
//
// `note` says what makes a view hard to catch; 13.leaks-finds prints it when your
// findLeaks misses that view's leak. 13.leaks-finds hands your findLeaks a new function
// that calls the planted view, so a view is known only by what its messages hold.
import { Buffer } from 'node:buffer';

// What the screen shows, in a shape of its own: every position to the nearest pace.
export function screen(game, { tick, ack }) {
  const shell = game.shell();
  const impact = game.impact();
  return {
    t: tick,
    a: ack,
    hud: game.line(),
    msg: game.message(),
    flag: Math.round(game.targetX()),
    cloud: Math.round(game.cloud()),
    shell: shell && [Math.round(shell.x), Math.round(shell.y)],
    trail: game.trail().flatMap(([x, y]) => [Math.round(x), Math.round(y)]),
    mark: impact && [Math.round(impact.x), impact.age],
  };
}

// The middle of the band of exact winds that show the current arrows.
function bandMiddle(level) {
  if (level >= 3) return 4.375;
  if (level <= -3) return -4.375;
  return 1.5 * level;
}

export const correct = {
  about: 'the base view: whole paces and the HUD line only',
  leaks: [],
  view: screen,
};

export const windTwoDecimals = {
  about: 'adds the exact wind to two decimals, as text',
  leaks: ['wind'],
  view: (game, info) => ({ ...screen(game, info), gust: game.serverWind().toFixed(2) }),
};

export const windFloatBase64 = {
  about: "adds the 4 bytes of the exact wind as a 32-bit float, in base64",
  leaks: ['wind'],
  view: (game, info) => ({ ...screen(game, info), w: Buffer.from(new Float32Array([game.serverWind()]).buffer).toString('base64') }),
};

export const flagUnrounded = {
  about: "sends the flag's exact x instead of the nearest pace",
  leaks: ['flagFraction'],
  view: (game, info) => ({ ...screen(game, info), flag: game.targetX() }),
};

export const trailUnrounded = {
  about: 'sends the trail points as the game holds them, not to the nearest pace',
  leaks: ['trailFraction'],
  view: (game, info) => ({ ...screen(game, info), trail: game.trail().flat() }),
};

export const flagDirection = {
  about: "adds the sign of the flag's speed: which way it is moving",
  leaks: ['flagSpeed'],
  note: 'the flag moves left here, and not every change of its speed changes the sign: try all three k',
  view: (game, info) => ({ ...screen(game, info), dir: Math.sign(game.flagSpeed()) }),
};

// Its leak shows only when one of the three changes of the timer crosses half a second,
// about one moment in three; 13.leaks-finds tries it at such a moment. At the others,
// non-interference with three changes cannot see it.
export const flagTurnsSoon = {
  about: 'adds whether the flag picks a new speed within half a second (30 frames)',
  leaks: ['flagTimer'],
  note: 'not every change of the timer here crosses half a second: try all three k',
  view: (game, info) => ({ ...screen(game, info), turnsSoon: game.flagTimer() <= 30 }),
};

// The same kind of leak, tried at a moment where the timer is far above 30 frames: only
// one of the three changes of the timer brings it under 30.
export const flagTimerUnder30 = {
  about: 'adds whether the flag picks a new speed in under 30 frames',
  leaks: ['flagTimer'],
  note: 'only one of the three changes of the timer here brings it under 30: try all three k',
  view: (game, info) => ({ ...screen(game, info), soon: game.flagTimer() < 30 }),
};

export const rngBase36 = {
  about: "adds the game's random state, in base 36",
  leaks: ['rng'],
  view: (game, info) => ({ ...screen(game, info), seed: game.rng().toString(36) }),
};

export const shellVelocity = {
  about: "adds the shell's velocity while it flies",
  leaks: ['shellVelocity'],
  view: (game, info) => {
    const { vx, vy } = game.velocity();
    return { ...screen(game, info), vel: game.flying() ? [vx, vy] : null };
  },
};

export const shellUnrounded = {
  about: "sends the shell's exact position",
  leaks: ['shellFraction'],
  view: (game, info) => {
    const shell = game.shell();
    return { ...screen(game, info), shell: shell && [shell.x, shell.y] };
  },
};

export const impactUnrounded = {
  about: "sends the impact mark's exact x",
  leaks: ['impactFraction'],
  view: (game, info) => {
    const impact = game.impact();
    return { ...screen(game, info), mark: impact && [impact.x, impact.age] };
  },
};

export const windKeyOrder = {
  about: "puts flag first when the exact wind is above the middle of its arrows' band: the same fields and values, in another order",
  leaks: ['wind'],
  note: 'only the order of the keys changes, so compare the two JSON texts, not parsed objects; and not every change of the wind here crosses the middle: try all three k',
  view: (game, info) => {
    const s = screen(game, info);
    if (game.serverWind() <= bandMiddle(game.windLevel())) return s;
    const { flag, ...rest } = s;
    return { flag, ...rest };
  },
};

export const cloudAndWind = {
  about: "sends the cloud's exact x and the exact wind times 1,000: two leaks at once",
  leaks: ['cloudFraction', 'wind'],
  note: 'two names leak here: report every one, sorted',
  view: (game, info) => ({ ...screen(game, info), cloud: game.cloud(), gust: Math.round(game.serverWind() * 1000) }),
};

// Every planted view by name, as 13.leaks-finds refers to them.
export const PLANTED = {
  correct, windTwoDecimals, windFloatBase64, flagUnrounded, trailUnrounded, flagDirection, flagTurnsSoon,
  flagTimerUnder30, rngBase36, shellVelocity, shellUnrounded, impactUnrounded, windKeyOrder, cloudAndWind,
};
