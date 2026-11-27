// Kettle's drawing code, shared by the movie player (view.mjs), the bench page and the films, so every
// picture of the game comes from the same art. Every size is in game pixels (a tile is 8).
import { ADDR, SUB } from './core.mjs';

const u16 = (ram, a) => ram[a] | (ram[a + 1] << 8);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const PAL = {
  stone: '#d2c9b8', stoneDark: '#bdb3a0', grass: '#86ad6e', grassDark: '#6b9455',
  belt: '#4c5566', beltEdge: '#363d4a', chevron: '#f4f7fb',
  brass: '#d49a26', brassDark: '#8e6312', plate: '#f6e7bf', rungPlate: '#ebe5d8', rungBell: '#cbbfa3',
  spike: '#b8402c', spikeLight: '#de7a5f', flagPole: '#6b5a45', flag: '#2b8a5e',
  gem: '#1b9c9f', gemLight: '#9be7e2', gemDark: '#0d6468',
  crate: '#b67a42', crateDark: '#7a4c22', copper: '#c96f3b',
};

export function drawStone(g, x, y, info) {
  g.fillStyle = PAL.stone; g.fillRect(x, y, 8, 8);
  g.fillStyle = PAL.stoneDark;
  g.fillRect(x, y + 7.4, 8, 0.6);
  g.fillRect(x, y + 3.7, 8, 0.5);
  g.fillRect(x + (info.odd ? 2 : 6), y + 4, 0.5, 3.5);
  g.fillRect(x + (info.odd ? 6 : 2), y, 0.5, 3.7);
  if (!info.grass) return;
  g.fillStyle = PAL.grass; g.fillRect(x, y, 8, 1.7);
  g.fillStyle = PAL.grassDark; g.fillRect(x, y + 1.7, 8, 0.4);
}

export function drawBelt(g, x, y, info) {
  const dir = info.tile === '>' ? 1 : -1;
  g.fillStyle = PAL.belt; g.fillRect(x, y, 8, 8);
  g.fillStyle = PAL.beltEdge; g.fillRect(x, y, 8, 1); g.fillRect(x, y + 7, 8, 1);
  g.save();
  g.beginPath(); g.rect(x, y + 1, 8, 6); g.clip();
  g.strokeStyle = PAL.chevron; g.lineWidth = 1.3; g.lineJoin = 'miter';
  const phase = ((info.frame * 0.5 * dir) % 4 + 4) % 4; // the belt carries 0.5 px a frame
  for (let cx = x - 4 + phase; cx < x + 12; cx += 4) {
    g.beginPath();
    g.moveTo(cx - 1.2 * dir, y + 2); g.lineTo(cx + 1.2 * dir, y + 4); g.lineTo(cx - 1.2 * dir, y + 6);
    g.stroke();
  }
  g.restore();
}

export function drawBell(g, x, y, info) {
  g.fillStyle = info.rung ? PAL.rungPlate : PAL.plate; g.fillRect(x, y, 8, 8);
  g.strokeStyle = info.rung ? PAL.rungBell : PAL.brassDark; g.lineWidth = 0.6; g.strokeRect(x + 0.3, y + 0.3, 7.4, 7.4);
  g.fillStyle = info.rung ? PAL.rungBell : PAL.brass;
  g.beginPath();
  g.moveTo(x + 1.3, y + 6.2);
  g.quadraticCurveTo(x + 2.4, y + 5.4, x + 2.4, y + 3.6);
  g.quadraticCurveTo(x + 4, y + 0.6, x + 5.6, y + 3.6);
  g.quadraticCurveTo(x + 5.6, y + 5.4, x + 6.7, y + 6.2);
  g.closePath(); g.fill();
  g.fillRect(x + 3.6, y + 1.1, 0.8, 0.8);
  g.fillStyle = info.rung ? PAL.rungBell : PAL.brassDark;
  g.beginPath(); g.arc(x + 4, y + 6.7, 0.75, 0, 7); g.fill();
}

