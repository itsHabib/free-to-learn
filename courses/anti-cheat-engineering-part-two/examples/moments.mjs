// Three moments of one scripted Lob session, for the unit 13 probes: aiming before the
// first shot, the shell in the air, and just after it lands. Each is { label, game, info }.
import { createLobSession } from '../public/session.mjs';

export function moments() {
  const session = createLobSession({ seed: 7 });
  const at = (label) => ({
    label,
    game: session.game.clone(),
    info: { tick: session.tick, ack: 1 },
  });
  for (let i = 0; i < 10; i++) session.step();
  session.apply({ v: 1, seq: 1, angle: 60, power: 35, fire: false });
  session.step();
  const aiming = at('aiming');
  session.apply({ v: 1, seq: 2, angle: 60, power: 35, fire: true });
  for (let i = 0; i < 8; i++) session.step();
  const flying = at('in flight');
  while (session.game.flying()) session.step();
  for (let i = 0; i < 3; i++) session.step();
  const landed = at('landed');
  for (const m of [flying, landed]) m.info.ack = 2;
  return [aiming, flying, landed];
}
