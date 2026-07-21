const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "images");
fs.mkdirSync(OUT, { recursive: true });

const INK = "#1B1A14";
const CARD = "#ECE4D4";
const BGSOFT = "#F6F1E8";
const OLIVE = "#55603A";
const LINE = "#E1D8C6";

const WOODS = {
  rotan: "#C99A66",
  jati: "#9B6B3A",
  walnut: "#5A3D2B",
  linen: "#9A968A",
};

function bg(w, h, id) {
  return `
  <defs>
    <linearGradient id="grad${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${CARD}"/>
      <stop offset="1" stop-color="${BGSOFT}"/>
    </linearGradient>
    <pattern id="grain${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
      <line x1="0" y1="0" x2="0" y2="14" stroke="${INK}" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#grad${id})"/>
  <rect width="${w}" height="${h}" fill="url(#grain${id})"/>`;
}

function shadow(cx, cy, rx, ry) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK}" opacity="0.08"/>`;
}

function svg(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;
}

// ---------- furniture icons (centered around x=240 unless noted) ----------

function chairLounge(accent, ox = 0, oy = 0, scale = 1) {
  const t = `translate(${ox},${oy}) scale(${scale})`;
  return `
  <g transform="${t}">
    ${shadow(240, 384, 130, 16)}
    <rect x="150" y="120" width="180" height="170" rx="70" fill="none" stroke="${INK}" stroke-width="3"/>
    <rect x="120" y="228" width="30" height="94" rx="15" fill="${CARD}" stroke="${INK}" stroke-width="3"/>
    <rect x="330" y="228" width="30" height="94" rx="15" fill="${CARD}" stroke="${INK}" stroke-width="3"/>
    <rect x="142" y="250" width="196" height="66" rx="20" fill="${accent}" opacity="0.92"/>
    <line x1="165" y1="316" x2="150" y2="378" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="315" y1="316" x2="330" y2="378" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="195" y1="316" x2="188" y2="378" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="285" y1="316" x2="292" y2="378" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
  </g>`;
}

function chairDining(accent = WOODS.jati) {
  return `
  <g>
    ${shadow(240, 384, 90, 14)}
    <rect x="188" y="108" width="104" height="148" rx="12" fill="none" stroke="${INK}" stroke-width="3"/>
    <line x1="212" y1="118" x2="212" y2="246" stroke="${INK}" stroke-width="2" opacity="0.55"/>
    <line x1="240" y1="118" x2="240" y2="246" stroke="${INK}" stroke-width="2" opacity="0.55"/>
    <line x1="268" y1="118" x2="268" y2="246" stroke="${INK}" stroke-width="2" opacity="0.55"/>
    <rect x="168" y="252" width="144" height="26" rx="7" fill="${accent}"/>
    <line x1="178" y1="278" x2="168" y2="378" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="302" y1="278" x2="312" y2="378" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="196" y1="278" x2="192" y2="378" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="284" y1="278" x2="288" y2="378" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
  </g>`;
}

function tableCoffee(accent = WOODS.jati) {
  return `
  <g>
    ${shadow(240, 372, 150, 15)}
    <rect x="80" y="212" width="320" height="28" rx="10" fill="${accent}" stroke="${INK}" stroke-width="2.5"/>
    <rect x="104" y="240" width="20" height="112" fill="${INK}" opacity="0.85"/>
    <rect x="356" y="240" width="20" height="112" fill="${INK}" opacity="0.85"/>
  </g>`;
}

function tableDining(accent = WOODS.jati) {
  return `
  <g>
    ${shadow(240, 378, 190, 15)}
    <rect x="40" y="190" width="400" height="26" rx="9" fill="${accent}" stroke="${INK}" stroke-width="2.5"/>
    <line x1="80" y1="216" x2="72" y2="358" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <line x1="400" y1="216" x2="408" y2="358" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <line x1="170" y1="216" x2="166" y2="358" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <line x1="310" y1="216" x2="314" y2="358" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  </g>`;
}

