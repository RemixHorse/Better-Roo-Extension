// Generates extension icons at 16, 48, and 128px.
// Run: node scripts/generate-icons.js

const { Jimp } = require('jimp');
const { mkdirSync } = require('fs');
const { resolve } = require('path');

const outDir = resolve(__dirname, '../src/icons');
mkdirSync(outDir, { recursive: true });

const TEAL  = 0x00CCBCff;
const WHITE = 0xffffffff;
const CLEAR = 0x00000000;

function dist(x, y, cx, cy) {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

function inRoundedRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const cx = x < r ? r : x > w - 1 - r ? w - 1 - r : x;
  const cy = y < r ? r : y > h - 1 - r ? h - 1 - r : y;
  return dist(x, y, cx, cy) <= r;
}

function setPixel(image, size, px, py, color) {
  px = Math.round(px); py = Math.round(py);
  if (px >= 0 && py >= 0 && px < size && py < size) {
    image.setPixelColor(color, px, py);
  }
}

function fillRect(image, size, x, y, w, h, color = WHITE) {
  for (let py = Math.floor(y); py <= Math.ceil(y + h); py++) {
    for (let px = Math.floor(x); px <= Math.ceil(x + w); px++) {
      setPixel(image, size, px, py, color);
    }
  }
}

function drawLine(image, size, x1, y1, x2, y2, sw) {
  const steps = Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 3);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ox = x1 + (x2 - x1) * t;
    const oy = y1 + (y2 - y1) * t;
    fillRect(image, size, ox - sw / 2, oy - sw / 2, sw, sw);
  }
}

function drawArc(image, size, cx, cy, rw, rh, a0, a1, sw) {
  const steps = Math.ceil(Math.max(rw, rh) * Math.abs(a1 - a0) * 4);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    const ox = cx + rw * Math.cos(a);
    const oy = cy + rh * Math.sin(a);
    fillRect(image, size, ox - sw / 2, oy - sw / 2, sw, sw);
  }
}

// Draw "BR" monogram centred in the icon
function drawMonogram(image, size) {
  const s  = Math.max(1, size * 0.065); // stroke width
  const lh = size * 0.50;               // letter height
  const lw = lh * 0.55;                 // letter width
  const gap = size * 0.05;
  const totalW = lw * 2 + gap;
  const lx = (size - totalW) / 2;       // left edge of B
  const ty = (size - lh) / 2;           // top of letters

  // --- B ---
  const bx = lx;
  fillRect(image, size, bx, ty, s, lh);                      // stem
  fillRect(image, size, bx, ty, lw * 0.7, s);               // top bar
  fillRect(image, size, bx, ty + lh * 0.5 - s/2, lw * 0.7, s); // mid bar
  fillRect(image, size, bx, ty + lh - s, lw * 0.7, s);     // bottom bar
  // top bump
  const br1x = bx + lw * 0.7 - s/2;
  const br1y = ty + lh * 0.25;
  drawArc(image, size, br1x, br1y, lw * 0.28, lh * 0.25, -Math.PI/2, Math.PI/2, s);
  // bottom bump
  const br2x = bx + lw * 0.7 - s/2;
  const br2y = ty + lh * 0.75;
  drawArc(image, size, br2x, br2y, lw * 0.3, lh * 0.25, -Math.PI/2, Math.PI/2, s);

  // --- R ---
  const rx = lx + lw + gap;
  fillRect(image, size, rx, ty, s, lh);                      // stem
  fillRect(image, size, rx, ty, lw * 0.8, s);               // top bar
  fillRect(image, size, rx, ty + lh * 0.48, lw * 0.8, s);  // mid bar
  // bump
  const rrx = rx + lw * 0.8 - s/2;
  const rry = ty + lh * 0.24;
  drawArc(image, size, rrx, rry, lw * 0.28, lh * 0.24, -Math.PI/2, Math.PI/2, s);
  // diagonal leg
  drawLine(image, size, rx + lw * 0.8, ty + lh * 0.48 + s, rx + lw, ty + lh, s);
}

async function makeIcon(size) {
  const image = new Jimp({ width: size, height: size, color: CLEAR });
  const r = Math.round(size * 0.2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y, size, size, r)) {
        image.setPixelColor(TEAL, x, y);
      }
    }
  }

  if (size >= 15) {
    drawMonogram(image, size);
  } else {
    // 16px: simple white dot
    const dotR = size * 0.22;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (dist(x, y, size / 2, size / 2) <= dotR) {
          image.setPixelColor(WHITE, x, y);
        }
      }
    }
  }

  const path = resolve(outDir, `icon${size}.png`);
  await image.write(path);
  console.log(`wrote ${path}`);
}

(async () => {
  await makeIcon(16);
  await makeIcon(48);
  await makeIcon(128);
})();