export function drawSpikes(g, x, y) {
  for (let i = 0; i < 3; i++) {
    const sx = x + i * 8 / 3;
    g.fillStyle = PAL.spike;
    g.beginPath(); g.moveTo(sx, y + 8); g.lineTo(sx + 4 / 3, y + 2); g.lineTo(sx + 8 / 3, y + 8); g.fill();
    g.fillStyle = PAL.spikeLight;
    g.beginPath(); g.moveTo(sx + 0.5, y + 8); g.lineTo(sx + 4 / 3, y + 3.6); g.lineTo(sx + 4 / 3, y + 8); g.fill();
  }
}

export function drawFlag(g, x, y) {
  g.fillStyle = PAL.flagPole; g.fillRect(x + 1.6, y + 0.4, 0.9, 7.6);
  g.fillRect(x + 0.8, y + 7.3, 2.5, 0.7);
  g.fillStyle = PAL.flag;
  g.beginPath(); g.moveTo(x + 2.5, y + 0.6); g.lineTo(x + 7.6, y + 2.5); g.lineTo(x + 2.5, y + 4.4); g.fill();
}

export function drawGem(g, x, y) {
  g.fillStyle = PAL.gemDark;
  g.beginPath(); g.moveTo(x + 4, y + 1.2); g.lineTo(x + 6.8, y + 4); g.lineTo(x + 4, y + 6.8); g.lineTo(x + 1.2, y + 4); g.fill();
  g.fillStyle = PAL.gem;
  g.beginPath(); g.moveTo(x + 4, y + 1.9); g.lineTo(x + 6.1, y + 4); g.lineTo(x + 4, y + 6.1); g.lineTo(x + 1.9, y + 4); g.fill();
  g.fillStyle = PAL.gemLight;
  g.beginPath(); g.moveTo(x + 4, y + 1.9); g.lineTo(x + 4, y + 4); g.lineTo(x + 1.9, y + 4); g.fill();
}

export function drawCrate(g, x, y) {
  g.fillStyle = PAL.crateDark; g.fillRect(x, y, 8, 8);
  g.fillStyle = PAL.crate; g.fillRect(x + 0.8, y + 0.8, 6.4, 6.4);
  g.strokeStyle = PAL.crateDark; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(x + 1, y + 1); g.lineTo(x + 7, y + 7); g.moveTo(x + 7, y + 1); g.lineTo(x + 1, y + 7); g.stroke();
}

export function drawDropPlace(g, x, y, info) {
  g.strokeStyle = info.kind === 'gem' ? PAL.gem : PAL.crate;
  g.lineWidth = 0.6; g.setLineDash([1, 1]);
  g.strokeRect(x + 0.5, y + 0.5, 7, 7);
  g.setLineDash([]);
}

export function drawKettle(g, x, y, info) {
  const face = info.face;
  g.save();
  if (info.dead) g.globalAlpha = 0.45;
  g.fillStyle = '#a9542a';
  const sx = face > 0 ? x + 5.6 : x + 0.4;
  g.beginPath(); g.moveTo(sx, y + 4); g.lineTo(sx + 2 * face, y + 2.6); g.lineTo(sx + 2.3 * face, y + 3.3); g.lineTo(sx, y + 5.4); g.fill();
  g.fillStyle = PAL.copper; g.beginPath(); g.roundRect(x, y + 2.4, 6, 5.6, [1.2, 1.2, 2, 2]); g.fill();
  g.fillStyle = '#e8a77a'; g.fillRect(face > 0 ? x + 1 : x + 4, y + 3.2, 1, 3);
  g.fillStyle = '#8f4723'; g.fillRect(x + 0.8, y + 1.6, 4.4, 1); g.fillRect(x + 2.4, y + 0.6, 1.2, 1);
  g.fillStyle = '#24211c'; g.fillRect(face > 0 ? x + 3.6 : x + 1.5, y + 4, 0.9, 1.1);
  g.fillStyle = '#5e3a22'; g.fillRect(x + 0.6, y + 7.6, 1.6, 0.4); g.fillRect(x + 3.8, y + 7.6, 1.6, 0.4);
  g.restore();
}