function cabinet(accent = WOODS.jati) {
  return `
  <g>
    ${shadow(240, 388, 120, 14)}
    <rect x="140" y="86" width="200" height="284" rx="14" fill="${BGSOFT}" stroke="${INK}" stroke-width="3"/>
    <line x1="240" y1="98" x2="240" y2="358" stroke="${INK}" stroke-width="2.5"/>
    <rect x="156" y="102" width="70" height="252" rx="8" fill="none" stroke="${INK}" stroke-width="1.5" opacity="0.5"/>
    <rect x="254" y="102" width="70" height="252" rx="8" fill="none" stroke="${INK}" stroke-width="1.5" opacity="0.5"/>
    <circle cx="222" cy="228" r="4.5" fill="${accent}"/>
    <circle cx="258" cy="228" r="4.5" fill="${accent}"/>
    <line x1="160" y1="370" x2="156" y2="386" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <line x1="320" y1="370" x2="324" y2="386" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  </g>`;
}

function shelf(accent = WOODS.jati) {
  const books = (x, y, colors) => colors
    .map((c, i) => `<rect x="${x + i * 15}" y="${y - (14 + (i % 3) * 8)}" width="11" height="${14 + (i % 3) * 8}" fill="${c}" opacity="0.9"/>`)
    .join("");
  return `
  <g>
    ${shadow(240, 396, 110, 13)}
    <rect x="150" y="66" width="180" height="320" rx="10" fill="none" stroke="${INK}" stroke-width="3"/>
    <line x1="150" y1="146" x2="330" y2="146" stroke="${INK}" stroke-width="2.5"/>
    <line x1="150" y1="220" x2="330" y2="220" stroke="${INK}" stroke-width="2.5"/>
    <line x1="150" y1="300" x2="330" y2="300" stroke="${INK}" stroke-width="2.5"/>
    ${books(168, 144, [OLIVE, accent, WOODS.walnut, CARD, accent])}
    ${books(168, 298, [accent, CARD, OLIVE, accent])}
  </g>`;
}

function bench(accent = WOODS.jati) {
  return `
  <g>
    ${shadow(240, 342, 160, 14)}
    <rect x="60" y="248" width="360" height="30" rx="12" fill="${accent}" stroke="${INK}" stroke-width="2.5"/>
    <line x1="90" y1="278" x2="86" y2="332" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="130" y1="278" x2="128" y2="332" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="350" y1="278" x2="354" y2="332" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="310" y1="278" x2="312" y2="332" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
  </g>`;
}

function tableSide(accent = WOODS.jati) {
  return `
  <g>
    ${shadow(240, 372, 80, 12)}
    <ellipse cx="240" cy="192" rx="88" ry="18" fill="${accent}" stroke="${INK}" stroke-width="2.5"/>
    <rect x="226" y="210" width="28" height="130" fill="${INK}" opacity="0.82"/>
    <ellipse cx="240" cy="352" rx="56" ry="9" fill="${INK}" opacity="0.6"/>
  </g>`;
}

// ---------- product / variant files ----------

const PRODUCTS = [
  { file: "lk-p1", draw: () => chairLounge(WOODS.rotan) },
  { file: "lk-p2", draw: () => chairDining(WOODS.jati) },
  { file: "lk-p3", draw: () => tableCoffee(WOODS.jati) },
  { file: "lk-p4", draw: () => tableDining(WOODS.walnut) },
  { file: "lk-p5", draw: () => cabinet(WOODS.jati) },
  { file: "lk-p6", draw: () => shelf(WOODS.jati) },
  { file: "lk-p7", draw: () => bench(WOODS.walnut) },
  { file: "lk-p8", draw: () => tableSide(WOODS.jati) },
];

for (const p of PRODUCTS) {
  const out = svg(480, 480, bg(480, 480, p.file) + p.draw());
  fs.writeFileSync(path.join(OUT, `${p.file}.svg`), out);
  console.log("wrote", p.file);
}

const VARIANTS = [
  { file: "lk-spot-rotan", accent: WOODS.rotan },
  { file: "lk-spot-jati", accent: WOODS.jati },
  { file: "lk-spot-walnut", accent: WOODS.walnut },
  { file: "lk-spot-linen", accent: WOODS.linen },
];
for (const v of VARIANTS) {
  const out = svg(480, 480, bg(480, 480, v.file) + chairLounge(v.accent));
  fs.writeFileSync(path.join(OUT, `${v.file}.svg`), out);
  console.log("wrote", v.file);
}

