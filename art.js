/* ──────────────────────────────────────────────────────────────
   THE ONLY COPY — art.js
   Procedural, original illustrations for every image slot.
   Each scene id maps to a composition; compositions are built
   from a small shared vocabulary (dunes, planet, sun, figure,
   rose, fox, wheat, well, trains, shelf…) with per-scene
   variations of mood, time of day, star density and sun height.
   Output: an SVG string (≈3–12 KB), viewBox 1000×1400, portrait-
   safe (subject in the upper two thirds, quiet sand below).
   Motion hooks (CSS/GSAP in app.js): .art-stars, .art-sun,
   .art-wheat, .art-scarf, .art-pulse, .art-glow
   ────────────────────────────────────────────────────────────── */
window.ART = (function () {
  "use strict";
  const W = 1000, H = 1400;

  /* ── palette: sand / bone / indigo, one gold, rose only for roses ── */
  const C = {
    bone: "#f3eee2", sand: "#d9c39a", gold: "#e8c872", rose: "#c84a5e", roseDeep: "#8e2a3c", roseLight: "#e88a98",
    ink: "#070b1f"
  };
  const MOODS = {
    day:   { sky: ["#23264a", "#6e5a52", "#d8b08a"], glow: "#f0d6a0", dunes: ["#cdb286", "#ad8f62", "#846748", "#54412d"], ground: "#3a2d20", starA: 0.35 },
    dusk:  { sky: ["#10112e", "#4a2a48", "#d98a62"], glow: "#f2b07a", dunes: ["#7a4a5c", "#55334a", "#39233b", "#1f1529"], ground: "#15101f", starA: 0.6 },
    night: { sky: ["#04071a", "#121a44", "#283566"], glow: "#8fa0d8", dunes: ["#2c3568", "#1f274f", "#161c3b", "#0c1028"], ground: "#080b1e", starA: 1 },
    deep:  { sky: ["#02040b", "#0a0f2c", "#171b3c"], glow: "#5a62a0", dunes: ["#1d2348", "#151a38", "#0d1128", "#070a18"], ground: "#03050c", starA: 1 }
  };

  /* ── tiny helpers ── */
  const r1 = n => Math.round(n * 10) / 10;
  function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { const A = hex(a), B = hex(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
  function smooth(pts) {
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return d;
  }

  /* ── shared defs ── */
  function defs(id, m, extra) {
    return `<defs>
<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.sky[0]}" stop-opacity=".55"/><stop offset=".55" stop-color="${m.sky[1]}" stop-opacity=".9"/><stop offset="1" stop-color="${m.sky[2]}"/></linearGradient>
<radialGradient id="${id}-glow"><stop offset="0" stop-color="${m.glow}" stop-opacity=".9"/><stop offset=".4" stop-color="${m.glow}" stop-opacity=".25"/><stop offset="1" stop-color="${m.glow}" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}-sunglow"><stop offset="0" stop-color="#fff3d0" stop-opacity=".95"/><stop offset=".35" stop-color="${C.gold}" stop-opacity=".4"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}-star"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".3" stop-color="${C.bone}" stop-opacity=".6"/><stop offset="1" stop-color="${C.bone}" stop-opacity="0"/></radialGradient>
<filter id="${id}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" stitchTiles="stitch" result="n"/><feColorMatrix in="n" values="0 0 0 0 .95 0 0 0 0 .92 0 0 0 0 .85 0 0 0 .6 0"/></filter>
<filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
${extra || ""}</defs>`;
  }
  const sky = id => `<rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>`;
  const grain = id => `<rect width="${W}" height="${H}" filter="url(#${id}-grain)" opacity=".11" style="mix-blend-mode:soft-light"/>`;
  const horizonGlow = (id, cx, cy, rx, ry, op) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}-glow)" opacity="${op == null ? 0.8 : op}"/>`;

  /* stars: tiny circles across the upper sky (grouped by tone to stay light); one optional bright pulsing star */
  function stars(id, rnd, n, yMax, alpha, bright) {
    const pale = [], dim = [], warm = [];
    for (let i = 0; i < n; i++) {
      const c = `<circle cx="${r1(rnd() * W)}" cy="${r1(rnd() * yMax)}" r="${r1(0.6 + rnd() * 1.3)}"/>`;
      const t = rnd();
      (t < 0.15 ? warm : t < 0.55 ? dim : pale).push(c);
    }
    let s = `<g class="art-stars" opacity="${alpha}"><g fill="${C.bone}" opacity=".95">${pale.join("")}</g><g fill="${C.bone}" opacity=".45">${dim.join("")}</g><g fill="${C.gold}" opacity=".8">${warm.join("")}</g></g>`;
    if (bright) {
      const [bx, by, br] = bright;
      if (br > 0) s += `<g class="art-pulse" style="transform-origin:${bx}px ${by}px"><circle cx="${bx}" cy="${by}" r="${br * 9}" fill="url(#${id}-star)" opacity=".55"/><path d="M${bx} ${by - br * 5}L${bx + br * .8} ${by}L${bx} ${by + br * 5}L${bx - br * .8} ${by}Z M${bx - br * 5} ${by}L${bx} ${by - br * .8}L${bx + br * 5} ${by}L${bx} ${by + br * .8}Z" fill="#fff" opacity=".9"/><circle cx="${bx}" cy="${by}" r="${br}" fill="#fff"/></g>`;
    }
    return s;
  }

  /* dunes: layered ridges from back to front, each with a vertical gradient */
  function dunes(id, m, rnd, opts) {
    opts = opts || {};
    const base = opts.horizon || 880;              // where the farthest crest sits
    const layers = opts.layers || 4;
    let g = "", d = "";
    for (let i = 0; i < layers; i++) {
      const yb = base + i * (opts.step || 110);
      const amp = (opts.amp || 70) * (1 + i * 0.35);
      const pts = [];
      const ph = rnd() * Math.PI * 2, k = 1.1 + i * 0.45 + rnd() * 0.5;
      let x = -80;
      while (x <= W + 80) { pts.push([x, yb + amp * (Math.sin((x / W) * Math.PI * k + ph) * 0.8 + (rnd() - 0.5) * 0.7)]); x += 170 + rnd() * 150; }
      pts.push([W + 120, yb + amp * Math.sin(((W + 120) / W) * Math.PI * k + ph) * 0.8]);
      const col = m.dunes[Math.min(i, m.dunes.length - 1)];
      g += `<linearGradient id="${id}-d${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(col, C.bone, 0.08)}"/><stop offset="1" stop-color="${mix(col, m.ground, 0.75)}"/></linearGradient>`;
      d += `<path d="${smooth(pts)}L${W + 120} ${H + 50}L-80 ${H + 50}Z" fill="url(#${id}-d${i})"/>`;
      // a soft crest highlight on the lit side
      if (i < layers - 1) d += `<path d="${smooth(pts.map(p => [p[0], p[1] + 2]))}" fill="none" stroke="${C.bone}" stroke-opacity=".10" stroke-width="3"/>`;
    }
    return { defs: g, body: d };
  }

  /* small figure from behind, long trailing scarf (never a face) */
  function figure(x, y, s, col, scarf) {
    // y = feet level; s ≈ height scale (1 → ~120 units tall)
    const head = `<circle cx="${x}" cy="${y - 104 * s}" r="${11 * s}" fill="${col}"/>`;
    const body = `<path d="M${x - 12 * s} ${y - 90 * s}Q${x} ${y - 98 * s} ${x + 12 * s} ${y - 90 * s}L${x + 15 * s} ${y - 30 * s}L${x + 6 * s} ${y - 30 * s}L${x + 5 * s} ${y}L${x - 5 * s} ${y}L${x - 6 * s} ${y - 30 * s}L${x - 15 * s} ${y - 30 * s}Z" fill="${col}"/>`;
    const scarfD = `M${x - 6 * s} ${y - 90 * s}C${x - 30 * s} ${y - 92 * s} ${x - 52 * s} ${y - 74 * s} ${x - 76 * s} ${y - 80 * s}C${x - 96 * s} ${y - 85 * s} ${x - 112 * s} ${y - 70 * s} ${x - 130 * s} ${y - 72 * s}`;
    const sc = `<g class="art-scarf" style="transform-origin:${x - 6 * s}px ${y - 90 * s}px"><path d="${scarfD}" fill="none" stroke="${scarf || C.gold}" stroke-width="${6 * s}" stroke-linecap="round" opacity=".92"/></g>`;
    return `<g>${sc}${head}${body}</g>`;
  }

  function sun(id, cx, cy, r, op) {
    return `<g class="art-sun"><circle cx="${cx}" cy="${cy}" r="${r * 3.2}" fill="url(#${id}-sunglow)" opacity="${op == null ? 0.85 : op}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff6dc"/><circle cx="${cx - r * .2}" cy="${cy - r * .2}" r="${r * .55}" fill="#fff" opacity=".35" filter="url(#${id}-soft)"/></g>`;
  }
  function moon(cx, cy, r) {
    return `<g><circle cx="${cx}" cy="${cy}" r="${r * 4}" fill="${C.bone}" opacity=".05"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.bone}" opacity=".9"/><circle cx="${cx + r * .45}" cy="${cy - r * .2}" r="${r * .82}" fill="${C.ink}" opacity=".85"/></g>`;
  }

  /* a tiny planet: sphere lit from upper left, three small volcanoes, curved horizon */
  function planet(id, cx, cy, r, m, opts) {
    opts = opts || {};
    const light = mix(m.dunes[0], C.bone, 0.25), dark = mix(m.dunes[3], C.ink, 0.5);
    const d = `<radialGradient id="${id}-pl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${m.dunes[1]}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`;
    let b = `<circle cx="${cx}" cy="${cy}" r="${r * 1.25}" fill="url(#${id}-glow)" opacity=".35"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-pl)"/>`;
    // volcanoes on the upper surface at given angles (deg, from top = 0)
    const vol = opts.volcanoes || [-48, -8, 36];
    const sizes = opts.volSizes || [1, 0.7, 0.85];
    vol.forEach((a, i) => {
      const rad = (a - 90) * Math.PI / 180, s = sizes[i] * r * 0.11;
      const px = cx + Math.cos(rad) * r, py = cy + Math.sin(rad) * r;
      const smoke = i !== 1 ? `<circle cx="${s * .1}" cy="${-s * 1.7}" r="${s * .22}" fill="${C.bone}" opacity=".45"/><circle cx="${s * .4}" cy="${-s * 2.2}" r="${s * .16}" fill="${C.bone}" opacity=".28"/>` : "";
      b += `<g transform="translate(${r1(px)} ${r1(py)}) rotate(${a})"><path d="M${-s * 1.6} ${s * .4}Q${-s * .9} ${-s * .4} ${-s * .5} ${-s * 1.15}L${s * .5} ${-s * 1.15}Q${s * .9} ${-s * .4} ${s * 1.6} ${s * .4}Z" fill="${dark}"/><path d="M${-s * .5} ${-s * 1.15}L${s * .5} ${-s * 1.15}L${s * .28} ${-s * .85}L${-s * .28} ${-s * .85}Z" fill="${C.gold}" opacity=".75"/>${smoke}</g>`;
    });
    return { defs: d, body: b };
  }

  /* a rose: stem, two leaves, layered bloom; optional glass dome */
  function rose(id, x, y, s, dome) {
    const stem = `<path d="M${x} ${y}C${x + 4 * s} ${y - 40 * s} ${x - 6 * s} ${y - 80 * s} ${x} ${y - 118 * s}" fill="none" stroke="#5c7a4a" stroke-width="${3.2 * s}" stroke-linecap="round"/>`;
    const leaves = `<path d="M${x} ${y - 50 * s}C${x - 10 * s} ${y - 70 * s} ${x - 34 * s} ${y - 66 * s} ${x - 38 * s} ${y - 50 * s}C${x - 24 * s} ${y - 38 * s} ${x - 6 * s} ${y - 42 * s} ${x} ${y - 50 * s}Z" fill="#6c8a56"/><path d="M${x} ${y - 78 * s}C${x + 10 * s} ${y - 96 * s} ${x + 32 * s} ${y - 92 * s} ${x + 36 * s} ${y - 76 * s}C${x + 22 * s} ${y - 66 * s} ${x + 6 * s} ${y - 70 * s} ${x} ${y - 78 * s}Z" fill="#6c8a56"/>`;
    const thorns = `<path d="M${x + 1 * s} ${y - 28 * s}l${7 * s} ${-5 * s}M${x - 2 * s} ${y - 96 * s}l${-7 * s} ${-4 * s}" stroke="#5c7a4a" stroke-width="${2 * s}" stroke-linecap="round"/>`;
    const by = y - 128 * s;
    const bloom = `<g transform="translate(${x} ${by})">
<ellipse cx="0" cy="${8 * s}" rx="${26 * s}" ry="${18 * s}" fill="${C.roseDeep}"/>
<path d="M${-24 * s} ${6 * s}C${-30 * s} ${-14 * s} ${-14 * s} ${-28 * s} ${-2 * s} ${-18 * s}C${4 * s} ${-30 * s} ${24 * s} ${-22 * s} ${22 * s} ${-2 * s}C${30 * s} ${8 * s} ${14 * s} ${22 * s} ${0} ${18 * s}C${-14 * s} ${24 * s} ${-28 * s} ${16 * s} ${-24 * s} ${6 * s}Z" fill="${C.rose}"/>
<path d="M${-12 * s} ${2 * s}C${-14 * s} ${-12 * s} ${-2 * s} ${-18 * s} ${6 * s} ${-10 * s}C${14 * s} ${-14 * s} ${18 * s} ${2 * s} ${10 * s} ${8 * s}C${4 * s} ${14 * s} ${-8 * s} ${12 * s} ${-12 * s} ${2 * s}Z" fill="${C.roseLight}" opacity=".85"/>
<path d="M${-4 * s} ${-2 * s}C${-4 * s} ${-8 * s} ${4 * s} ${-10 * s} ${6 * s} ${-4 * s}C${8 * s} ${2 * s} ${0} ${6 * s} ${-4 * s} ${-2 * s}Z" fill="${C.rose}"/>
</g>`;
    let dm = "";
    if (dome) {
      const dr = 74 * s, top = by - 60 * s;
      dm = `<path d="M${x - dr} ${y + 2 * s}L${x - dr} ${top + dr}A${dr} ${dr} 0 0 1 ${x + dr} ${top + dr}L${x + dr} ${y + 2 * s}Z" fill="${C.bone}" opacity=".07"/><path d="M${x - dr} ${y + 2 * s}L${x - dr} ${top + dr}A${dr} ${dr} 0 0 1 ${x + dr} ${top + dr}L${x + dr} ${y + 2 * s}" fill="none" stroke="${C.bone}" stroke-opacity=".5" stroke-width="${2 * s}"/><path d="M${x - dr * .62} ${top + dr * .55}A${dr * .8} ${dr * .8} 0 0 1 ${x - dr * .1} ${top + dr * .08}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="${3 * s}" stroke-linecap="round"/><ellipse cx="${x}" cy="${y + 2 * s}" rx="${dr}" ry="${8 * s}" fill="none" stroke="${C.bone}" stroke-opacity=".35" stroke-width="${2 * s}"/>`;
    }
    return `<g>${stem}${thorns}${leaves}${bloom}${dm}</g>`;
  }

  /* fox silhouette: seated, profile, triangular ears, bushy tail */
  function fox(x, y, s, col) {
    const p = `M${x - 70 * s} ${y}C${x - 76 * s} ${y - 40 * s} ${x - 60 * s} ${y - 70 * s} ${x - 30 * s} ${y - 80 * s}C${x - 16 * s} ${y - 86 * s} ${x - 4 * s} ${y - 96 * s} ${x + 6 * s} ${y - 108 * s}L${x + 2 * s} ${y - 140 * s}L${x + 20 * s} ${y - 118 * s}L${x + 42 * s} ${y - 120 * s}L${x + 52 * s} ${y - 146 * s}L${x + 56 * s} ${y - 108 * s}C${x + 64 * s} ${y - 96 * s} ${x + 62 * s} ${y - 84 * s} ${x + 48 * s} ${y - 80 * s}C${x + 44 * s} ${y - 60 * s} ${x + 40 * s} ${y - 30 * s} ${x + 38 * s} ${y}Z`;
    const tail = `M${x - 70 * s} ${y}C${x - 110 * s} ${y + 2 * s} ${x - 150 * s} ${y - 20 * s} ${x - 146 * s} ${y - 62 * s}C${x - 128 * s} ${y - 48 * s} ${x - 118 * s} ${y - 36 * s} ${x - 96 * s} ${y - 34 * s}C${x - 84 * s} ${y - 20 * s} ${x - 78 * s} ${y - 10 * s} ${x - 70 * s} ${y}Z`;
    return `<g><path d="${tail}" fill="${col}" opacity=".92"/><path d="${p}" fill="${col}"/><path d="M${x - 146 * s} ${y - 62 * s}C${x - 138 * s} ${y - 56 * s} ${x - 132 * s} ${y - 50 * s} ${x - 128 * s} ${y - 44 * s}" stroke="${C.bone}" stroke-width="${5 * s}" stroke-linecap="round" opacity=".55"/></g>`;
  }

  /* wheat: gold vertical strokes with small heads, in sway groups (two paths per group) */
  function wheat(rnd, x0, x1, yBase, n, hMin, hMax, col) {
    let out = "";
    const groups = 6;
    for (let g = 0; g < groups; g++) {
      let stems = "", heads = "";
      for (let i = 0; i < n / groups; i++) {
        const x = r1(x0 + rnd() * (x1 - x0)), h = hMin + rnd() * (hMax - hMin), lean = r1((rnd() - 0.5) * 30);
        const top = r1(yBase - h), tx = r1(x + lean);
        stems += `M${x} ${yBase + 10}Q${r1(x + lean * .4)} ${r1(yBase - h * .55)} ${tx} ${top}`;
        heads += `M${tx} ${top}l${r1(lean * .1)} -14`;
      }
      out += `<g class="art-wheat" style="transform-origin:${r1((x0 + x1) / 2)}px ${yBase}px;animation-delay:${r1(-rnd() * 6)}s" stroke="${col}" fill="none" stroke-linecap="round" opacity="${r1(0.55 + g * 0.07)}"><path d="${stems}" stroke-width="${r1(1.6 + g * 0.3)}"/><path d="${heads}" stroke-width="5.5"/></g>`;
    }
    return out;
  }

  /* a stone well with two posts and a crossbeam, pulley, rope, bucket */
  function well(id, x, y, s, m) {
    const stone = mix(m.dunes[2], C.bone, 0.12), dark = mix(m.dunes[3], C.ink, 0.3);
    const rx = 70 * s, ry = 20 * s, h = 80 * s;
    let b = `<rect x="${x - rx}" y="${y - h}" width="${rx * 2}" height="${h}" fill="${stone}"/>`;
    // stone courses
    for (let i = 1; i < 4; i++) b += `<path d="M${x - rx} ${y - h + i * h / 4}H${x + rx}" stroke="${dark}" stroke-opacity=".45" stroke-width="${1.5 * s}"/>`;
    for (let i = 0; i < 8; i++) { const yy = y - h + (i % 4) * h / 4, xx = x - rx + ((i * 37 + (i % 2) * 25) % (rx * 2)); b += `<path d="M${r1(xx)} ${r1(yy)}v${h / 4}" stroke="${dark}" stroke-opacity=".35" stroke-width="${1.5 * s}"/>`; }
    b += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${mix(stone, m.ground, 0.4)}"/>`;
    b += `<ellipse cx="${x}" cy="${y - h}" rx="${rx}" ry="${ry}" fill="${mix(stone, C.bone, 0.18)}"/><ellipse cx="${x}" cy="${y - h}" rx="${rx * .78}" ry="${ry * .78}" fill="${C.ink}" opacity=".85"/>`;
    // posts + crossbeam + wheel + rope + bucket
    const ph = 150 * s;
    b += `<rect x="${x - rx + 10 * s}" y="${y - h - ph}" width="${8 * s}" height="${ph}" fill="${dark}"/><rect x="${x + rx - 18 * s}" y="${y - h - ph}" width="${8 * s}" height="${ph}" fill="${dark}"/><rect x="${x - rx + 4 * s}" y="${y - h - ph - 6 * s}" width="${rx * 2 - 8 * s}" height="${8 * s}" fill="${dark}"/>`;
    b += `<circle cx="${x}" cy="${y - h - ph + 14 * s}" r="${12 * s}" fill="none" stroke="${C.gold}" stroke-width="${3 * s}"/><path d="M${x} ${y - h - ph + 26 * s}V${y - h - 26 * s}" stroke="${C.gold}" stroke-opacity=".7" stroke-width="${1.6 * s}"/>`;
    b += `<path d="M${x - 14 * s} ${y - h - 26 * s}h${28 * s}l${-4 * s} ${22 * s}h${-20 * s}Z" fill="${dark}" stroke="${C.gold}" stroke-opacity=".6" stroke-width="${1.2 * s}"/>`;
    return b;
  }

  /* bookshelf of slim spines in many (muted) colours; one spine lit gold */
  function shelf(id, rnd, m) {
    const spines = ["#2d3a6b", "#8a6a46", "#b7a27a", "#5e6b8a", "#6f4a5c", "#4a6b63", "#9c8456", "#3f4a78", "#7a7c66", "#56394a", "#a89270", "#2a3d58", "#6b5a3e", "#8c5a5a", "#4f6a4a"];
    const x0 = 230, x1 = 770;
    let b = `<rect x="${x0 - 30}" y="220" width="${x1 - x0 + 60}" height="600" fill="${mix(m.dunes[3], C.ink, 0.4)}" opacity=".9"/><rect x="${x0 - 30}" y="220" width="${x1 - x0 + 60}" height="600" fill="none" stroke="${C.sand}" stroke-opacity=".25" stroke-width="2"/>`;
    let lit = false;
    [220, 510].forEach((top, row) => {
      const base = top + 280;
      let bands = "", glow = "";
      let x = x0 + 10;
      while (x < x1 - 30) {
        const w = r1(18 + rnd() * 26), hgt = r1(190 + rnd() * 80), col = spines[Math.floor(rnd() * spines.length)];
        const isLit = row === 1 && !lit && x > 690;
        if (isLit) { lit = true; glow = `<g class="art-glow"><rect x="${r1(x - 30)}" y="${r1(base - hgt - 30)}" width="${r1(w + 60)}" height="${r1(hgt + 40)}" rx="30" fill="url(#${id}-sunglow)" opacity=".6"/><rect x="${r1(x)}" y="${r1(base - hgt)}" width="${w}" height="${hgt}" rx="2" fill="${C.gold}"/></g>`; }
        else b += `<rect x="${r1(x)}" y="${r1(base - hgt)}" width="${w}" height="${hgt}" rx="2" fill="${col}"/>`;
        bands += `M${r1(x + w * .2)} ${r1(base - hgt + 18)}h${r1(w * .6)}M${r1(x + w * .2)} ${r1(base - 26)}h${r1(w * .6)}`;
        x += w + 3 + (rnd() < 0.1 ? 14 : 0);
      }
      b += glow + `<path d="${bands}" stroke="${C.bone}" stroke-opacity=".3" stroke-width="2"/>`;
      b += `<rect x="${x0 - 30}" y="${base}" width="${x1 - x0 + 60}" height="14" fill="${mix(C.sand, m.ground, 0.55)}"/>`;
    });
    return b;
  }

  /* ── compositions ── */
  const SCENES = {};

  // open desert: layered dunes; options vary sun/moon/figure/props
  function desert(id, mood, o) {
    o = o || {};
    const m = MOODS[mood], rnd = seeded(hash(id));
    const dn = dunes(id, m, rnd, { horizon: o.horizon || 740, amp: o.amp, step: o.step, layers: o.layers });
    let body = sky(id);
    const nStars = o.stars != null ? o.stars : (mood === "day" ? 20 : mood === "dusk" ? 60 : 110);
    body += stars(id, rnd, nStars, (o.horizon || 740) - 40, m.starA, o.bright);
    if (o.sun) body += horizonGlow(id, o.sun[0], o.sun[1] + 60, 520, 260, 0.9) + sun(id, o.sun[0], o.sun[1], o.sun[2] || 60);
    else body += horizonGlow(id, 500, (o.horizon || 740) + 20, 620, 220, o.glow == null ? 0.55 : o.glow);
    if (o.moon) body += moon(o.moon[0], o.moon[1], o.moon[2] || 28);
    body += (o.behind || "") + dn.body;
    if (o.figure) body += figure(o.figure[0], o.figure[1], o.figure[2] || 1, mix(m.ground, C.ink, 0.5), o.scarf || C.gold);
    body += (o.front || "");
    body += grain(id);
    return wrap(id, defs(id, m, dn.defs), body);
  }

  // standing on a small world: a big curved horizon low in frame, volcanoes, sky above
  function world(id, mood, o) {
    o = o || {};
    const m = MOODS[mood], rnd = seeded(hash(id));
    const r = o.r || 760, cx = 500, cy = (o.horizon || 740) + r;
    const pl = planet(id, cx, cy, r, m, { volcanoes: o.volcanoes || [-40, -12, 20], volSizes: o.volSizes || [0.5, 0.35, 0.42] });
    let body = sky(id);
    body += stars(id, rnd, o.stars != null ? o.stars : (mood === "day" ? 30 : 120), (o.horizon || 740) - 20, m.starA, o.bright);
    if (o.sun) body += horizonGlow(id, o.sun[0], o.sun[1] + 40, 420, 240, 0.9) + sun(id, o.sun[0], o.sun[1], o.sun[2] || 48);
    else body += horizonGlow(id, 500, (o.horizon || 740) + 10, 640, 180, 0.55);
    body += (o.behind || "") + pl.body;
    if (o.figure) body += figure(o.figure[0], o.figure[1], o.figure[2] || 1, mix(m.ground, C.ink, 0.5), C.gold);
    body += (o.front || "");
    body += grain(id);
    return wrap(id, defs(id, m, pl.defs), body);
  }

  // a small planet floating in space, seen whole
  function orb(id, mood, o) {
    o = o || {};
    const m = MOODS[mood], rnd = seeded(hash(id));
    const r = o.r || 170, cx = o.cx || 500, cy = o.cy || 560;
    const pl = planet(id, cx, cy, r, m, { volcanoes: o.volcanoes, volSizes: o.volSizes });
    let body = sky(id);
    body += stars(id, rnd, o.stars != null ? o.stars : 160, H, m.starA, o.bright);
    body += `<ellipse cx="${cx}" cy="${cy + r * .9}" rx="${r * 2.4}" ry="${r * 1.2}" fill="url(#${id}-glow)" opacity=".25"/>`;
    body += (o.behind || "") + pl.body;
    if (o.figure) body += figure(cx + (o.figure[0] || 0), cy - r + 2 + (o.figure[1] || 0), o.figure[2] || 0.75, mix(m.ground, C.ink, 0.55), C.gold);
    body += (o.front || "");
    body += grain(id);
    return wrap(id, defs(id, m, pl.defs), body);
  }

  function wrap(id, d, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" class="art-svg" data-art="${id}">${d}${body}</svg>`;
  }

  /* small props */
  const plane = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="42" ry="9" fill="${col}"/><path d="M-10 -4L30 -4L36 2L-10 2Z" fill="${col}"/><rect x="-60" y="-6" width="14" height="22" rx="3" fill="${col}"/><path d="M-6 -2L8 -2L10 -40L2 -40Z" fill="${col}" transform="rotate(-10)"/><path d="M-8 2L14 2L16 34L4 34Z" fill="${col}"/><circle cx="46" cy="0" r="4" fill="${col}"/></g>`;
  const birds = (rnd, x0, y0, n, col) => { let s = ""; for (let i = 0; i < n; i++) { const x = x0 + i * 46 + rnd() * 30, y = y0 - i * 22 + rnd() * 40, w = 10 + rnd() * 10; s += `<path d="M${r1(x - w)} ${r1(y + w * .5)}Q${r1(x)} ${r1(y - w * .4)} ${r1(x + w)} ${r1(y + w * .5)}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" opacity="${r1(0.5 + rnd() * 0.5)}"/>`; } return s; };
  const sprout = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0V-40" stroke="#8fae62" stroke-width="3" stroke-linecap="round"/><path d="M0 -26C-14 -30 -22 -44 -20 -54C-8 -50 -2 -38 0 -26Z" fill="#8fae62"/><path d="M0 -34C14 -38 22 -52 20 -62C8 -58 2 -46 0 -34Z" fill="#b5cf7a"/></g>`;
  const baobabTree = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-14 0L-10 -70L-40 -100L-34 -106L-8 -82L-6 -130L6 -130L8 -82L34 -108L40 -102L10 -70L14 0Z" fill="${col}"/><ellipse cx="0" cy="-132" rx="48" ry="26" fill="${col}"/><ellipse cx="-38" cy="-104" rx="20" ry="12" fill="${col}"/><ellipse cx="38" cy="-106" rx="20" ry="12" fill="${col}"/></g>`;
  const chair = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-14 0V-48M-14 -24H14M14 -18V0M-10 -6V8M10 -6V8" stroke="${col}" stroke-width="4" stroke-linecap="round" fill="none"/></g>`;
  const lamppost = (id, x, y, s) => `<g><circle cx="${x}" cy="${y - 150 * s}" r="${150 * s}" fill="url(#${id}-sunglow)" class="art-glow" opacity=".9"/><rect x="${x - 3 * s}" y="${y - 140 * s}" width="${6 * s}" height="${140 * s}" fill="${C.ink}"/><path d="M${x - 16 * s} ${y - 140 * s}h${32 * s}l${-6 * s} ${-30 * s}h${-20 * s}Z" fill="${C.ink}"/><rect x="${x - 10 * s}" y="${y - 168 * s}" width="${20 * s}" height="${28 * s}" fill="#fff3d0" opacity=".95"/><path d="M${x - 14 * s} ${y - 170 * s}h${28 * s}l${-14 * s} ${-12 * s}Z" fill="${C.ink}"/></g>`;
  const wall = (x, y, w, h, col, light) => { let s = `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="3" fill="${col}"/>`; for (let i = 1; i < 4; i++) s += `<path d="M${x} ${y - h + i * h / 4}H${x + w}" stroke="${light}" stroke-opacity=".18" stroke-width="2"/>`; for (let i = 0; i < 10; i++) s += `<path d="M${r1(x + ((i * 53 + (i % 2) * 27) % w))} ${r1(y - h + (i % 4) * h / 4)}v${h / 4}" stroke="${light}" stroke-opacity=".14" stroke-width="2"/>`; s += `<path d="M${x} ${y - h}L${x + w * .3} ${y - h - 10}L${x + w * .55} ${y - h + 2}L${x + w * .8} ${y - h - 8}L${x + w} ${y - h}" fill="${col}"/>`; return s; };
  const snakePath = (x, y, s, col) => `<g><path d="M${x - 220 * s} ${y}C${x - 150 * s} ${y - 40 * s} ${x - 120 * s} ${y + 30 * s} ${x - 50 * s} ${y + 4 * s}S${x + 40 * s} ${y - 40 * s} ${x + 100 * s} ${y - 10 * s}S${x + 170 * s} ${y + 20 * s} ${x + 200 * s} ${y - 20 * s}" fill="none" stroke="${col}" stroke-width="${7 * s}" stroke-linecap="round"/><path d="M${x + 196 * s} ${y - 24 * s}l${16 * s} ${-6 * s}l${-4 * s} ${10 * s}Z" fill="${col}"/></g>`;
  const needles = (rnd, m) => { let s = ""; const cols = [m.dunes[0], m.dunes[1], m.dunes[2], m.dunes[3]]; for (let L = 0; L < 4; L++) { const yb = 1000 + L * 60; for (let i = 0; i < 7 + L * 2; i++) { const x = -40 + rnd() * 1080, h = (320 - L * 50) * (0.5 + rnd() * 0.8), w = 24 + rnd() * 40; s += `<path d="M${r1(x - w)} ${yb}L${r1(x - w * .1)} ${r1(yb - h)}L${r1(x + w * .1)} ${r1(yb - h + 12)}L${r1(x + w)} ${yb}Z" fill="${cols[L]}"/>`; } } return s; };
  const throne = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-40 0V-120Q-40 -150 -10 -150H10Q40 -150 40 -120V0Z" fill="${col}"/><rect x="-54" y="-70" width="108" height="14" rx="3" fill="${col}"/><rect x="-46" y="-56" width="92" height="56" fill="${col}"/><path d="M-30 -150V-176L-16 -164L0 -184L16 -164L30 -176V-150Z" fill="${C.gold}" opacity=".9"/></g>`;
  const hatProp = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-3" y="-60" width="6" height="60" fill="${col}"/><ellipse cx="0" cy="-62" rx="46" ry="9" fill="${col}"/><path d="M-26 -62V-116Q-26 -124 -18 -124H18Q26 -124 26 -116V-62Z" fill="${col}"/><path d="M-26 -78h52" stroke="${C.gold}" stroke-width="4"/></g>`;
  const bottles = (x, y, s, col, n, empty) => { let out = ""; for (let i = 0; i < n; i++) { const bx = x + i * 30 * s, h = (60 + (i % 3) * 14) * s; out += `<path d="M${bx - 10 * s} ${y}V${y - h * .7}Q${bx - 10 * s} ${y - h * .85} ${bx - 4 * s} ${y - h * .88}V${y - h}H${bx + 4 * s}V${y - h * .88}Q${bx + 10 * s} ${y - h * .85} ${bx + 10 * s} ${y - h * .7}V${y}Z" fill="${col}" opacity="${empty ? .55 : .95}"/>${empty ? "" : `<rect x="${bx - 8 * s}" y="${y - h * .45}" width="${16 * s}" height="${h * .45}" fill="${C.gold}" opacity=".35"/>`}`; } return out; };
  const desk = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-80" y="-60" width="160" height="10" fill="${col}"/><rect x="-70" y="-50" width="10" height="50" fill="${col}"/><rect x="60" y="-50" width="10" height="50" fill="${col}"/><rect x="-60" y="-70" width="40" height="10" fill="${C.bone}" opacity=".75"/><rect x="-56" y="-78" width="40" height="8" fill="${C.bone}" opacity=".6"/><rect x="10" y="-66" width="26" height="6" fill="${C.bone}" opacity=".6"/><path d="M-30 -60V-120" stroke="${col}" stroke-width="4"/><path d="M-40 -120H-20" stroke="${col}" stroke-width="4"/></g>`;
  const books = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-90" y="-40" width="180" height="40" rx="3" fill="${col}"/><rect x="-80" y="-78" width="170" height="38" rx="3" fill="${mix(col, C.bone, 0.15)}"/><rect x="-96" y="-112" width="160" height="34" rx="3" fill="${col}"/><path d="M-70 -20H50M-60 -58H60M-76 -94H40" stroke="${C.bone}" stroke-opacity=".3" stroke-width="2"/><path d="M-20 -112L20 -112L16 -150L-16 -150Z" fill="${C.bone}" opacity=".7"/><path d="M-12 -144H12M-12 -134H12M-12 -124H6" stroke="${col}" stroke-width="2"/></g>`;
  const rosesField = (id, rnd, x0, x1, y0, y1, n) => { let s = `<defs><g id="${id}-r"><path d="M0 0V-22" stroke="#5c7a4a" stroke-width="1.6"/><circle cx="0" cy="-26" r="7" fill="${C.roseDeep}"/><circle cx="-1.5" cy="-27.5" r="4.5" fill="${C.rose}"/><circle cx="-2.5" cy="-28.5" r="2" fill="${C.roseLight}"/></g></defs>`; const items = []; for (let i = 0; i < n; i++) { const t = rnd(); items.push([y0 + t * (y1 - y0), x0 + rnd() * (x1 - x0), 0.35 + t * 0.9]); } items.sort((a, b) => a[0] - b[0]); items.forEach(([y, x, sc]) => { s += `<use href="#${id}-r" transform="translate(${r1(x)} ${r1(y)}) scale(${r1(sc)})"/>`; }); return s; };
  const sparkle = (rnd, n, y0, y1) => { let d = ""; for (let i = 0; i < n; i++) d += `M${r1(rnd() * W)} ${r1(y0 + rnd() * (y1 - y0))}h1`; return `<path d="${d}" stroke="${C.bone}" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>`; };

  /* ── scene map ──
     Portrait-safe: on phones the text column rises over the lower ~40% of the
     hero, so every subject sits above y≈760 and the sand below stays quiet. */
  SCENES.cover = id => desert(id, "deep", { horizon: 640, stars: 150, figure: [470, 646, 0.9], glow: 0.35, amp: 50 });
  SCENES.c01 = id => desert(id, "day", { horizon: 720, sun: [300, 320, 54], stars: 8, front: plane(330, 760, 1.0, "#3a2d20") });
  SCENES.c02 = id => desert(id, "day", { horizon: 740, sun: [260, 380, 70], stars: 10, figure: [600, 760, 0.85], front: plane(790, 840, 1.3, "#3a2d20") });
  SCENES.c02b = id => desert(id, "day", { horizon: 730, sun: [560, 230, 48], stars: 6, figure: [520, 745, 0.95] });
  SCENES.c03 = id => desert(id, "dusk", { horizon: 740, stars: 60, moon: [560, 280, 26], figure: [480, 755, 1.0] });
  SCENES.c04 = id => orb(id, "night", { r: 180, cy: 500, figure: [-20, 0, 0.8], stars: 130, bright: [790, 230, 3.4] });
  SCENES.c05 = id => world(id, "day", { horizon: 720, sun: [280, 320, 50], figure: [420, 718, 0.9], front: sprout(560, 706, 1) + sprout(640, 712, 0.7) + sprout(330, 730, 0.8), behind: baobabTree(840, 740, 0.9, "#2a2016") });
  SCENES.c06 = id => desert(id, "dusk", { horizon: 720, sun: [500, 600, 150], stars: 30, front: chair(540, 724, 1.0, "#15101f"), amp: 50 });
  SCENES.c07 = id => world(id, "day", { horizon: 720, sun: [260, 270, 46], figure: [380, 722, 0.85], front: rose(id, 600, 726, 0.95, false) });
  SCENES.c08 = id => world(id, "dusk", { horizon: 740, stars: 70, front: rose(id, 500, 740, 1.5, true) });
  SCENES.c09 = id => world(id, "dusk", { horizon: 740, sun: [560, 300, 40], stars: 50, figure: [460, 738, 0.95], front: rose(id, 640, 744, 0.85, true), behind: birds(seeded(9), 180, 480, 9, "#1f1529") });
  SCENES.journeyintro = id => {
    const m = MOODS.night, rnd = seeded(hash(id));
    let body = sky(id) + stars(id, rnd, 120, H, 1);
    // field of asteroids: six larger ones in a loose arc, dust behind
    const dark = mix(m.dunes[3], C.ink, 0.4), lit = mix(m.dunes[0], C.bone, 0.2);
    let d = `<radialGradient id="${id}-a" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${lit}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`;
    body += `<g fill="${m.dunes[1]}" opacity=".4">`; for (let i = 0; i < 30; i++) body += `<circle cx="${r1(rnd() * W)}" cy="${r1(150 + rnd() * 800)}" r="${r1(3 + rnd() * 9)}"/>`; body += `</g>`;
    const big = [[220, 380, 60], [470, 280, 46], [720, 420, 76], [300, 620, 52], [620, 660, 40], [820, 760, 58]];
    big.forEach(([x, y, r], i) => { let p = ""; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, rr = r * (0.82 + rnd() * 0.3); p += `${k ? "L" : "M"}${r1(x + Math.cos(a) * rr)} ${r1(y + Math.sin(a) * rr)}`; } body += `<path d="${p}Z" fill="url(#${id}-a)"/>`; if (i === 1) body += figure(x, y - r + 2, 0.45, dark, C.gold); });
    body += grain(id);
    return wrap(id, defs(id, m, d), body);
  };
  SCENES.c10 = id => orb(id, "night", { r: 230, cy: 560, stars: 130, front: throne(500, 332, 0.9, "#0c1028") });
  SCENES.c11 = id => orb(id, "night", { r: 150, cy: 520, stars: 130, front: hatProp(500, 372, 0.9, "#0c1028") });
  SCENES.c12 = id => orb(id, "night", { r: 160, cy: 540, stars: 120, front: bottles(400, 384, 0.8, "#0c1028", 3, false) + bottles(520, 384, 0.8, "#0c1028", 3, true) });
  SCENES.c13 = id => orb(id, "night", { r: 170, cy: 550, stars: 220, front: desk(500, 382, 0.9, "#0c1028") });
  SCENES.c14 = id => orb(id, "dusk", { r: 120, cy: 560, stars: 140, front: lamppost(id, 500, 442, 1) + figure(548, 444, 0.55, "#15101f", C.gold) });
  SCENES.c15 = id => orb(id, "night", { r: 300, cy: 660, stars: 140, front: books(500, 362, 0.9, "#0c1028") });
  SCENES.c16 = id => {
    const m = MOODS.night, rnd = seeded(hash(id));
    const cx = 500, cy = 500, r = 240;
    let d = `<radialGradient id="${id}-e" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#3a4f8a"/><stop offset=".6" stop-color="#1b2a5c"/><stop offset="1" stop-color="#090e2a"/></radialGradient><radialGradient id="${id}-atm"><stop offset=".78" stop-color="#8fa0d8" stop-opacity="0"/><stop offset=".92" stop-color="#8fa0d8" stop-opacity=".35"/><stop offset="1" stop-color="#8fa0d8" stop-opacity="0"/></radialGradient>`;
    let body = sky(id) + stars(id, rnd, 120, H, 1);
    body += `<circle cx="${cx}" cy="${cy}" r="${r * 1.14}" fill="url(#${id}-atm)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-e)"/>`;
    // soft continents
    body += `<g fill="${C.sand}" opacity=".16" transform="translate(0 -60)"><path d="M380 430C420 380 500 390 540 430C560 470 520 520 470 520C420 520 360 480 380 430Z"/><path d="M560 560C600 520 680 560 690 620C700 680 640 720 600 700C560 680 530 600 560 560Z"/><path d="M330 620C360 600 400 640 390 680C380 720 330 720 320 690Z"/></g>`;
    // city lights on the night side + a ring of lights around the globe
    body += `<g fill="${C.gold}" opacity=".8">`;
    for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (r - 14); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (x < cx + 20) continue; body += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(1 + rnd() * 2)}"/>`; }
    body += `</g><g class="art-stars" fill="${C.gold}" style="transform-origin:${cx}px ${cy}px">`;
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; const x = cx + Math.cos(a) * r * 1.42, y = cy + Math.sin(a) * r * 0.46; const frontSide = Math.sin(a) > 0; body += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${frontSide ? 3.2 : 2}" opacity="${frontSide ? 0.95 : 0.3}"/>`; }
    body += `</g><ellipse cx="${cx}" cy="${cy}" rx="${r * 1.42}" ry="${r * 0.46}" fill="none" stroke="${C.gold}" stroke-opacity=".18" stroke-width="1.5"/>`;
    body += grain(id);
    return wrap(id, defs(id, m, d), body);
  };
  SCENES.c17 = id => desert(id, "night", { horizon: 720, stars: 110, moon: [280, 260, 30], figure: [620, 740, 0.9], front: snakePath(380, 820, 0.9, C.gold) });
  SCENES.c18 = id => desert(id, "day", { horizon: 730, sun: [300, 320, 46], stars: 8, figure: [380, 752, 0.9], front: `<g transform="translate(600 758)"><path d="M0 0V-60" stroke="#8fae62" stroke-width="3"/><ellipse cx="0" cy="-70" rx="7" ry="14" fill="${C.sand}"/><ellipse cx="-12" cy="-62" rx="7" ry="14" fill="${C.sand}" transform="rotate(-60 -12 -62)"/><ellipse cx="12" cy="-62" rx="7" ry="14" fill="${C.sand}" transform="rotate(60 12 -62)"/><circle cx="0" cy="-62" r="4" fill="${C.gold}"/></g>` });
  SCENES.c19 = id => { const m = MOODS.day, rnd = seeded(hash(id)); let body = sky(id) + stars(id, rnd, 10, 600, m.starA) + horizonGlow(id, 500, 820, 700, 240, 0.7) + needles(rnd, m) + figure(520, 852, 0.8, "#2a2016", C.gold) + grain(id); return wrap(id, defs(id, m), body); };
  SCENES.c20 = id => desert(id, "day", { horizon: 680, sun: [260, 320, 44], stars: 8, figure: [500, 800, 0.95], front: rosesField(id, seeded(20), 60, 940, 700, 980, 150) });
  SCENES.c21 = id => desert(id, "dusk", { horizon: 740, sun: [300, 500, 90], stars: 50, figure: [380, 760, 0.95], front: fox(640, 850, 0.8, "#1f1529") + `<g><rect x="800" y="500" width="12" height="280" fill="#1f1529"/><circle cx="806" cy="460" r="110" fill="#1f1529"/><circle cx="760" cy="510" r="70" fill="#1f1529"/><circle cx="860" cy="520" r="66" fill="#1f1529"/></g>` });
  SCENES.c21b = id => desert(id, "dusk", { horizon: 700, sun: [540, 440, 110], stars: 30, front: fox(500, 760, 1.0, "#1f1529") + wheat(seeded(21), -20, 1020, 980, 150, 170, 300, C.gold) });
  SCENES.c21c = id => desert(id, "dusk", { horizon: 730, sun: [240, 440, 70], stars: 40, figure: [330, 790, 0.95], front: fox(690, 792, 0.78, "#1f1529") + wheat(seeded(22), 540, 1020, 960, 70, 110, 200, C.gold) });
  SCENES.c21d = id => desert(id, "dusk", { horizon: 730, stars: 90, glow: 0.4, figure: [420, 770, 0.95], front: fox(580, 762, 0.7, "#1f1529") + rose(id, 800, 752, 0.8, false) });
  SCENES.c22 = id => {
    const m = MOODS.night, rnd = seeded(hash(id));
    let d = `<linearGradient id="${id}-s1" x1="0" x2="1"><stop offset="0" stop-color="${C.gold}" stop-opacity="0"/><stop offset=".5" stop-color="${C.gold}" stop-opacity=".9"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></linearGradient><linearGradient id="${id}-s2" x1="0" x2="1"><stop offset="0" stop-color="${C.bone}" stop-opacity="0"/><stop offset=".5" stop-color="${C.bone}" stop-opacity=".7"/><stop offset="1" stop-color="${C.bone}" stop-opacity="0"/></linearGradient>`;
    let body = sky(id) + stars(id, rnd, 110, 560, 1);
    body += `<rect y="740" width="${W}" height="${H - 740}" fill="${m.ground}"/>`;
    // rails
    body += `<path d="M-50 840H1050M-50 870H1050" stroke="${C.bone}" stroke-opacity=".18" stroke-width="2"/>`;
    for (let i = 0; i < 24; i++) body += `<rect x="${i * 46 - 20}" y="836" width="12" height="38" fill="${C.bone}" opacity=".07"/>`;
    // light streaks: two trains, opposite directions
    [[580, -120, 1240, 36, "s1"], [640, -160, 1200, 22, "s2"], [720, -200, 1400, 50, "s1"], [770, -140, 1100, 18, "s2"]].forEach(([y, x, w, h, g]) => { body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="url(#${id}-${g})" opacity=".85"/>`; });
    for (let i = 0; i < 22; i++) body += `<rect x="${r1(120 + i * 36)}" y="${r1(588 + Math.sin(i) * 2)}" width="14" height="18" rx="2" fill="#fff3d0" opacity="${r1(0.5 + rnd() * 0.5)}"/>`;
    for (let i = 0; i < 18; i++) body += `<rect x="${r1(260 + i * 36)}" y="730" width="14" height="22" rx="2" fill="#fff3d0" opacity="${r1(0.4 + rnd() * 0.6)}"/>`;
    // signal post + figure
    body += `<rect x="150" y="600" width="6" height="240" fill="${C.ink}"/><circle cx="153" cy="590" r="10" fill="${C.gold}" class="art-glow"/><circle cx="153" cy="590" r="30" fill="url(#${id}-sunglow)" opacity=".7"/>`;
    body += figure(230, 840, 0.95, C.ink, C.gold) + grain(id);
    return wrap(id, defs(id, m, d), body);
  };
  SCENES.c23 = id => desert(id, "night", { horizon: 730, stars: 110, figure: [460, 770, 0.95], behind: `<circle cx="600" cy="730" r="90" fill="url(#${id}-sunglow)" opacity=".5"/>` });
  SCENES.c24 = id => desert(id, "night", { horizon: 710, stars: 140, moon: [590, 230, 34], figure: [430, 780, 1.0], front: sparkle(seeded(24), 90, 760, 1200) });
  SCENES.c24b = id => desert(id, "dusk", { horizon: 740, sun: [500, 780, 70], stars: 60, figure: [540, 760, 0.95], amp: 50 });
  SCENES.c25 = id => desert(id, "day", { horizon: 740, sun: [300, 330, 48], stars: 6, figure: [330, 790, 0.85], front: well(id, 560, 806, 1.0, MOODS.day) });
  SCENES.c25b = id => desert(id, "day", { horizon: 740, sun: [260, 270, 50], stars: 6, front: wall(560, 820, 300, 70, "#846748", C.bone) + figure(640, 752, 0.85, "#3a2d20", C.gold) });
  SCENES.c26 = id => desert(id, "dusk", { horizon: 740, sun: [300, 470, 80], stars: 40, front: wall(360, 840, 320, 80, "#39233b", C.bone) + figure(480, 762, 0.9, "#15101f", C.gold) + snakePath(520, 900, 0.7, C.gold) });
  SCENES.c26b = id => desert(id, "night", { horizon: 780, stars: 160, glow: 0.3, figure: [500, 805, 0.95], bright: [330, 220, 3] });
  SCENES.c26c = id => desert(id, "deep", { horizon: 740, stars: 120, glow: 0.3, bright: [500, 320, 3.2], amp: 40 });
  SCENES.c27 = id => desert(id, "deep", { horizon: 760, stars: 110, glow: 0.25, layers: 2, step: 160, bright: [520, 330, 4] });
  SCENES.c27b = id => desert(id, "deep", { horizon: 750, stars: 100, glow: 0.3, layers: 2, step: 170, amp: 90, bright: [480, 350, 4.4] });
  SCENES.end = id => { const m = MOODS.deep, rnd = seeded(hash(id)); let body = sky(id) + stars(id, rnd, 120, 280, 1) + horizonGlow(id, 500, 760, 700, 200, 0.4) + shelf(id, rnd, m) + grain(id); return wrap(id, defs(id, m), body); };

  function render(sceneId, mood) {
    const fn = SCENES[sceneId];
    const id = "a-" + sceneId;
    try {
      if (fn) return fn(id);
      return desert(id, MOODS[mood] ? mood : "night", {});
    } catch (e) {
      return desert(id, "night", {});
    }
  }
  return { render, has: id => !!SCENES[id] };
})();