export const TILE_ART = { '#': drawStone, '>': drawBelt, '<': drawBelt, B: drawBell, '^': drawSpikes, F: drawFlag };

export function drawBackdrop(g, camX, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#e6eff2'); sky.addColorStop(1, '#fbf8f1');
  g.fillStyle = sky; g.fillRect(camX, 0, w, h);
  g.fillStyle = '#dde7e3';
  g.fillRect(camX, h - 12, w, 12);
  const first = Math.floor((camX * 0.6) / 48) - 1;
  for (let i = first; i < first + w / 48 + 3; i++) {
    g.beginPath(); g.ellipse(i * 48 + camX * 0.4, h - 12, 40, 34, 0, Math.PI, 0); g.fill();
  }
}

export function drawTiles(g, lv, ram, camX, tiles) {
  const t0 = Math.max(0, Math.floor(camX / 8)), t1 = Math.min(lv.w, t0 + tiles + 1);
  const info = { frame: u16(ram, ADDR.FRAME), rung: ram[ADDR.BELL] !== 0 };
  for (let ty = 0; ty < lv.h; ty++) {
    for (let tx = t0; tx < t1; tx++) {
      const tile = lv.tiles[ty][tx];
      const art = TILE_ART[tile];
      if (!art) continue;
      const above = ty > 0 ? lv.tiles[ty - 1][tx] : '#';
      art(g, tx * 8, ty * 8, { ...info, tile, odd: ty % 2 === 1, grass: !'#<>^'.includes(above) });
    }
  }
}

export function drawItems(g, lv, ram) {
  lv.gems.forEach((gem, i) => {
    if (!(ram[ADDR.TAKEN] & (1 << i))) drawGem(g, gem.tx * 8, gem.ty * 8);
  });
  if (!lv.dropKind) return;
  const drop = ram[ADDR.DROP];
  // Every drop place stays outlined and numbered, so "drop place 3" always points at something.
  lv.dropCols.forEach((col, i) => {
    if (i !== drop) drawDropPlace(g, col * 8, lv.dropRow * 8, { kind: lv.dropKind });
    g.fillStyle = PAL.crate; g.font = '5px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(String(i), col * 8 + 4, lv.dropRow * 8 - 1.5);
  });
  if (drop === 255) return;
  const x = lv.dropCols[drop] * 8, y = lv.dropRow * 8;
  if (lv.dropKind === 'block') drawCrate(g, x, y);
  const taken = ram[ADDR.TAKEN] & (1 << lv.gems.length);
  if (lv.dropKind === 'gem' && !taken) drawGem(g, x, y);
}


// One picture of the game: the camera follows Kettle as in the player, unless camX is given (game pixels).
// The canvas transform is set to k canvas pixels per game pixel. Returns the camera's x.
export function drawWorld(g, { level, ram, k, tiles, face = 1, camX = null }) {
  const viewW = tiles * 8, levelW = level.w * 8, h = level.h * 8;
  const kx = u16(ram, ADDR.X) / SUB, ky = u16(ram, ADDR.Y) / SUB;
  const cam = camX ?? Math.round(clamp(kx + 3 - viewW * 0.42, 0, levelW - viewW) * k) / k;
  g.setTransform(k, 0, 0, k, -cam * k, 0);
  drawBackdrop(g, cam, viewW, h);
  drawTiles(g, level, ram, cam, tiles);
  drawItems(g, level, ram);
  drawKettle(g, kx, ky, { face, dead: ram[ADDR.DEAD] !== 0 });
  return cam;
}