// PDP hero reuses p1 art (same product) — separate file for clarity
fs.writeFileSync(
  path.join(OUT, "lk-pdp.svg"),
  svg(480, 480, bg(480, 480, "pdp") + chairLounge(WOODS.rotan))
);

// ---------- hero (wide room scene) ----------

const heroInner = `
  ${bg(960, 480, "hero")}
  <rect x="0" y="340" width="960" height="140" fill="${BGSOFT}" opacity="0.6"/>
  <line x1="0" y1="340" x2="960" y2="340" stroke="${LINE}" stroke-width="1.5"/>
  <ellipse cx="300" cy="388" rx="220" ry="30" fill="${INK}" opacity="0.06"/>
  ${chairLounge(WOODS.rotan, -30, 20, 0.9)}
  <g transform="translate(560,60)">
    ${tableSide(WOODS.jati)}
  </g>
  <g transform="translate(700,10) scale(0.7)">
    <line x1="240" y1="120" x2="240" y2="260" stroke="${OLIVE}" stroke-width="6" stroke-linecap="round"/>
    <ellipse cx="240" cy="110" rx="46" ry="60" fill="${OLIVE}" opacity="0.85"/>
    <ellipse cx="205" cy="140" rx="34" ry="46" fill="${OLIVE}" opacity="0.7"/>
    <ellipse cx="278" cy="150" rx="30" ry="40" fill="${OLIVE}" opacity="0.7"/>
  </g>
`;
fs.writeFileSync(path.join(OUT, "lk-hero.svg"), svg(960, 480, heroInner));
console.log("wrote lk-hero");

// ---------- trust / lifestyle images ----------

function materialGrain() {
  const lines = [];
  for (let i = 0; i < 10; i++) {
    const y = 60 + i * 38 + (i % 2 === 0 ? 6 : -6);
    lines.push(
      `<path d="M20 ${y} Q 240 ${y - 22} 460 ${y}" fill="none" stroke="${i % 3 === 0 ? WOODS.walnut : WOODS.jati}" stroke-width="${3 + (i % 3)}" opacity="${0.25 + (i % 4) * 0.1}"/>`
    );
  }
  return `<g>${lines.join("")}</g>`;
}

const trust = [
  { file: "lk-trust1", inner: cabinet(WOODS.jati) },
  { file: "lk-trust2", inner: materialGrain() },
  { file: "lk-trust3", inner: chairDining(WOODS.walnut) },
  {
    file: "lk-trust4",
    inner: `<g transform="translate(0,20) scale(0.85)">${tableDining(WOODS.jati)}</g>`,
  },
];
for (const t of trust) {
  fs.writeFileSync(
    path.join(OUT, `${t.file}.svg`),
    svg(480, 480, bg(480, 480, t.file) + t.inner)
  );
  console.log("wrote", t.file);
}

// footer "ruang kerja" — small desk scene
const deskInner = `
  <g>
    ${shadow(240, 372, 150, 15)}
    <rect x="90" y="230" width="300" height="20" rx="6" fill="${WOODS.jati}" stroke="${INK}" stroke-width="2"/>
    <line x1="110" y1="250" x2="106" y2="360" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <line x1="370" y1="250" x2="374" y2="360" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <rect x="150" y="170" width="90" height="58" rx="4" fill="${INK}" opacity="0.85"/>
    <rect x="156" y="176" width="78" height="42" rx="2" fill="${BGSOFT}"/>
    <line x1="265" y1="228" x2="265" y2="150" stroke="${OLIVE}" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="265" cy="140" rx="22" ry="14" fill="${OLIVE}" opacity="0.85"/>
  </g>`;
fs.writeFileSync(
  path.join(OUT, "lk-footer-desk.svg"),
  svg(480, 480, bg(480, 480, "footer") + deskInner)
);
console.log("wrote lk-footer-desk");

console.log("done");
