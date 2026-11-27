// Supplied: an RGBA8 picture as the bytes of a PNG file.
// Row 0 of the framebuffer is the bottom row and a PNG starts at the
// top, so rows are written in reverse. The pixels are stored without
// compression (deflate "stored" blocks): simple, no packages, and a
// 160 x 120 picture is still only about 77 KB.

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const x of bytes) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const u32 = (n) =>
  [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type, data) {
  const body = new Uint8Array(4 + data.length);
  body.set([...type].map((ch) => ch.charCodeAt(0)));
  body.set(data, 4);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

// zlib wrapper around stored (uncompressed) deflate blocks.
function zlibStored(raw) {
  const out = [0x78, 0x01];
  for (let at = 0; at < raw.length || at === 0; at += 65535) {
    const part = raw.subarray(at, at + 65535);
    const last = at + 65535 >= raw.length ? 1 : 0;
    const n = part.length;
    out.push(last, n & 255, n >>> 8, ~n & 255, (~n >>> 8) & 255);
    for (const b of part) out.push(b);
    if (last) break;
  }
  out.push(...u32(adler32(raw)));
  return Uint8Array.from(out);
}

export function encodePNG(w, h, rgba) {
  const raw = new Uint8Array(h * (1 + w * 4));
  for (let row = 0; row < h; row++) {
    const y = h - 1 - row; // top row of the file = highest y
    raw[row * (1 + w * 4)] = 0; // filter: none
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4),
      row * (1 + w * 4) + 1);
  }
  const head = [...u32(w), ...u32(h), 8, 6, 0, 0, 0];
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', head),
    ...chunk('IDAT', zlibStored(raw)),
    ...chunk('IEND', []),
  ]);
}

// Blow a small picture up by an integer factor so it can be seen.
export function upscale(w, h, rgba, k) {
  const out = new Uint8Array(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) {
      const from = (Math.floor(y / k) * w + Math.floor(x / k)) * 4;
      out.set(rgba.subarray(from, from + 4), (y * w * k + x) * 4);
    }
  }
  return out;
}
