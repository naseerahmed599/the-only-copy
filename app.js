/* ──────────────────────────────────────────────────────────────
   THE ONLY COPY — app.js
   Renders window.SCENES into a scroll-driven story, drives the
   sky (mood tint + canvas starfield), reveals, the progress
   planet, sound, and all the small interactions.
   Dependencies: vendor/gsap.min.js, vendor/ScrollTrigger.min.js
   ────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  /* ════════════════════════════════════════════════════════════
     CONFIG — durations, colours and tuning live here
     ════════════════════════════════════════════════════════════ */
  const CONFIG = {
    // Optional passphrase gate. Set enabled:true and an answer; compare is case/diacritic/whitespace-insensitive.
    gate: { enabled: false, answer: "", hint: "", title: "This edition opens with a word." },
    gateStorageKey: "onlycopy.gate",
    vignette: { duration: 2.0 },                       // chapter-transition dip, seconds
    heroStar: { period: 8000, x: 0.66, y: 0.24 },      // the one bright star on the cover: pulses every ~8 s
    endDrift: { speed: 14 },                           // px/s the stars drift upward after the colophon
    sunScrub: { travel: 120 },                         // user units an .art-sun descends across its scene
    reveal:        { y: 24, duration: 1.1, ease: "power2.out", start: "top 78%", blur: 7, titleTracking: "0.08em" },
    dedication:    { duration: 1.9, stagger: 0.35 },
    kenBurns:      { from: 1.0, to: 1.08 },
    moodTrigger:   { start: "top 55%", end: "bottom 55%" },
    riddle:        { unveilAt: "top 42%" },          // when the first beat reaches this, auto-unveil
    stars: {
      count: 260,                                      // total stars in the field
      deepOnlyRatio: 0.35,                             // extra stars only visible in "deep"
      layers: [0.04, 0.10, 0.2],                       // parallax factors (fraction of scrollY)
      alphaByMood: { day: 0.28, dusk: 0.55, night: 1, deep: 1 },
      twinkleSpeed: 0.0012,
      maxDpr: 2
    },
    gold: "#e8c872",
    rose: "#d87a8a",
    counterTarget: 501622731,
    counterDuration: 4,
    sunsets: 44,
    baobab: { interval: 1500, growMs: 6000, count: 5 },
    bells: { count: 60 },
    constellation: { needed: 5, minDist: 11 },
    // Real images that also have a landscape version (img/<name>-wide.jpg), used on laptops
    wideImages: ["00-cover", "38-the-thirty-first-star", "38-the-thirty-first-star-dawn"],
    // A second image that fades in over the first as a scene's text scrolls by (scene id → file)
    crossfade: { end: "38-the-thirty-first-star-dawn.jpg" },
    shootingStars: { minGap: 18000, maxGap: 45000, duration: 900 }   // in night/deep moods only
  };

  const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const HAS_GSAP = typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined";
  if (HAS_GSAP) gsap.registerPlugin(ScrollTrigger);

  /* ════════════════════════════════════════════════════════════
     Small helpers
     ════════════════════════════════════════════════════════════ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** h("p.beat.rv", { text: "..." }, child, child) — a tiny element builder */
  function h(tag, attrs, ...children) {
    const [name, ...classes] = tag.split(".");
    const el = document.createElement(name || "div");
    if (classes.length) el.className = classes.join(" ");
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "text") el.textContent = v;
        else if (k === "html") el.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "dataset") Object.assign(el.dataset, v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  /** SVG from a string (all shapes are original, simple silhouettes) */
  function svg(markup, cls) {
    const wrap = document.createElement("div");
    wrap.innerHTML = markup.trim();
    const node = wrap.firstElementChild;
    if (cls) node.classList.add(cls);
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    return node;
  }

  /** Deterministic PRNG so layouts (stars, constellation) are the same on every visit */
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function romanChapter(num) { return "Chapter " + num; }

  /* ════════════════════════════════════════════════════════════
     Audio — background theme (file, optional) + synthesized UI sounds
     ════════════════════════════════════════════════════════════ */
  const Audio = (() => {
    let ctx = null;
    function ensure() {
      if (ctx) return ctx;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      } catch (_) { ctx = null; }
      return ctx;
    }
    function resume() { const c = ensure(); if (c && c.state === "suspended") c.resume().catch(() => {}); }

    /** Soft sine "ding", randomly pitched 880–1760 Hz, short decay */
    function ding(freq) {
      const c = ensure(); if (!c) return; resume();
      const f = freq || rand(880, 1760);
      const t = c.currentTime;
      const osc = c.createOscillator();
      const osc2 = c.createOscillator();
      const g = c.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      osc2.type = "sine"; osc2.frequency.value = f * 2.01; // faint overtone for a bell-like shimmer
      const g2 = c.createGain(); g2.gain.value = 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(g); osc2.connect(g2); g2.connect(g); g.connect(c.destination);
      osc.start(t); osc2.start(t);
      osc.stop(t + 1.5); osc2.stop(t + 1.5);
    }

    /** Low sawtooth creak for the well pulley */
    function creak() {
      const c = ensure(); if (!c) return; resume();
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      const lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 4;
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(72, t);
      osc.frequency.linearRampToValueAtTime(54, t + 0.32);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(lp); lp.connect(g); g.connect(c.destination);
      osc.start(t); osc.stop(t + 0.45);
    }

    /** Background theme toggle; silently degrades if audio/theme.mp3 is missing */
    function initBgm() {
      const btn = $("#sound");
      const bgm = $("#bgm");
      if (!btn || !bgm) return;
      let unavailable = false;
      bgm.volume = 0.0;
      bgm.addEventListener("error", () => { unavailable = true; btn.classList.add("is-unavailable"); btn.setAttribute("aria-pressed", "false"); btn.title = "No theme found (audio/theme.mp3)"; });
      btn.addEventListener("click", () => {
        resume();
        if (unavailable) return;
        const on = btn.getAttribute("aria-pressed") === "true";
        if (on) {
          if (HAS_GSAP) gsap.to(bgm, { volume: 0, duration: 1.2, onComplete: () => bgm.pause() });
          else { bgm.pause(); }
          btn.setAttribute("aria-pressed", "false");
        } else {
          const p = bgm.play();
          if (p && p.catch) {
            p.then(() => {
              btn.setAttribute("aria-pressed", "true");
              if (HAS_GSAP) gsap.to(bgm, { volume: 0.55, duration: 2.5 }); else bgm.volume = 0.55;
            }).catch(() => {
              unavailable = true; btn.classList.add("is-unavailable"); btn.setAttribute("aria-pressed", "false");
            });
          }
        }
      });
    }
    return { ding, creak, initBgm, resume };
  })();

  /* ════════════════════════════════════════════════════════════
     Starfield — canvas, parallax by scroll, twinkle, mood density
     ════════════════════════════════════════════════════════════ */
  const Sky = (() => {
    const canvas = $("#sky");
    if (!canvas) return { setMood() {}, setDrift() {} };
    const ctx = canvas.getContext("2d");
    const stars = [];
    let W = 0, H = 0, dpr = 1;
    let alphaTarget = CONFIG.stars.alphaByMood.deep, alphaCur = alphaTarget;
    let deepTarget = 1, deepCur = 1;
    let running = true;
    let driftOn = false, driftV = 0, driftY = 0, lastT = 0;
    let meteor = null, nextMeteor = 9000;              // first shooting star about nine seconds in

    const rnd = seeded(2718);
    for (let i = 0; i < CONFIG.stars.count; i++) {
      const layer = Math.floor(rnd() * CONFIG.stars.layers.length);
      stars.push({
        x: rnd(), y: rnd() * 1.4,                        // y spans more than one screen so parallax never runs out
        r: 0.4 + rnd() * (layer === 2 ? 1.3 : 0.9),
        layer,
        phase: rnd() * Math.PI * 2,
        speed: 0.6 + rnd() * 1.2,
        deepOnly: rnd() < CONFIG.stars.deepOnlyRatio,
        warm: rnd() < 0.18                                // a few faintly golden stars
      });
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, CONFIG.stars.maxDpr);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame(now) {
      if (!running) return;
      alphaCur = lerp(alphaCur, alphaTarget, 0.025);
      deepCur = lerp(deepCur, deepTarget, 0.025);
      ctx.clearRect(0, 0, W, H);
      const scroll = RM ? 0 : (window.scrollY || 0);
      const t = now * CONFIG.stars.twinkleSpeed;
      // end-of-book drift: ramps up gently, carries every layer upward
      const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0; lastT = now;
      driftV = lerp(driftV, driftOn && !RM ? CONFIG.endDrift.speed : 0, 0.02);
      driftY += driftV * dt;
      for (const s of stars) {
        const par = CONFIG.stars.layers[s.layer];
        // wrap vertically; the field repeats every 1.4 screens
        let y = ((s.y * H * 1.4 - scroll * par - driftY * (0.6 + par * 4)) % (H * 1.4) + H * 1.4) % (H * 1.4) - H * 0.2;
        if (y < -4 || y > H + 4) continue;
        const x = s.x * W;
        const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
        let a = alphaCur * tw * (s.layer === 0 ? 0.55 : 1);
        if (s.deepOnly) a *= deepCur;
        if (a <= 0.01) continue;
        ctx.beginPath();
        ctx.fillStyle = s.warm ? `rgba(232,200,114,${a})` : `rgba(243,238,226,${a})`;
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // a shooting star now and then, only when the sky is dark enough to notice
      if (!RM && alphaCur > 0.7) {
        if (!meteor && now > nextMeteor) {
          const fromLeft = Math.random() < 0.5;
          meteor = { t0: now, x: fromLeft ? rand(0.05, 0.4) * W : rand(0.6, 0.95) * W, y: rand(0.06, 0.4) * H, dx: (fromLeft ? 1 : -1) * rand(0.22, 0.38) * W, dy: rand(0.08, 0.18) * H };
        }
        if (meteor) {
          const p = (now - meteor.t0) / CONFIG.shootingStars.duration;
          if (p >= 1) { meteor = null; nextMeteor = now + rand(CONFIG.shootingStars.minGap, CONFIG.shootingStars.maxGap); }
          else {
            const e = 1 - Math.pow(1 - p, 2);                      // fast start, slow finish
            const hx = meteor.x + meteor.dx * e, hy = meteor.y + meteor.dy * e;
            const tail = 0.12 * (1 - p);                            // the tail shortens as it fades
            const tx = hx - meteor.dx * tail, ty = hy - meteor.dy * tail;
            const a = Math.sin(p * Math.PI) * 0.85;
            const g = ctx.createLinearGradient(tx, ty, hx, hy);
            g.addColorStop(0, "rgba(243,238,226,0)"); g.addColorStop(1, `rgba(255,255,255,${a})`);
            ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
          }
        }
      }
      requestAnimationFrame(frame);
    }

    function setMood(m) {
      alphaTarget = CONFIG.stars.alphaByMood[m] ?? 1;
      deepTarget = m === "deep" ? 1 : 0;
    }
    function setDrift(on) { driftOn = !!on; }

    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", () => {
      running = document.visibilityState === "visible";
      if (running) requestAnimationFrame(frame);
    });
    resize();
    requestAnimationFrame(frame);
    return { setMood, setDrift };
  })();

  function setMood(m) {
    if (document.body.dataset.mood === m) return;
    document.body.dataset.mood = m;
    Sky.setMood(m);
  }

  /* ════════════════════════════════════════════════════════════
     Image slot: procedural art (art.js) underneath, the real file
     on top when it exists. The intended filename stays on the
     slot as a title attribute so the owner can see which goes where.
     ════════════════════════════════════════════════════════════ */
  function imageSlot(scene, eager) {
    const slot = h("figure.slot", { dataset: { mood: scene.mood }, title: scene.img ? "img/" + scene.img : undefined });
    const art = h("div.art", { "aria-hidden": "true" });
    if (window.ART) art.innerHTML = window.ART.render(scene.id, scene.mood);
    slot.appendChild(art);
    if (scene.img) {
      const img = picture(scene.img, eager);
      img.addEventListener("load", () => slot.classList.add("is-loaded"));
      img.addEventListener("error", () => slot.classList.add("is-missing"));
      slot.appendChild(img.parentNode || img);
      const fade = CONFIG.crossfade[scene.id];
      if (fade) {
        const img2 = picture(fade, false);
        img2.classList.add("xfade");
        img2.addEventListener("load", () => slot.classList.add("has-xfade"));
        img2.addEventListener("error", () => img2.classList.add("is-broken"));
        slot.appendChild(img2.parentNode || img2);
      }
    } else {
      slot.classList.add("is-missing");
    }
    slot.appendChild(h("div.veil"));
    slot.appendChild(h("div.scrim"));
    return slot;
  }

  /** An <img>, wrapped in a <picture> with a landscape source when a -wide file exists */
  function picture(file, eager) {
    const base = file.replace(/\.jpg$/, "");
    const img = h("img", { src: "img/" + file, alt: "", loading: eager ? "eager" : "lazy", decoding: "async" });
    if (CONFIG.wideImages.indexOf(base) < 0) return img;
    const pic = document.createElement("picture");
    const src = document.createElement("source");
    src.setAttribute("media", "(min-width: 900px) and (orientation: landscape)");
    src.setAttribute("srcset", "img/" + base + "-wide.jpg");
    pic.appendChild(src); pic.appendChild(img);
    return img;
  }

  /* ════════════════════════════════════════════════════════════
     Scene renderers
     ════════════════════════════════════════════════════════════ */
  const partNames = []; // { el, name } for the progress label

  function renderCover(s) {
    const sec = h("section.scene.scene--cover", { id: s.id, dataset: { mood: s.mood } });
    sec.appendChild(h("div.hero", null, imageSlot(s, true)));
    sec.appendChild(h("div.hero-star", { "aria-hidden": "true", style: `left:${CONFIG.heroStar.x * 100}%;top:${CONFIG.heroStar.y * 100}%` }, h("i"), h("b")));
    const content = h("div.content");
    content.appendChild(h("p.eyebrow.rv", { text: "An edition of one" }));
    content.appendChild(h("h1.title.rv", { text: s.title }));
    if (s.sub) content.appendChild(h("p.sub.rv", { text: s.sub }));
    (s.beats || []).forEach(b => content.appendChild(h("p.beat.rv", { text: b })));
    if (s.hint) content.appendChild(h("p.hint.rv", { text: s.hint }, h("span.chev")));
    sec.appendChild(content);
    return sec;
  }

  function renderDedication(s) {
    const sec = h("section.scene.scene--dedication", { id: s.id, dataset: { mood: s.mood } });
    const inner = h("div.inner");
    inner.appendChild(h("h2.title.rv.rv--slow", { text: s.title }));
    (s.beats || []).forEach(b => inner.appendChild(h("p.beat.rv.rv--slow", { text: b })));
    sec.appendChild(inner);
    return sec;
  }

  function renderPart(s) {
    const sec = h("section.scene.scene--part", { id: s.id, dataset: { mood: s.mood } });
    const inner = h("div.inner");
    inner.appendChild(h("div.numeral.rv", { text: s.title, "aria-label": "Part " + s.title }));
    inner.appendChild(h("div.rule"));
    inner.appendChild(h("p.sub.rv", { text: s.sub || "" }));
    sec.appendChild(inner);
    partNames.push({ el: sec, name: "Part " + s.title + (s.sub ? " · " + s.sub : "") });
    return sec;
  }

  function renderChapterLike(s, kind, prevNum) {
    const sec = h("section.scene.scene--" + kind, { id: s.id, dataset: { mood: s.mood } });
    sec.appendChild(h("div.hero", null, imageSlot(s, false)));
    const text = h("div.text");

    if (s.riddle) {
      sec.classList.add("is-veiled");
      const card = h("div.riddle.rv");
      card.appendChild(h("p.kicker", { text: "Guess who lives here" }));
      card.appendChild(h("p", { text: s.riddle }));
      const btn = h("button.reveal", { type: "button", text: "Reveal" });
      btn.addEventListener("click", () => unveil(sec, card));
      card.appendChild(btn);
      text.appendChild(card);
    }

    let caption = null;
    if (kind === "chapter" && s.num != null) {
      caption = romanChapter(s.num) + (prevNum === s.num ? " · continued" : "");
    } else if (kind === "interlude") caption = "Interlude";
    else if (kind === "end") caption = "Colophon";
    if (caption) text.appendChild(h("p.caption.rv", { text: caption }));
    text.appendChild(h("h2.title.rv", { text: s.title }));
    (s.beats || []).forEach(b => text.appendChild(h("p.beat.rv", { text: b })));
    if (s.note) text.appendChild(h("aside.note.rv", { text: s.note }));
    if (s.interaction && Interactions[s.interaction]) {
      const box = h("div.interaction.rv", { dataset: { kind: s.interaction } });
      box.classList.add("ix-" + s.interaction);
      if (s.interactionText) box.appendChild(h("p.prompt", { text: s.interactionText }));
      Interactions[s.interaction](box, s);
      text.appendChild(box);
    }
    if (kind === "end") {
      if (s.sign) text.appendChild(h("p.sign.rv", { text: s.sign }));
      text.appendChild(h("div.stamp.rv", { text: "print run · 1 of 1", "aria-label": "Print run: 1 of 1" }));
    }
    sec.appendChild(text);
    return sec;
  }

  function renderShelf(s) {
    const sec = h("section.scene.scene--shelf", { id: s.id, dataset: { mood: s.mood } });
    const text = h("div.text");
    text.appendChild(h("p.caption.rv", { text: "Epilogue" }));
    text.appendChild(h("h2.title.rv", { text: s.title }));
    (s.beats || []).forEach(b => text.appendChild(h("p.beat.rv", { text: b })));
    if (s.note) text.appendChild(h("aside.note.rv", { text: s.note }));
    if (s.interactionText) text.appendChild(h("p.prompt.rv", { text: s.interactionText, style: "font-family:var(--caps);font-size:.92rem;letter-spacing:.2em;color:var(--gold-soft);margin-top:2rem" }));
    sec.appendChild(text);
    const box = h("div.interaction.ix-constellation", { dataset: { kind: "constellation" }, style: "max-width:none;margin:0" });
    Interactions.constellation(box, s);
    sec.appendChild(box);
    partNames.push({ el: sec, name: "Epilogue · The Shelf" });
    return sec;
  }

  /** Unveil a riddle chapter (button or scroll threshold) */
  function unveil(sec, card) {
    if (!sec.classList.contains("is-veiled")) return;
    sec.classList.remove("is-veiled");
    if (card) { card.classList.add("is-done"); const b = $(".reveal", card); if (b) b.textContent = "Revealed"; }
  }

  function render() {
    const root = $("#story");
    const scenes = window.SCENES || [];
    let prevNum = null;
    scenes.forEach(s => {
      let el;
      switch (s.kind) {
        case "cover": el = renderCover(s); break;
        case "dedication": el = renderDedication(s); break;
        case "part": el = renderPart(s); break;
        case "chapter": el = renderChapterLike(s, "chapter", prevNum); break;
        case "interlude": el = renderChapterLike(s, "interlude"); break;
        case "shelf": el = renderShelf(s); break;
        case "end": el = renderChapterLike(s, "end"); break;
        default: return;
      }
      prevNum = s.kind === "chapter" ? s.num : null;
      root.appendChild(el);
    });
  }

  /* ════════════════════════════════════════════════════════════
     Interactions — each receives (container, scene) and builds itself
     ════════════════════════════════════════════════════════════ */
  const Interactions = {};

  /* hat → boa digesting an elephant */
  Interactions.hat = function (box) {
    const stage = h("div.stage.tappable", { role: "button", tabindex: "0", "aria-label": "Tap the hat" });
    const art = svg(`
      <svg viewBox="0 0 260 130" width="260" height="130">
        <g class="layer layer--hat">
          <path d="M28 104 C40 70 80 34 130 34 C180 34 220 70 232 104 Z" fill="#6a4a2f" stroke="#8a6a46" stroke-width="1.5" stroke-linejoin="round"/>
          <path d="M10 104 H250" stroke="#8a6a46" stroke-width="3" stroke-linecap="round"/>
        </g>
        <g class="layer layer--inside">
          <!-- snake outline: a long loose body around the mound, head to the left -->
          <path d="M254 104 C250 88 232 56 196 42 C160 28 110 26 76 40 C46 52 30 74 22 88 C16 98 8 104 4 110 C2 114 6 120 12 118 C18 116 22 110 26 104"
                fill="none" stroke="#e8c872" stroke-opacity=".75" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="3 4"/>
          <circle cx="16" cy="109" r="1.4" fill="#e8c872"/>
          <!-- elephant, simple silhouette, faint -->
          <g fill="#f3eee2" fill-opacity=".55">
            <ellipse cx="140" cy="74" rx="40" ry="24"/>
            <circle cx="92" cy="70" r="16"/>
            <path d="M80 76 C72 86 70 96 74 104 C76 108 82 106 82 100 C82 94 84 88 90 84 Z"/>
            <ellipse cx="100" cy="66" rx="7" ry="10"/>
            <rect x="108" y="88" width="9" height="18" rx="3"/>
            <rect x="124" y="90" width="9" height="16" rx="3"/>
            <rect x="148" y="90" width="9" height="16" rx="3"/>
            <rect x="164" y="88" width="9" height="18" rx="3"/>
            <path d="M178 66 C188 68 190 78 186 84" stroke="#f3eee2" stroke-opacity=".55" stroke-width="2" fill="none" stroke-linecap="round"/>
          </g>
        </g>
      </svg>`);
    stage.appendChild(art);
    const say = h("p.say", { text: "a hat" });
    const toggle = () => {
      const inside = box.classList.toggle("is-inside");
      say.textContent = inside ? "a boa constrictor digesting an elephant" : "a hat";
    };
    stage.addEventListener("click", toggle);
    stage.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    box.appendChild(stage); box.appendChild(say);
  };

  /* sheepbox → holes glow, box breathes, "It's asleep." */
  Interactions.sheepbox = function (box) {
    const stage = h("div.stage.tappable", { role: "button", tabindex: "0", "aria-label": "Look inside the box" });
    const art = svg(`
      <svg viewBox="0 0 240 150" width="240" height="150">
        <g class="box">
          <path d="M40 60 L140 60 L140 130 L40 130 Z" fill="#2b2418" stroke="#8a6a46" stroke-width="1.5"/>
          <path d="M40 60 L72 34 L172 34 L140 60 Z" fill="#3a3020" stroke="#8a6a46" stroke-width="1.5"/>
          <path d="M140 60 L172 34 L172 104 L140 130 Z" fill="#1f1a10" stroke="#8a6a46" stroke-width="1.5"/>
          <circle class="hole" cx="68" cy="95" r="6"/>
          <circle class="hole" cx="90" cy="95" r="6"/>
          <circle class="hole" cx="112" cy="95" r="6"/>
        </g>
      </svg>`);
    stage.appendChild(art);
    const say = h("p.say", { text: "" });
    const look = () => {
      if (box.classList.contains("is-asleep")) { box.classList.remove("is-asleep"); say.textContent = ""; return; }
      box.classList.add("is-asleep"); say.textContent = "It's asleep.";
    };
    stage.addEventListener("click", look);
    stage.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); look(); } });
    box.appendChild(stage); box.appendChild(say);
  };

  /* baobab → pull sprouts before they turn into trees */
  Interactions.baobab = function (box) {
    const ground = h("div.ground");
    ground.appendChild(h("div.soil"));
    ground.appendChild(h("div.crack"));
    const say = h("p.say", { text: "" });
    const again = h("button.again", { type: "button", text: "again" });
    let timers = [], alive = 0, pulled = 0, trees = 0, started = false;

    const leafSVG = `<svg viewBox="0 0 44 110" width="44" height="110"><path d="M22 108 V60" stroke="#9ab86a" stroke-width="3" stroke-linecap="round"/><path d="M22 70 C10 66 6 54 8 46 C18 48 24 58 22 70 Z" fill="#9ab86a"/><path d="M22 62 C34 58 38 46 36 38 C26 40 20 50 22 62 Z" fill="#b5cf7a"/></svg>`;
    const treeSVG = `<svg viewBox="0 0 44 110" width="44" height="110"><path d="M16 108 L18 60 L10 48 L14 46 L20 56 L21 30 L23 30 L24 56 L32 44 L35 47 L26 60 L28 108 Z" fill="#120d08"/><ellipse cx="22" cy="30" rx="20" ry="14" fill="#120d08"/><ellipse cx="10" cy="46" rx="9" ry="6" fill="#120d08"/><ellipse cx="34" cy="44" rx="9" ry="6" fill="#120d08"/></svg>`;

    function spawn(i) {
      const sp = h("div.sprout", { style: `left:${14 + i * 18 + rand(-4, 4)}%`, role: "button", "aria-label": "Pull sprout" });
      const leaf = h("div.leaf", { html: leafSVG });
      const tree = h("div.tree", { html: treeSVG });
      sp.appendChild(leaf); sp.appendChild(tree);
      ground.appendChild(sp);
      alive++;
      requestAnimationFrame(() => sp.classList.add("is-growing"));
      const grow = setTimeout(() => {
        if (!sp.isConnected || sp.classList.contains("is-popped")) return;
        sp.classList.add("is-tree"); trees++;
        box.classList.add("is-cracked");
        say.textContent = trees === 1 ? "Too late for that one. The ground remembers." : "The planet is splitting.";
      }, CONFIG.baobab.growMs);
      timers.push(grow);
      const pull = e => {
        e.preventDefault();
        if (sp.classList.contains("is-tree") || sp.classList.contains("is-popped")) return;
        sp.classList.add("is-popped"); clearTimeout(grow); pulled++; alive--;
        Audio.ding(rand(1200, 1700));
        setTimeout(() => sp.remove(), 400);
        say.textContent = pulled >= CONFIG.baobab.count ? "Your planet is clean. Boring work, and worth it." : ["Pulled.", "Good.", "One more.", "Keep going."][pulled % 4];
      };
      sp.addEventListener("pointerdown", pull);
    }
    function start() {
      if (started) return; started = true;
      for (let i = 0; i < CONFIG.baobab.count; i++) timers.push(setTimeout(() => spawn(i), i * CONFIG.baobab.interval));
    }
    function reset() {
      timers.forEach(clearTimeout); timers = [];
      $$(".sprout", ground).forEach(n => n.remove());
      box.classList.remove("is-cracked");
      alive = pulled = trees = 0; started = false; say.textContent = "";
      start();
    }
    again.addEventListener("click", reset);
    box.appendChild(ground); box.appendChild(say); box.appendChild(again);

    // start when the interaction scrolls into view (once)
    if (HAS_GSAP) ScrollTrigger.create({ trigger: box, start: "top 80%", once: true, onEnter: start });
    else start();
  };

  /* sunset → scrub the sun down with a chair; count to 44 */
  Interactions.sunset = function (box) {
    const skyEl = h("div.scene-sky");
    const sun = h("div.sun");
    skyEl.appendChild(sun);
    skyEl.appendChild(h("div.dune"));
    skyEl.appendChild(h("div.dune.two"));
    const range = h("input.range", { type: "range", min: "0", max: "1000", value: "0", "aria-label": "Move the chair to lower the sun" });
    const count = h("p.count", { text: "sunset 0 / " + CONFIG.sunsets });
    const say = h("p.say", { text: "" });
    let n = 0, armed = true, resetting = false;

    // colour stops: gold afternoon → amber → deep violet
    const top = [[240, 192, 112], [214, 110, 90], [40, 20, 70]];
    const bot = [[224, 138, 90], [122, 48, 78], [14, 8, 30]];
    const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
    const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
    function paint(p) {
      const t1 = clamp(p * 2, 0, 1), t2 = clamp(p * 2 - 1, 0, 1);
      const tc = p < 0.5 ? mix(top[0], top[1], t1) : mix(top[1], top[2], t2);
      const bc = p < 0.5 ? mix(bot[0], bot[1], t1) : mix(bot[1], bot[2], t2);
      skyEl.style.setProperty("--sun-sky-top", rgb(tc));
      skyEl.style.setProperty("--sun-sky-bottom", rgb(bc));
      sun.style.top = (12 + p * 54) + "%";
      sun.style.opacity = String(clamp(1 - Math.max(0, p - 0.82) * 5, 0, 1));
    }
    function onInput() {
      if (resetting) return;
      const p = range.valueAsNumber / 1000;
      paint(p);
      if (p <= 0.03) armed = true;
      if (armed && p >= 0.97) {
        armed = false; n = Math.min(n + 1, CONFIG.sunsets);
        count.textContent = "sunset " + n + " / " + CONFIG.sunsets;
        say.textContent = n >= CONFIG.sunsets ? "Forty-four. He did not say whether he was sad." : (n === 1 ? "Move the chair a few steps. It is evening again." : "");
        // glide the chair back so the sun can rise again
        resetting = true;
        const obj = { v: 1000 };
        const done = () => { range.value = "0"; paint(0); resetting = false; armed = true; };
        if (HAS_GSAP && !RM) gsap.to(obj, { v: 0, duration: 1.1, delay: 0.5, ease: "power2.inOut", onUpdate: () => { range.value = String(obj.v); paint(obj.v / 1000); }, onComplete: done });
        else setTimeout(done, 600);
      }
    }
    range.addEventListener("input", onInput);
    range.addEventListener("pointerdown", () => Audio.resume());
    paint(0);
    box.appendChild(skyEl); box.appendChild(range); box.appendChild(count); box.appendChild(say);
  };

  /* counter → the businessman's stars */
  Interactions.counter = function (box) {
    const odo = h("div.odo", { text: "0" }, h("span.plus", { text: "+1" }));
    const num = odo.firstChild;
    const lbl = h("p.lbl", { text: "stars" });
    box.appendChild(odo); box.appendChild(lbl);
    const plus = $(".plus", odo);
    let started = false;
    function run() {
      if (started) return; started = true;
      const o = { v: 0 };
      const fmt = v => Math.round(v).toLocaleString("en-US");
      if (HAS_GSAP) {
        gsap.to(o, { v: CONFIG.counterTarget, duration: CONFIG.counterDuration, ease: "power2.out", onUpdate: () => { num.textContent = fmt(o.v); }, onComplete: flicker });
      } else { num.textContent = fmt(CONFIG.counterTarget); }
      function flicker() {
        if (!HAS_GSAP) return;
        const tick = () => {
          gsap.fromTo(plus, { opacity: 0, y: 4 }, { opacity: 1, y: -6, duration: 0.35, yoyo: true, repeat: 1, ease: "sine.inOut" });
          setTimeout(tick, rand(2200, 5200));
        };
        setTimeout(tick, 900);
      }
    }
    if (HAS_GSAP) ScrollTrigger.create({ trigger: box, start: "top 75%", once: true, onEnter: run });
    else run();
  };

  /* roses → forty-eight identical roses; choose one */
  Interactions.roses = function (box) {
    const grid = h("div.grid", { role: "group", "aria-label": "A garden of roses" });
    const say = h("p.say", { text: "" });
    for (let i = 0; i < 48; i++) {
      const r = h("div.rose", { role: "button", tabindex: "0", "aria-label": "A rose" }, h("i"), h("i"), h("i"));
      const choose = () => {
        $$(".rose.is-chosen", grid).forEach(x => x.classList.remove("is-chosen"));
        r.classList.add("is-chosen");
        box.classList.add("has-choice");
        say.textContent = "There. That one.";
        Audio.ding(rand(1000, 1400));
      };
      r.addEventListener("click", choose);
      r.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
      grid.appendChild(r);
    }
    box.appendChild(grid); box.appendChild(say);
  };

  /* closer → the fox comes a step nearer each day */
  Interactions.closer = function (box) {
    const field = h("div.field.tappable", { role: "button", tabindex: "0", "aria-label": "Sit a little closer" });
    field.appendChild(h("div.line"));
    const figure = h("div.figure", { html: `<svg viewBox="0 0 42 70" width="42" height="70"><circle cx="21" cy="12" r="8" fill="#e8c872" fill-opacity=".9"/><path d="M12 24 C12 22 30 22 30 24 L30 48 L40 48 L40 52 L12 52 Z" fill="#e8c872" fill-opacity=".9"/><path d="M34 52 L34 68 L30 68 L30 52" fill="#e8c872" fill-opacity=".9"/></svg>` });
    const fox = h("div.fox", { html: `<svg viewBox="0 0 72 48" width="72" height="48">
      <path d="M6 24 L14 13 L16 2 L24 10 L34 10 L40 2 L42 14 L38 26 C32 32 16 32 6 24 Z" fill="#e8c872"/>
      <path d="M18 26 C26 30 42 24 48 34 L50 46 L16 46 C12 40 12 32 18 26 Z" fill="#e8c872"/>
      <path d="M46 42 C58 46 70 38 66 22 C64 34 56 40 44 36 Z" fill="#e8c872" fill-opacity=".85"/>
      <circle cx="22" cy="18" r="1.5" fill="#07070f"/><circle cx="32" cy="18" r="1.5" fill="#07070f"/>
    </svg>` });
    field.appendChild(figure); field.appendChild(fox);
    const say = h("p.say", { text: "" });
    const steps = [75, 64, 53, 43, 34, 24]; // percentage from the left
    let step = 0;
    const closer = () => {
      if (step >= 5) return;
      step++;
      fox.style.left = steps[step] + "%";
      fox.style.opacity = String(0.4 + step * 0.12);
      say.textContent = step < 5 ? "day " + step : "Now you may speak.";
      if (step === 5) Audio.ding(988);
    };
    field.addEventListener("click", closer);
    field.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closer(); } });
    box.appendChild(field); box.appendChild(say);
  };

  /* well → drag the rope; the pulley sings when the bucket comes back up */
  Interactions.well = function (box) {
    const shaft = h("div.shaft");
    const beam = h("div.beam"), pl = h("div.post.l"), pr = h("div.post.r");
    const wheel = h("div.wheel"), rope = h("div.rope"), bucket = h("div.bucket"), rim = h("div.rim");
    const handle = h("div.handle", { role: "slider", "aria-label": "Rope", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0", tabindex: "0" }, h("span"));
    [beam, pl, pr, wheel, rope, bucket, rim, handle].forEach(n => shaft.appendChild(n));
    const say = h("p.say", { text: "" });
    const hint = h("p.hintline", { text: "drag down, then up" });

    const TRAVEL = 110; // px of bucket travel
    let p = 0, maxP = 0, dragging = false, startY = 0, startP = 0;
    function paint() {
      rope.style.height = (40 + p * TRAVEL) + "px";
      bucket.style.top = (76 + p * TRAVEL) + "px";
      handle.style.top = (60 + p * TRAVEL) + "px";
      handle.style.bottom = "auto";
      wheel.style.transform = `rotate(${p * 540}deg)`;
      handle.setAttribute("aria-valuenow", String(Math.round(p * 100)));
    }
    function setP(v) {
      const prev = p;
      p = clamp(v, 0, 1);
      if (p > maxP) maxP = p;
      // bucket passes the top on its way back up
      if (prev > 0.08 && p <= 0.08 && maxP > 0.6) {
        Audio.creak();
        say.textContent = "The pulley sings.";
        maxP = 0;
      }
      paint();
    }
    handle.addEventListener("pointerdown", e => {
      dragging = true; startY = e.clientY; startP = p;
      handle.setPointerCapture(e.pointerId);
      Audio.resume();
      e.preventDefault();
    });
    handle.addEventListener("pointermove", e => {
      if (!dragging) return;
      setP(startP + (e.clientY - startY) / TRAVEL);
    });
    const end = () => { dragging = false; };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); setP(p + 0.1); }
      if (e.key === "ArrowUp") { e.preventDefault(); setP(p - 0.1); }
    });
    paint();
    box.appendChild(shaft); box.appendChild(hint); box.appendChild(say);
  };

  /* bells → a dark sky of stars that laugh when tapped */
  Interactions.bells = function (box) {
    const panel = h("div.panel", { role: "group", "aria-label": "Stars that laugh" });
    const laughed = h("div.laughed", { text: "" });
    const rnd = seeded(4242);
    const stars = [];
    for (let i = 0; i < CONFIG.bells.count; i++) {
      const x = 4 + rnd() * 92, y = 6 + rnd() * 84;
      const st = h("div.bell-star", { style: `left:${x}%;top:${y}%`, role: "button", tabindex: "0", "aria-label": "A star" }, h("i"), h("span.ripple"));
      st._x = x; st._y = y;
      stars.push(st); panel.appendChild(st);
    }
    let n = 0, auto = null;
    function twinkle(st) {
      st.classList.remove("is-twinkle"); void st.offsetWidth; st.classList.add("is-twinkle");
    }
    function ring(st) {
      Audio.ding();
      st.classList.remove("is-rung"); void st.offsetWidth; st.classList.add("is-rung");
      setTimeout(() => st.classList.remove("is-rung"), 1200);
      n++; laughed.textContent = "laughed " + n;
      // nearby stars catch it
      stars.filter(o => o !== st).map(o => ({ o, d: Math.hypot(o._x - st._x, o._y - st._y) }))
        .sort((a, b) => a.d - b.d).slice(0, 4)
        .forEach((e, i) => setTimeout(() => twinkle(e.o), 120 + i * 140));
      if (!auto) auto = setInterval(() => twinkle(stars[Math.floor(Math.random() * stars.length)]), 700);
    }
    stars.forEach(st => {
      st.addEventListener("click", () => ring(st));
      st.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ring(st); } });
    });
    panel.appendChild(laughed);
    box.appendChild(panel);
    // stop the auto-twinkle when far away, to save battery
    if (HAS_GSAP) ScrollTrigger.create({ trigger: panel, start: "top bottom", end: "bottom top", onLeave: stop, onLeaveBack: stop });
    function stop() { if (auto) { clearInterval(auto); auto = null; } }
  };

  /* constellation → her shelf, as a sky */
  Interactions.constellation = function (box, scene) {
    const names = scene.stars || [];
    const wrap = h("div.constellation", { role: "group", "aria-label": "A constellation of editions" });
    const lines = svg(`<svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>`);
    wrap.appendChild(lines);
    const counter = h("div.counter", { text: "" });

    // seeded placement with a minimum distance, then chained nearest-neighbour from the leftmost
    const rnd = seeded(1943);
    const pts = [];
    let guard = 0;
    while (pts.length < names.length && guard++ < 5000) {
      const x = 10 + rnd() * 80, y = 12 + rnd() * 70;
      if (pts.every(q => Math.hypot(q.x - x, (q.y - y) * 1.3) >= CONFIG.constellation.minDist)) pts.push({ x, y });
    }
    while (pts.length < names.length) pts.push({ x: 10 + rnd() * 80, y: 12 + rnd() * 70 });
    const order = []; const left = pts.slice();
    let cur = left.splice(left.reduce((bi, q, i, a) => (q.x < a[bi].x ? i : bi), 0), 1)[0];
    order.push(cur);
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((q, i) => { const d = Math.hypot(q.x - cur.x, q.y - cur.y); if (d < bd) { bd = d; bi = i; } });
      cur = left.splice(bi, 1)[0]; order.push(cur);
    }
    for (let i = 1; i < order.length; i++) {
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", order[i - 1].x); l.setAttribute("y1", order[i - 1].y);
      l.setAttribute("x2", order[i].x); l.setAttribute("y2", order[i].y);
      l.setAttribute("vector-effect", "non-scaling-stroke");
      lines.appendChild(l);
    }
    const lit = new Set();
    order.forEach((q, i) => {
      const st = h("div.cstar", { style: `left:${q.x}%;top:${q.y}%`, role: "button", tabindex: "0", "aria-label": names[i] }, h("i"), h("span.tip", { text: names[i] }));
      if (q.x > 78) st.classList.add("is-edge"); else if (q.x < 22) st.classList.add("is-edge-l");
      const tap = () => {
        $$(".cstar.is-lit", wrap).forEach(o => { if (o !== st) o.classList.remove("is-lit"); o.classList.add("was-lit"); });
        st.classList.add("is-lit");
        lit.add(i);
        Audio.ding(rand(900, 1500));
        counter.textContent = lit.size + " of " + names.length;
        if (lit.size >= CONFIG.constellation.needed) roseStar.classList.add("is-shown");
      };
      st.addEventListener("click", tap);
      st.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(); } });
      wrap.appendChild(st);
    });
    // the 22nd star: rose-coloured, apart, unlabelled — placed at the spot farthest from all others
    let best = { x: 85, y: 20 }, bestD = -1;
    for (let gx = 8; gx <= 92; gx += 4) for (let gy = 10; gy <= 86; gy += 4) {
      const d = Math.min(...pts.map(q => Math.hypot(q.x - gx, q.y - gy)));
      if (d > bestD) { bestD = d; best = { x: gx, y: gy }; }
    }
    const roseStar = h("div.cstar.cstar--rose", { style: `left:${best.x}%;top:${best.y}%`, "aria-hidden": "true" }, h("i"));
    wrap.appendChild(roseStar);
    wrap.appendChild(counter);
    box.appendChild(wrap);
    // keep once-lit stars faintly brighter
    const style = document.createElement("style");
    style.textContent = ".cstar.was-lit i{background:var(--gold);transform:scale(1.4);box-shadow:0 0 8px var(--gold-glow)}";
    document.head.appendChild(style);
  };

  /* ════════════════════════════════════════════════════════════
     Scroll choreography (GSAP + ScrollTrigger)
     ════════════════════════════════════════════════════════════ */
  function choreograph() {
    if (!HAS_GSAP) {
      // no GSAP: show everything, pick mood by IntersectionObserver
      $$(".rv").forEach(el => el.classList.add("is-in"));
      $$(".scene--part .rule").forEach(r => r.style.transform = "none");
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setMood(e.target.dataset.mood); }), { rootMargin: "-45% 0px -45% 0px" });
      $$(".scene").forEach(s => io.observe(s));
      $$(".scene.is-veiled").forEach(s => s.classList.remove("is-veiled"));
      return;
    }

    // Mood per scene
    $$(".scene").forEach(sec => {
      const mood = sec.dataset.mood;
      ScrollTrigger.create({
        trigger: sec, start: CONFIG.moodTrigger.start, end: CONFIG.moodTrigger.end,
        onEnter: () => setMood(mood), onEnterBack: () => setMood(mood)
      });
    });

    // Reveals: each .rv fades/rises in once when it reaches ~78% of the viewport
    $$(".rv").forEach(el => {
      const slow = el.classList.contains("rv--slow");
      const inCover = !!el.closest(".scene--cover");
      const isTitle = el.classList.contains("title");
      const isStamp = el.classList.contains("stamp");
      const from = { opacity: 0, y: RM ? 0 : CONFIG.reveal.y };
      if (!RM) from.filter = "blur(" + CONFIG.reveal.blur + "px)";         // text settles into focus, like a slow lens
      if (!RM && isTitle && !inCover) from.letterSpacing = CONFIG.reveal.titleTracking;
      if (!RM && isStamp) { from.scale = 1.7; from.rotation = -9; from.y = 0; from.filter = "none"; }
      gsap.set(el, from);
      if (inCover) return; // handled as a timeline below
      const to = { opacity: 1, y: 0, duration: slow ? CONFIG.dedication.duration : CONFIG.reveal.duration, ease: CONFIG.reveal.ease,
        onComplete: () => { el.classList.add("is-in"); gsap.set(el, { clearProps: "filter,letterSpacing" }); } };
      if (!RM) to.filter = "blur(0px)";
      if (!RM && isTitle && !inCover) { to.letterSpacing = "0em"; to.duration = CONFIG.reveal.duration * 1.6; }
      if (!RM && isStamp) { to.scale = 1; to.rotation = -1.5; to.duration = 0.7; to.ease = "back.out(2.2)"; to.filter = "none"; }
      ScrollTrigger.create({
        trigger: el, start: slow ? "top 85%" : (isStamp ? "top 90%" : CONFIG.reveal.start), once: true,
        onEnter: () => gsap.to(el, to)
      });
    });
    // Cover: the image breathes out, the text rises in, the one bright star wakes last
    const coverEls = $$(".scene--cover .rv");
    const coverLayers = $$(".scene--cover .slot img, .scene--cover .slot .art");
    const heroStar = $(".scene--cover .hero-star");
    if (!RM && coverLayers.length) gsap.fromTo(coverLayers, { scale: 1.1 }, { scale: 1, duration: 7, ease: "power2.out" });
    gsap.to(coverEls, { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.6, ease: "power2.out", stagger: 0.22, delay: 0.3, onComplete: () => coverEls.forEach(e => { e.classList.add("is-in"); gsap.set(e, { clearProps: "filter" }); }) });
    if (heroStar) {
      gsap.fromTo(heroStar, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 2.4, ease: "power2.out", delay: 1.4, onComplete: () => heroStar.classList.add("is-awake") });
      // the cover drifts up slower than the page and the star fades as the cover leaves
      if (!RM) gsap.to(coverLayers, { y: "18vh", ease: "none", scrollTrigger: { trigger: ".scene--cover", start: "top top", end: "bottom top", scrub: true } });
      gsap.to(heroStar, { opacity: 0, ease: "none", scrollTrigger: { trigger: ".scene--cover", start: "top top", end: "60% top", scrub: true } });
    }
    // Part numerals drift a little slower than the page, so the divider feels like a held breath
    if (!RM) $$(".scene--part .numeral").forEach(n => {
      gsap.fromTo(n, { y: 60, scale: 0.94 }, { y: -60, scale: 1.04, ease: "none", scrollTrigger: { trigger: n.closest(".scene--part"), start: "top bottom", end: "bottom top", scrub: 0.8 } });
    });
    // The fall: when the last line of chapter 26 arrives, the whole page holds its breath
    const fallBeat = $$("#c26c .text .beat").pop();
    const vig0 = $("#vignette");
    if (fallBeat && vig0) {
      ScrollTrigger.create({ trigger: fallBeat, start: "top 70%", once: true, onEnter: () => {
        gsap.timeline().to(vig0, { opacity: RM ? 0.5 : 0.92, duration: 2.4, ease: "sine.inOut" }).to(vig0, { opacity: 0, duration: 5, ease: "sine.inOut" });
      } });
    }
    // The shelf: the constellation draws itself as it comes into view
    const cons = $(".scene--shelf .constellation");
    if (cons) {
      const lines = $$("svg.lines line", cons), cstars = $$(".cstar:not(.cstar--rose)", cons);
      lines.forEach(l => { l.setAttribute("pathLength", "1"); l.style.strokeDasharray = "1"; l.style.strokeDashoffset = "1"; });
      gsap.set(cstars, { opacity: 0, scale: 0.3 });
      ScrollTrigger.create({ trigger: cons, start: "top 70%", once: true, onEnter: () => {
        gsap.to(cstars, { opacity: 1, scale: 1, duration: RM ? 0.3 : 1.2, ease: "power2.out", stagger: RM ? 0 : 0.09 });
        gsap.to(lines, { strokeDashoffset: 0, duration: RM ? 0.3 : 0.9, ease: "power1.inOut", stagger: RM ? 0 : 0.12, delay: RM ? 0 : 0.4 });
      } });
    }
    // The colophon: night turns to dawn over the rooftops as the last lines scroll by
    $$(".slot img.xfade").forEach(x => {
      const sec = x.closest(".scene"), text = $(".text", sec);
      if (!sec || !text) return;
      gsap.fromTo(x, { opacity: 0 }, { opacity: 1, ease: "none", scrollTrigger: { trigger: text, start: "top 55%", end: "bottom 92%", scrub: 0.5 } });
    });

    // Part rule draws itself
    $$(".scene--part .rule").forEach(r => {
      gsap.fromTo(r, { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: "power3.inOut", scrollTrigger: { trigger: r, start: "top 80%", once: true } });
    });

    // Ken Burns on each sticky hero image across its scene
    if (!RM) {
      $$(".scene--chapter, .scene--interlude, .scene--end").forEach(sec => {
        const layers = $$(".hero .slot img, .hero .slot .art", sec);
        if (!layers.length) return;
        gsap.fromTo(layers, { scale: CONFIG.kenBurns.from }, {
          scale: CONFIG.kenBurns.to, ease: "none",
          scrollTrigger: { trigger: sec, start: "top bottom", end: "bottom top", scrub: 0.6 }
        });
      });
      // Suns in the art sink slowly as their scene scrolls by (the forty-four-sunsets scene sinks farthest)
      $$(".scene").forEach(sec => {
        const suns = $$(".art-sun", sec);
        if (!suns.length) return;
        const travel = CONFIG.sunScrub.travel * (sec.id === "c06" ? 2.2 : 1);
        gsap.fromTo(suns, { y: -travel * 0.3 }, {
          y: travel * 0.7, ease: "none",
          scrollTrigger: { trigger: sec, start: "top bottom", end: "bottom top", scrub: 0.8 }
        });
      });
    }

    // Chapter transitions: a slow vignette dip whenever a new part begins
    const vig = $("#vignette");
    if (vig) {
      let dip = null;
      const doDip = () => {
        if (dip) dip.kill();
        const d = CONFIG.vignette.duration;
        dip = gsap.timeline().to(vig, { opacity: RM ? 0.5 : 1, duration: d * 0.4, ease: "sine.inOut" }).to(vig, { opacity: 0, duration: d * 0.6, ease: "sine.inOut" });
      };
      $$(".scene--part").forEach(sec => {
        ScrollTrigger.create({ trigger: sec, start: "top 60%", end: "bottom 40%", onEnter: doDip, onEnterBack: doDip });
      });
    }

    // After the colophon stamp, the stars drift slowly upward for the quiet tail
    const quiet = $(".quiet");
    if (quiet) {
      ScrollTrigger.create({ trigger: quiet, start: "top 95%", onEnter: () => Sky.setDrift(true), onLeaveBack: () => Sky.setDrift(false) });
    }

    // Phones: as the text column scrolls up over the sticky hero, dim the image for legibility
    const mm = gsap.matchMedia();
    mm.add("(max-width: 899px)", () => {
      $$(".scene--chapter, .scene--interlude, .scene--end").forEach(sec => {
        const veil = $(".hero .veil", sec), text = $(".text", sec);
        if (!veil || !text) return;
        gsap.fromTo(veil, { opacity: 0 }, {
          opacity: 0.74, ease: "none",
          scrollTrigger: { trigger: text, start: "top 60%", end: "top 12%", scrub: true }
        });
      });
    });

    // Riddle chapters unveil when the title scrolls to the threshold
    $$(".scene.is-veiled").forEach(sec => {
      const firstBeat = $(".text .beat", sec) || $(".text .title", sec);
      ScrollTrigger.create({ trigger: firstBeat, start: CONFIG.riddle.unveilAt, once: true, onEnter: () => unveil(sec, $(".riddle", sec)) });
    });

    // Refresh after everything has settled (fonts, late layout)
    window.addEventListener("load", () => ScrollTrigger.refresh());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* ════════════════════════════════════════════════════════════
     Progress planet
     ════════════════════════════════════════════════════════════ */
  function initProgress() {
    const nav = $("#progress"); if (!nav) return;
    const planet = $(".planet", nav), label = $(".label", nav), track = $(".track", nav);
    let hideT = null;
    function currentPart() {
      const mid = window.scrollY + window.innerHeight * 0.5;
      let name = "The Only Copy";
      for (const p of partNames) { if (p.el.offsetTop <= mid) name = p.name; }
      return name;
    }
    function update() {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const t = clamp(window.scrollY / max, 0, 1);
      const len = track.offsetHeight;
      const y = t * len;
      planet.style.transform = `translateY(${y}px)`;
      label.style.top = `calc(12vh + ${y}px)`;
      label.textContent = currentPart();
    }
    function show() {
      nav.classList.add("show-label");
      clearTimeout(hideT); hideT = setTimeout(() => nav.classList.remove("show-label"), 1800);
    }
    planet.addEventListener("click", show);
    planet.addEventListener("pointerenter", () => { nav.classList.add("show-label"); clearTimeout(hideT); });
    planet.addEventListener("pointerleave", () => { hideT = setTimeout(() => nav.classList.remove("show-label"), 500); });
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  /* ════════════════════════════════════════════════════════════
     Passphrase gate (optional). Nothing of the story renders until
     it is solved, so the page height gives nothing away.
     ════════════════════════════════════════════════════════════ */
  const Gate = (() => {
    const norm = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "");
    function remembered() { try { return localStorage.getItem(CONFIG.gateStorageKey) === norm(CONFIG.gate.answer); } catch (_) { return false; } }
    function remember() { try { localStorage.setItem(CONFIG.gateStorageKey, norm(CONFIG.gate.answer)); } catch (_) {} }
    function needed() { return !!(CONFIG.gate.enabled && CONFIG.gate.answer) && !remembered(); }

    function show(onUnlock) {
      document.body.classList.add("is-gated");
      const field = h("div.gate-field");
      const input = h("input", { id: "gate-input", type: "text", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", autofocus: true, placeholder: " ", "aria-describedby": "gate-hint" });
      field.appendChild(input);
      const form = h("form.gate-card", { novalidate: true },
        h("h1.gate-title", { id: "gate-title", text: CONFIG.gate.title || "This edition opens with a word." }),
        h("p.gate-hint", { id: "gate-hint", text: CONFIG.gate.hint || "" }),
        h("label.vh", { for: "gate-input", text: "Your answer" }),
        field,
        h("p.gate-foot", { text: "press enter" })
      );
      const gate = h("div", { id: "gate", role: "dialog", "aria-modal": "true", "aria-labelledby": "gate-title" }, form);
      document.body.appendChild(gate);
      setTimeout(() => input.focus(), 50);

      form.addEventListener("submit", e => {
        e.preventDefault();
        if (norm(input.value) && norm(input.value) === norm(CONFIG.gate.answer)) {
          remember();
          input.disabled = true;
          onUnlock();
          const finish = () => { gate.remove(); document.body.classList.remove("is-gated"); if (HAS_GSAP) ScrollTrigger.refresh(); };
          if (HAS_GSAP && !RM) gsap.to(gate, { opacity: 0, duration: 1.2, ease: "power2.inOut", onComplete: finish });
          else finish();
        } else {
          field.classList.remove("is-wrong"); void field.offsetWidth; field.classList.add("is-wrong");
          setTimeout(() => { input.value = ""; }, 260);
          setTimeout(() => field.classList.remove("is-wrong"), 600);
        }
      });
    }
    return { needed, show };
  })();

  /* ════════════════════════════════════════════════════════════
     Boot
     ════════════════════════════════════════════════════════════ */
  function start() {
    render();
    choreograph();
    initProgress();
    Audio.initBgm();
  }

  function boot() {
    document.documentElement.classList.add("js");
    // The first user gesture unlocks WebAudio for the small sounds
    const unlock = () => { Audio.resume(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    if (Gate.needed()) { window.scrollTo(0, 0); Gate.show(start); }
    else start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
