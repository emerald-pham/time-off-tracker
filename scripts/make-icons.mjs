// Draws the home-screen icons (a calendar with one Day Off marked) as PNGs,
// with no dependencies. Run `node scripts/make-icons.mjs` after changing it.
// public/icon.svg is the same drawing for browsers that take SVG.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const ACCENT = [0x2f, 0x5d, 0x8a];
const WHITE = [0xff, 0xff, 0xff];
const HEADER = [0xa9, 0xc3, 0xdc];
const MARK = [0xe0, 0xa6, 0x4a];

/** Shapes in drawing order, in units of the icon's width (0..1). */
const shapes = [
  { x: 0.2, y: 0.26, w: 0.6, h: 0.54, r: 0.07, color: WHITE },
  { x: 0.2, y: 0.26, w: 0.6, h: 0.14, r: 0.07, color: HEADER, squareBottom: true },
  { x: 0.335, y: 0.19, w: 0.06, h: 0.14, r: 0.03, color: WHITE },
  { x: 0.605, y: 0.19, w: 0.06, h: 0.14, r: 0.03, color: WHITE },
];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    shapes.push({
      x: 0.28 + col * 0.155,
      y: 0.46 + row * 0.105,
      w: 0.13,
      h: 0.08,
      r: 0.02,
      color: row === 1 && col === 2 ? MARK : ACCENT,
    });
  }
}

function inside(s, px, py) {
  if (px < s.x || px > s.x + s.w || py < s.y || py > s.y + s.h) return false;
  const r = s.r;
  const cx = Math.min(Math.max(px, s.x + r), s.x + s.w - r);
  const bottomLimit = s.squareBottom ? s.y + s.h : s.y + s.h - r;
  const cy = Math.min(Math.max(py, s.y + r), bottomLimit);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function colorAt(px, py) {
  let color = ACCENT;
  for (const s of shapes) if (inside(s, px, py)) color = s.color;
  return color;
}

function render(size) {
  const SS = 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          sum[0] += c[0];
          sum[1] += c[1];
          sum[2] += c[2];
        }
      }
      for (let i = 0; i < 3; i++) row[1 + x * 3 + i] = Math.round(sum[i] / (SS * SS));
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", render(192));
writeFileSync("public/icons/icon-512.png", render(512));
writeFileSync("public/icons/apple-touch-icon.png", render(180));
