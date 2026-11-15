// The protocol and timing constants of the Lob server. Every other module reads its
// numbers from here, so a lesson that quotes one of them quotes this file.

export const TICK_MS = 50;           // the server runs one tick every 50 ms
export const FRAMES_PER_TICK = 3;    // Lob runs at 60 frames a second, so a tick is three frames
export const MODE = 9;               // server wind (1) + moving flag (8)

export const ROUNDS_PER_SESSION = 12;
export const RESULT_TICKS = 20;       // after a landing, the result shows this long, then the server starts the next round
export const ROUND_LIMIT_TICKS = 200; // a round with no shot this long after it started ends unshot

export const INPUT_MAX_BYTES = 200;
export const ANGLE = { min: 5, max: 85 };
export const POWER = { min: 10, max: 100 };
export const SEQ = { min: 1, max: 1_000_000 };

export const HIT_RADIUS = 12;        // a landing within 12 paces of the flag is a hit
export const FLAG = { min: 420, max: 900 }; // the moving flag stays between these and bounces at both

// Lob's key codes, as game_key takes them.
export const KEYS = { LEFT: 1, RIGHT: 2, UP: 3, DOWN: 4, SPACE: 5, NEW_ROUND: 6 };
