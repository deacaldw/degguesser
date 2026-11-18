/* ==========================================================================
   DegGuesser (standalone) — game logic
   Modes, rules, colours, emoji and sounds are all set in MODES below.
   Uses deacald.js (window.deacald) for icons, emoji, charts and effects.
   ========================================================================== */

(() => {
  const dc = window.deacald;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fmt = (n) => String(Math.round(n * 10) / 10).replace("-", "−");
  const fromC = (c, unit) => (unit === "F" ? (c * 9) / 5 + 32 : c);
  const intoC = (v, unit) => (unit === "F" ? ((v - 32) * 5) / 9 : v);
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const isLight = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b > 150;

  /* ---------------------------------------------------------- storage */
  const KEY = "degguesser-standalone";
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(`${KEY}:${k}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(`${KEY}:${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  /* ---------------------------------------------------------- sound */
  /* new Sound(files, { volume, mode }): one file picked at random each time.
     mode "skip" plays only once loaded (clicks); "wait" waits for it (start, end).
     Everything starts loading once the page has painted and gone idle. */
  let audioCtx, decoder;
  const audio = () => { audioCtx ||= new AudioContext(); if (audioCtx.state === "suspended") audioCtx.resume(); return audioCtx; };
  const decode = (url) => fetch(url).then((r) => r.arrayBuffer()).then((b) => (decoder ||= new OfflineAudioContext(1, 1, 48000)).decodeAudioData(b));
  class Sound {
    constructor(files, { volume = 1, mode = "wait" } = {}) { Object.assign(this, { files, volume, mode, buffers: [], last: -1 }); }
    load() { return (this.loading ||= Promise.allSettled(this.files.map((f) => decode(`res/sounds/${f}`).then((b) => this.buffers.push(b))))); }
    async play() {
      if (!store.get("sound", true)) return;
      const ctx = audio();
      this.load();
      if (this.mode === "wait") await this.loading;
      const n = this.buffers.length;
      if (!n) return;
      let i = Math.floor(Math.random() * n);
      if (n > 1 && i === this.last) i = (i + 1) % n;
      this.last = i;
      const src = ctx.createBufferSource(), gain = ctx.createGain();
      src.buffer = this.buffers[i];
      gain.gain.value = this.volume;
      src.connect(gain).connect(ctx.destination);
      src.start();
    }
  }
  const SOUNDS = {
    click: new Sound(Array.from({ length: 9 }, (_, i) => `click_${i + 1}.wav`), { volume: 0.3, mode: "skip" }),
    start: new Sound(["game-start.wav"], { volume: 0.5 }),
    startPermadeath: new Sound(["game-start-permadeath.wav"], { volume: 0.5 }),
    end: new Sound(["game-end.wav"], { volume: 0.5 }),
    achievement: new Sound(["achievement.wav"], { volume: 0.5 }),
  };

  // A click on pressing and on releasing anything clickable (the thermometer too)
  const CLICKABLE = "button, [role=slider], label.list__row";
  let pressed = false;
  document.addEventListener("pointerdown", (e) => {
    const el = e.button === 0 && e.target.closest(CLICKABLE);
    if (!el || el.disabled || el.dataset.sound === "none") return;
    pressed = true;
    SOUNDS.click.play();
  }, true);
  document.addEventListener("pointerup", () => { if (pressed) SOUNDS.click.play(); pressed = false; }, true);
  document.addEventListener("pointercancel", () => { pressed = false; }, true);

  /* ---------------------------------------------------------- modes */
  const BASE = {
    rounds: 6,
    perfectWithin: 1,     // within this many degrees (of the unit you guess) = 100 points
    zeroBeyondC: 10,      // this many °C off or more = 0 points (linear in between)
    favouriteChance: 0.25,
    confettiAbove: 400,
    historyGames: 5,
    startC: 0,            // the thermometer starts here each round
    minC: -40, maxC: 40,  // temperatures asked about
    scaleBottomC: -40, scaleTopC: 50,
  };
  const MODES = {
    weather: {
      name: "Weather", emoji: "🌤️", tone: "blue", blurb: "Guess everyday temperatures",
      rules: BASE,
      gradient: [
        { c: -40, color: "#13245e" }, { c: -15, color: "#2f6fd6" }, { c: 5, color: "#f3c94f" }, { c: 15, color: "#ffe39a" },
        { c: 27, color: "#fffaf0" }, { c: 38, color: "#ff8a5c" }, { c: 50, color: "#c4211b" },
      ],
      favourites: [-40, -18, 0, 4, 20, 25, 37],
      feels: [
        { below: -10, emoji: "🥶", label: "Bitterly cold" }, { below: 0, emoji: "⛄", label: "Freezing" },
        { below: 8, emoji: "🧥", label: "Coat weather" }, { below: 16, emoji: "🍂", label: "Chilly" },
        { below: 24, emoji: "🙂", label: "Comfortable" }, { below: 30, emoji: "😎", label: "Warm" },
        { below: 36, emoji: "🥵", label: "Hot" }, { below: 38, emoji: "🤒", label: "Body temperature" },
        { below: 999, emoji: "🏜️", label: "Desert heat" },
      ],
    },
    oven: {
      name: "Oven", emoji: "🧁", tone: "gold", blurb: "Guess oven temperatures",
      rules: { ...BASE, minC: 80, maxC: 300, scaleBottomC: 70, scaleTopC: 310, startC: 180 },
      gradient: [{ c: 70, color: "#f3c94f" }, { c: 150, color: "#ffa04d" }, { c: 230, color: "#e8452c" }, { c: 310, color: "#8f1414" }],
      favourites: [100, 160, 180, 200, 220, 250],
      feels: [
        { below: 100, emoji: "🥩", label: "Drying jerky" }, { below: 130, emoji: "🥚", label: "Meringues" },
        { below: 150, emoji: "🍖", label: "Slow-roast ribs" }, { below: 170, emoji: "🍰", label: "Cheesecake" },
        { below: 185, emoji: "🍪", label: "Cookies" }, { below: 195, emoji: "🎂", label: "Birthday cake" },
        { below: 210, emoji: "🥐", label: "Croissants" }, { below: 230, emoji: "🍞", label: "Crusty bread" },
        { below: 250, emoji: "🥔", label: "Roast potatoes" }, { below: 285, emoji: "🍕", label: "Pizza" },
        { below: 999, emoji: "🫓", label: "Tandoor flatbread" },
      ],
    },
    permadeath: {
      name: "Permadeath", emoji: "☠️", tone: "red", tile: "night", blurb: "One big miss and it's over",
      rules: { ...BASE, timeLimit: 15, releaseConfirms: true, failBeyondC: 10, plainPrompt: true },
      sound: "startPermadeath",
      gradient: [{ c: -40, color: "#c4211b" }, { c: 50, color: "#c4211b" }],
      feels: [
        { below: -25, emoji: "☠️" }, { below: -10, emoji: "💀" }, { below: 0, emoji: "👻" }, { below: 10, emoji: "😱" },
        { below: 20, emoji: "🪦" }, { below: 30, emoji: "⚰️" }, { below: 40, emoji: "🦇" }, { below: 999, emoji: "🧟" },
      ],
    },
  };
  MODES.permadeath.favourites = MODES.weather.favourites;

  /* ---------------------------------------------------------- state */
  const prefs = store.get("prefs", {});
  const state = {
    mode: MODES[prefs.mode] ? prefs.mode : "weather",
    familiar: prefs.familiar === "F" ? "F" : "C", // prompts use it; you guess in the other
    submit: prefs.submit === "button" ? "button" : "release", // how a guess locks in (Weather, Oven)
    round: 0, score: 0, history: [],
    prompt: null, actualC: 0, guess: 0,
    phase: "start",                               // start | guess | reveal | final
    failed: null,                                 // { round, off } after a permadeath miss
  };
  let def, rules;
  const guessUnit = () => (state.familiar === "C" ? "F" : "C");
  const actualRounded = () => Math.round(fromC(state.actualC, guessUnit()));
  const perfectC = () => (guessUnit() === "F" ? (rules.perfectWithin * 5) / 9 : rules.perfectWithin);
  const modeKey = () => `${state.mode}:${state.familiar}`;
  const releaseConfirms = () => !!rules.releaseConfirms || state.submit === "release";
  const savePrefs = () => store.set("prefs", { mode: state.mode, familiar: state.familiar, submit: state.submit });

  /* ---------------------------------------------------------- bottom bar */
  // Sticks to the viewport only while content runs under it; then it's a separate bar.
  // While playing, it floats over the thermometer with just its button (see the CSS).
  new IntersectionObserver(([e]) => $("bottombar").classList.toggle("is-stuck", !e.isIntersecting)).observe($("sentinel"));

  /** setBar(label, value, button): an empty label hides the text; button null hides the bar's button. */
  function setBar(label, value, button, { bad = false } = {}) {
    $("bar-label").textContent = label;
    $("bar-label").classList.toggle("is-bad", bad);
    $("bar-value").innerHTML = value;
    $("bar-info").hidden = !label;
    $("go-btn").hidden = !button;
    if (button) $("go-btn").textContent = button;
    $("bottombar").hidden = !label && !button;
  }

  /* ---------------------------------------------------------- thermometer */
  /* The drawing keeps its width and grows or shrinks in length to fit the
     canvas, so the handle and labels stay the same size. The viewBox is
     symmetric around G.cx, so the tube is always centred. */
  const W = 352;                                   // drawing width, in px at full size
  const G = { cx: 180, top: 24, yHi: 54, liqHalf: 6, liqBulbR: 22, H: 540, bulbY: 478, yLo: 418 };
  const fitThermo = () => {
    const box = thermo.parentElement.getBoundingClientRect();
    const k = Math.min(1, box.width / W);          // narrower than the drawing: scale it down to fit
    G.H = Math.max(260, box.height / k);
    G.bulbY = G.H - 62;
    G.yLo = G.bulbY - 60;
  };
  let bottomC, topC;
  const yOf = (c) => G.yLo - ((c - bottomC) / (topC - bottomC)) * (G.yLo - G.yHi);
  const cOfY = (y) => bottomC + ((G.yLo - y) / (G.yLo - G.yHi)) * (topC - bottomC);

  // Speech bubble left of the knob; its tail tip is the pivot it swings around
  const B = { x0: G.cx - 96, x1: G.cx - 38, y0: -27, y1: 27, r: 12, tip: G.cx - 15 };
  const bubblePath = () => {
    const { x0, x1, y0, y1, r, tip } = B;
    return `M${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V-7 L${tip},0 L${x1},7
      V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`;
  };

  const thermo = $("thermo");
  let els, levelC = 0, tween;

  function buildThermo() {
    fitThermo();
    drawnH = thermo.parentElement.getBoundingClientRect().height;
    bottomC = rules.scaleBottomC;
    topC = rules.scaleTopC;
    const bulbR = 36, tubeHalf = 19, chR = 26, chHalf = 9;
    const join = Math.sqrt(bulbR ** 2 - tubeHalf ** 2), chJoin = Math.sqrt(chR ** 2 - chHalf ** 2);
    const glass = `M${G.cx - tubeHalf},${G.top + tubeHalf} A${tubeHalf},${tubeHalf} 0 0 1 ${G.cx + tubeHalf},${G.top + tubeHalf}
      L${G.cx + tubeHalf},${G.bulbY - join} A${bulbR},${bulbR} 0 1 1 ${G.cx - tubeHalf},${G.bulbY - join} Z`;
    const channel = `M${G.cx - chHalf},${G.top + 16} A${chHalf},${chHalf} 0 0 1 ${G.cx + chHalf},${G.top + 16}
      L${G.cx + chHalf},${G.bulbY - chJoin} A${chR},${chR} 0 1 1 ${G.cx - chHalf},${G.bulbY - chJoin} Z`;
    const stops = def.gradient
      .map((s) => `<stop offset="${clamp((s.c - bottomC) / (topC - bottomC), 0, 1).toFixed(3)}" stop-color="${s.color}"/>`).join("");
    const arrow = (id) => `<g class="reveal-arrow reveal-arrow--${id}" id="t-arrow-${id}">
        <path class="reveal-arrow__tip" d="M${G.cx + 86},0 l8,-5 v10 z"/>
        <text class="reveal-arrow__label" x="${G.cx + 99}"></text>
        <text class="reveal-arrow__num" x="${G.cx + 99}"></text>
      </g>`;
    const HALF = 176; // widest content either side of the tube (bubble left, arrow labels right)
    const E = 34;     // emoji size in the bubble
    thermo.setAttribute("viewBox", `${G.cx - HALF} 0 ${HALF * 2} ${G.H}`);
    thermo.innerHTML = `
      <defs>
        <linearGradient id="liq-grad" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${yOf(bottomC)}" y2="${yOf(topC)}">${stops}</linearGradient>
        <filter id="t-shadow" filterUnits="userSpaceOnUse" x="-80" y="-120" width="560" height="780">
          <feDropShadow dx="0" dy="8" stdDeviation="13" flood-color="#10141e" flood-opacity=".12"/>
        </filter>
        <filter id="t-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="8"/></filter>
      </defs>
      <g class="scale-prompt" id="t-scale-prompt"></g>
      <g id="t-scale-guess"></g>
      <path class="glass" d="${glass}" filter="url(#t-shadow)"/>
      <path class="channel" d="${channel}"/>
      <use class="liquid-glow" href="#t-liquid" filter="url(#t-glow)"/>
      <path class="liquid" id="t-liquid" fill="url(#liq-grad)"/>
      ${arrow("guess")}
      ${arrow("actual")}
      <g class="feel" id="t-feel">
        <title></title>
        <path class="feel__bubble" d="${bubblePath()}" filter="url(#t-shadow)"/>
        <image class="feel__emoji" x="${(B.x0 + B.x1) / 2 - E / 2}" y="${-E / 2}" width="${E}" height="${E}"/>
      </g>
      <g class="knob" id="t-knob">
        <circle class="knob__glow" cx="${G.cx}" cy="0" r="17" filter="url(#t-glow)"/>
        <circle class="knob__face" cx="${G.cx}" cy="0" r="13"/>
        <path d="M${G.cx - 4},-2.5 l4,-4 l4,4 M${G.cx - 4},2.5 l4,4 l4,-4"/>
      </g>
      <rect x="${G.cx - 80}" y="${G.yHi - 30}" width="160" height="${G.bulbY - G.yHi + 60}" fill="transparent"/>`;

    els = { liquid: $("t-liquid"), knob: $("t-knob"), feel: $("t-feel"), arrowGuess: $("t-arrow-guess"), arrowActual: $("t-arrow-actual") };
    Object.assign(feel, { emoji: null, y: null, vel: 0, angle: 0, spin: 0 });
    drawScale($("t-scale-guess"), guessUnit(), 1);
    drawScale($("t-scale-prompt"), state.familiar, -1);
  }

  // Redraw at the new length whenever the canvas changes size, keeping the guess or the reveal
  let drawnH = 0;
  new ResizeObserver(([e]) => {
    const h = e.contentRect.height;
    if (!h || Math.abs(h - drawnH) < 1 || !["guess", "reveal"].includes(state.phase)) return;
    buildThermo();
    if (state.phase === "guess") setGuess(state.guess);
    else { setLevel(state.actualC); placeArrows(); }
  }).observe(thermo.parentElement);

  /** Ticks and labels on one side of the tube (side: 1 = right, -1 = left). */
  function drawScale(g, unit, side) {
    const lo = fromC(bottomC, unit), hi = fromC(topC, unit);
    const px = (G.yLo - G.yHi) / (hi - lo);        // drawing units per degree
    const major = [10, 20, 25, 50, 100].find((m) => m * px >= 22) || 100; // labels at least 22 apart
    const minor = [1, 2, 5, 10, 20].find((m) => major % m === 0 && m * px >= 4 && major / m <= 10) || major;
    const anchor = side === 1 ? "start" : "end";
    const x0 = G.cx + side * 24;
    let out = "";
    for (let v = Math.ceil(lo / minor) * minor; v <= hi + 1e-9; v += minor) {
      const y = yOf(intoC(v, unit)).toFixed(1);
      const isMajor = Math.abs(v % major) < 1e-9;
      out += `<line class="tick${isMajor ? "" : " minor"}" x1="${x0}" x2="${x0 + side * (isMajor ? 16 : 8)}" y1="${y}" y2="${y}"/>`;
      if (isMajor) out += `<text class="tick-label" x="${G.cx + side * 46}" y="${+y + 5}" text-anchor="${anchor}">${fmt(v)}</text>`;
    }
    g.innerHTML = out + `<text class="unit-label" x="${G.cx + side * 46}" y="${G.yHi - 26}" text-anchor="${anchor}">°${unit}</text>`;
  }

  /** Column and bulb as one shape. */
  function setLevel(c) {
    levelC = c;
    const y = yOf(clamp(c, bottomC - 4, topC + 2)).toFixed(1);
    const L = G.cx - G.liqHalf, R = G.cx + G.liqHalf, r = G.liqBulbR;
    const j = (G.bulbY - Math.sqrt(r * r - G.liqHalf * G.liqHalf)).toFixed(1);
    els.liquid.setAttribute("d", `M${L},${y} Q${G.cx},${y - 3} ${R},${y} L${R},${j} A${r},${r} 0 1 1 ${L},${j} Z`);
  }

  /** Eased slide to a level (the reveal). */
  function slideTo(c, ms = 900) {
    cancelAnimationFrame(tween);
    const from = levelC, start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      setLevel(from + (c - from) * (1 - (1 - k) ** 3));
      if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }

  /** The knob takes the liquid's colour at its height; its chevrons stay readable on it. */
  function paintKnob(c) {
    const st = def.gradient;
    const i = st.findIndex((s) => c <= s.c);
    let col;
    if (i <= 0) col = rgb(st[i === 0 ? 0 : st.length - 1].color);
    else {
      const k = (c - st[i - 1].c) / (st[i].c - st[i - 1].c);
      const a = rgb(st[i - 1].color), b = rgb(st[i].color);
      col = a.map((v, n) => Math.round(v + (b[n] - v) * k));
    }
    els.knob.style.setProperty("--knob-fill", `rgb(${col.join(" ")})`);
    els.knob.style.setProperty("--knob-mark", isLight(col) ? "#1d2433" : "#ffffff");
  }

  /* An emoji in a speech bubble hangs off the knob by its tail. The tip stays
     pinned to the knob; the bubble swings behind it as if dragged (a damped
     spring on the angle, driven by the knob's speed). */
  const feel = { emoji: null, y: null, target: 0, raf: null, t: 0, vel: 0, angle: 0, spin: 0 };
  function updateFeel(c) {
    const band = def.feels.find((f) => c < f.below) || {};
    if (band.emoji !== feel.emoji) {
      feel.emoji = band.emoji;
      const img = els.feel.querySelector("image");
      img.setAttribute("href", band.emoji ? dc.emojiUrl(band.emoji) : "");
      els.feel.querySelector("title").textContent = band.label || "";
      img.classList.remove("pop"); void img.getBBox(); img.classList.add("pop");
    }
    feel.target = yOf(c);
    feel.y ??= feel.target;
    if (!feel.raf) { feel.t = performance.now(); feel.raf = requestAnimationFrame(swing); }
  }
  function swing(now) {
    const dt = Math.min(0.05, (now - feel.t) / 1000 || 0.016);
    feel.t = now;
    const v = (feel.target - feel.y) / dt;
    feel.y = feel.target;
    feel.vel += (v - feel.vel) * (1 - Math.exp(-dt * 18));
    const want = clamp(feel.vel * 0.05, -28, 28);
    feel.spin += ((want - feel.angle) * 140 - feel.spin * 13) * dt;
    feel.angle += feel.spin * dt;
    els.feel.setAttribute("transform", `translate(0 ${feel.y.toFixed(1)}) rotate(${feel.angle.toFixed(2)} ${B.tip} 0)`);
    const settled = Math.abs(feel.angle) < 0.05 && Math.abs(feel.spin) < 0.05 && Math.abs(feel.vel) < 1;
    feel.raf = settled ? null : requestAnimationFrame(swing);
  }

  /* Arrows right of the tube: "your guess" follows the handle; at the reveal
     "actually" joins it. The labels keep apart; the tips stay true. */
  function placeArrows() {
    const items = [{ el: els.arrowGuess, y: yOf(intoC(state.guess, guessUnit())), label: "your guess", num: `${fmt(state.guess)}°${guessUnit()}` }];
    if (state.phase === "reveal") items.push({ el: els.arrowActual, y: yOf(state.actualC), label: "actually", num: `${fmt(actualRounded())}°${guessUnit()}` });
    items.sort((a, b) => a.y - b.y);
    let labelY = [items[0].y];
    if (items.length === 2) {
      const MIN = 22, mid = (items[0].y + items[1].y) / 2;
      const gap = Math.max(MIN, items[1].y - items[0].y);
      labelY = [Math.min(items[0].y, mid - gap / 2), Math.max(items[1].y, mid + gap / 2)];
    }
    items.forEach((it, i) => {
      const [label, num] = it.el.querySelectorAll("text");
      it.el.querySelector("path").setAttribute("transform", `translate(0 ${it.y.toFixed(1)})`);
      label.setAttribute("y", (labelY[i] + 5).toFixed(1));
      label.textContent = it.label;
      num.setAttribute("y", (labelY[i] + (i ? 26 : -15)).toFixed(1));
      num.textContent = it.num;
    });
  }

  /* ---------------------------------------------------------- input */
  const guessMin = () => Math.ceil(fromC(bottomC, guessUnit()));
  const guessMax = () => Math.floor(fromC(topC, guessUnit()));

  // Haptics: only where the vibrate API exists (Android); iPhone Safari has none
  const canBuzz = "vibrate" in navigator && matchMedia("(pointer: coarse)").matches;
  const buzz = (ms = 8) => navigator.vibrate(ms);
  const haptics = () => canBuzz && store.get("haptics", true);
  let fortyTimer, lastGuess;
  function setGuess(v) {
    if (state.phase !== "guess") return;
    state.guess = clamp(Math.round(v), guessMin(), guessMax());
    const c = intoC(state.guess, guessUnit());
    setLevel(c);
    els.knob.setAttribute("transform", `translate(0 ${yOf(c).toFixed(1)})`);
    paintKnob(c);
    updateFeel(c);
    placeArrows();
    if (state.guess !== lastGuess && haptics()) buzz(); // a tick per degree
    lastGuess = state.guess;
    thermo.setAttribute("aria-valuenow", state.guess);
    thermo.setAttribute("aria-valuetext", `${fmt(state.guess)} °${guessUnit()}`);

    // −40: the one temperature where both scales agree
    clearTimeout(fortyTimer);
    $("note").hidden = true;
    if (state.guess === -40) fortyTimer = setTimeout(() => { $("note").textContent = "−40 °C = −40 °F. They agree down here!"; $("note").hidden = false; earn("minus-forty"); }, 900);
  }

  const guessAt = (e) => {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(thermo.getScreenCTM().inverse());
    return fromC(cOfY(pt.y), guessUnit());
  };
  let dragging = false;
  thermo.addEventListener("pointerdown", (e) => {
    if (state.phase !== "guess") return;
    dragging = true;
    thermo.setPointerCapture(e.pointerId);
    thermo.classList.add("is-dragging");
    setGuess(guessAt(e));
    thermo.focus({ preventScroll: true });
    e.preventDefault();
  });
  thermo.addEventListener("pointermove", (e) => { if (dragging) setGuess(guessAt(e)); });
  const endDrag = () => { const was = dragging; dragging = false; thermo.classList.remove("is-dragging"); return was; };
  thermo.addEventListener("pointerup", () => { if (endDrag() && releaseConfirms()) submit(); }); // letting go locks it in
  thermo.addEventListener("pointercancel", endDrag);
  thermo.addEventListener("keydown", (e) => {
    if (state.phase !== "guess") return;
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
    const to = step ? state.guess + step : { Home: guessMin(), End: guessMax() }[e.key];
    if (to === undefined) return;
    setGuess(to);
    e.preventDefault();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.closest?.("button") || $("go-btn").hidden) return;
    $("go-btn").click();
    e.preventDefault();
  });

  /* ---------------------------------------------------------- countdown */
  // Permadeath limits each round; at zero the current guess locks in.
  // The bar drains in one linear transition, so it moves smoothly; a timer keeps the pill's seconds.
  let tick;
  function startCountdown() {
    stopCountdown();
    $("countdown").hidden = !rules.timeLimit;
    if (!rules.timeLimit) return;
    const fill = $("countdown-fill");
    fill.style.transition = "none";
    fill.style.transform = "scaleX(1)";
    void fill.offsetWidth;
    fill.style.transition = `transform ${rules.timeLimit}s linear`;
    fill.style.transform = "scaleX(0)";
    const end = performance.now() + rules.timeLimit * 1000;
    const update = () => {
      const left = Math.max(0, (end - performance.now()) / 1000);
      $("countdown-text").textContent = `${Math.ceil(left)}s`;
      $("countdown").classList.toggle("is-urgent", left <= 5);
      if (left <= 0) submit(true);
    };
    update();
    tick = setInterval(update, 100);
  }
  function stopCountdown() {
    clearInterval(tick);
    const fill = $("countdown-fill");
    const now = getComputedStyle(fill).transform; // freeze where it is
    fill.style.transition = "none";
    fill.style.transform = now === "none" ? "" : now;
  }

  /* ---------------------------------------------------------- achievements */
  // Earned in any mode; they pop up as you unlock them and are listed on the results screen.
  const ACHIEVEMENTS = [
    { id: "first-guess",  tier: "bronze",   title: "Mercury rising",   desc: "Made your first guess." },
    { id: "bang-on",      tier: "silver",   title: "Calibrated",       desc: "Guessed within 1° of the answer." },
    { id: "fever",        tier: "silver",   title: "Health",           desc: "Found the healthy body temperature." },
    { id: "minus-forty",  tier: "gold",     title: "Minus forty",      desc: "Found where °C and °F agree." },
    { id: "streak",       tier: "gold",     title: "Thermometer whiz", desc: "Scored 80+ on 10 rounds in a row." },
    { id: "perfect-game", tier: "gold",     title: "Flawless",         desc: "A perfect score on every round." },
    { id: "both-ways",    tier: "silver",   title: "Bilingual",        desc: "Finished a game guessing °C and one guessing °F." },
    { id: "baker",        tier: "bronze",   title: "Baker",            desc: "Finished a game in Oven mode." },
    { id: "survivor",     tier: "platinum", title: "Survivor",         desc: "Survived a whole Permadeath game." },
  ];
  const unlocked = () => store.get("achievements", {});
  let earnedThisGame = [];
  function earn(id) {
    const got = unlocked();
    if (got[id]) return;
    got[id] = Date.now();
    store.set("achievements", got);
    earnedThisGame.push(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    SOUNDS.achievement.play();
    dc.achievement({ title: a.title, body: a.desc, tier: a.tier }, { style: "pill" });
  }

  /* ---------------------------------------------------------- screens */
  function show(id) {
    document.querySelectorAll(".screen").forEach((el) => { el.hidden = el.id !== id; });
    document.body.dataset.screen = id;
    $("back-btn").hidden = id === "screen-start";
    $("mode-chip").hidden = id === "screen-start";
  }

  function useMode() {
    def = MODES[state.mode];
    rules = def.rules;
    const chip = $("mode-chip");
    chip.className = `chip chip--${def.tone}`;
    chip.innerHTML = `<span class="emoji">${def.emoji}</span> ${def.name}`;
  }

  /** The best-score tile for the chosen mode and unit. */
  const bestTile = (best) => best == null
    ? `<span class="widget__value widget__value--none">—</span><span class="widget__note">No games yet</span>`
    : `<span class="widget__figure"><span class="widget__value">${best}</span><span class="widget__unit">/ ${BASE.rounds * 100}</span></span>`;

  function syncStart() {
    const mode = MODES[state.mode];
    const press = (group, value) => $(group).querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.value === value));
    press("mode-pick", state.mode);
    press("unit-pick", guessUnit());
    press("submit-pick", state.submit);
    $("submit-row").hidden = !!mode.rules.releaseConfirms; // Permadeath always locks in on release
    $("sound-toggle").checked = store.get("sound", true);
    $("haptics-row").hidden = !canBuzz;
    $("haptics-toggle").checked = store.get("haptics", true);

    $("mode-tile").className = `widget tilt widget--${mode.tile || mode.tone}`;
    $("mode-tile-emoji").innerHTML = `<span class="emoji">${mode.emoji}</span>`;
    $("mode-tile-name").textContent = `${mode.name} mode`;
    $("mode-tile-blurb").textContent = mode.blurb;
    $("best-tile-body").innerHTML = bestTile(store.get("best", {})[modeKey()]);
    $("best-tile-note").textContent = `${mode.name} · °${guessUnit()}`;
    const n = Object.keys(unlocked()).length;
    $("ach-tile-count").innerHTML = `${n}<small> / ${ACHIEVEMENTS.length}</small>`;
    dc.segbar($("ach-tile-bar"), n);

    setBar("", "", "Start");
    $("go-btn").className = "btn btn--start btn--lg";
    $("go-btn").innerHTML = `Start ${dc.icon("arrow")}`;
  }

  /* Centre the setup screen once, sized with every option showing, so the
     tiles don't move when an option row comes or goes. */
  function centreStart() {
    const stage = document.querySelector(".stage"), row = $("submit-row"), hid = row.hidden;
    row.hidden = false;
    stage.style.paddingTop = "";
    const top = stage.getBoundingClientRect().top + parseFloat(getComputedStyle(stage).paddingTop);
    const content = $("sentinel").getBoundingClientRect().bottom - top;
    row.hidden = hid;
    const min = parseFloat(getComputedStyle(stage).paddingTop); // the CSS minimum, clear of the status bar
    stage.style.paddingTop = `${min + Math.max(0, (innerHeight - stage.getBoundingClientRect().top - min - content) / 2)}px`;
  }
  addEventListener("resize", () => { if (state.phase === "start") centreStart(); });

  function showStart() {
    stopCountdown();
    state.phase = "start";
    show("screen-start");
    syncStart();
    centreStart();
  }

  function newGame() {
    useMode();
    Object.assign(state, { round: 0, score: 0, history: [], prompt: null, failed: null });
    earnedThisGame = [];
    SOUNDS[def.sound || "start"].play();
    dc.fadeThrough(() => {
      document.querySelector(".stage").style.paddingTop = "";
      $("score").textContent = 0;
      $("go-btn").className = "btn btn--primary btn--lg";
      show("screen-play");
      buildThermo(); // once shown, so it fits the canvas
      nextRound();
    });
  }

  /** A new temperature: sometimes a favourite, never a repeat, never one the start position gives away. */
  function pickPrompt() {
    const unit = state.familiar;
    const lo = Math.ceil(fromC(rules.minC, unit)), hi = Math.floor(fromC(rules.maxC, unit));
    const favs = def.favourites.filter((c) => c >= rules.minC && c <= rules.maxC);
    let v;
    for (let tries = 0; tries < 20; tries++) {
      v = favs.length && Math.random() < rules.favouriteChance
        ? Math.round(fromC(favs[Math.floor(Math.random() * favs.length)], unit))
        : lo + Math.floor(Math.random() * (hi - lo + 1));
      const nearStart = Math.abs(intoC(v, unit) - rules.startC) < 5;
      if (!nearStart && v !== state.prompt && !state.history.some((h) => h.prompt === v)) break;
    }
    return v;
  }

  function nextRound() {
    state.round++;
    state.phase = "guess";
    state.prompt = pickPrompt();
    state.actualC = intoC(state.prompt, state.familiar);

    const temp = $("prompt-temp");
    temp.textContent = `${fmt(state.prompt)}°${state.familiar}`;
    const tint = rules.plainPrompt ? "" : state.mode === "oven" ? "gold" : state.actualC < 0 ? "blue" : "red";
    temp.className = tint ? `temp temp--${tint}` : "temp";
    $("question").textContent = `in °${guessUnit()}?`;
    $("round-label").textContent = `Round ${state.round} of ${rules.rounds}`;

    cancelAnimationFrame(tween);
    thermo.classList.remove("is-revealed");
    thermo.setAttribute("aria-valuemin", guessMin());
    thermo.setAttribute("aria-valuemax", guessMax());
    $("score-delta").classList.remove("is-shown");
    setBar("", "", releaseConfirms() ? null : "Guess"); // letting go confirms instead
    setGuess(fromC(rules.startC, guessUnit()));
    thermo.focus({ preventScroll: true });
    startCountdown();
  }

  function pointsFor(errG, errC) {
    if (errG <= rules.perfectWithin) return 100;
    if (errC >= rules.zeroBeyondC) return 0;
    return clamp(Math.round((100 * (rules.zeroBeyondC - errC)) / (rules.zeroBeyondC - perfectC())), 0, 99);
  }

  /** Why a Permadeath game ended, in a sentence. */
  const failReason = () => (state.failed.timedOut ? "You ran out of time." : `You were ${fmt(state.failed.offG)}°${guessUnit()} off.`);

  function submit(timedOut = false) {
    if (state.phase !== "guess") return;
    clearTimeout(fortyTimer);
    if (state.guess === -40) earn("minus-forty"); // locking in at −40 counts, not just resting there
    stopCountdown();
    const errG = Math.abs(state.guess - actualRounded());
    const errC = guessUnit() === "F" ? (errG * 5) / 9 : errG;
    const pts = pointsFor(errG, errC);
    state.score += pts;
    state.history.push({ prompt: state.prompt, errC, errG, pts });
    state.phase = "reveal";
    // Permadeath: a big miss or running out of time ends the game
    if (rules.failBeyondC != null && (timedOut || errC > rules.failBeyondC)) state.failed = { round: state.round, offG: errG, timedOut };

    placeArrows();
    thermo.classList.add("is-revealed");
    slideTo(state.actualC);

    $("score").textContent = state.score;
    const delta = $("score-delta");
    delta.textContent = `+${pts}`;
    delta.classList.toggle("chip--green", pts > 0);
    delta.classList.remove("is-shown"); void delta.offsetWidth; delta.classList.add("is-shown");

    const last = state.round >= rules.rounds || state.failed;
    setBar(state.failed ? `Game over. ${failReason()}` : "", "", last ? "See results" : "Next", { bad: !!state.failed });
    $("go-btn").focus({ preventScroll: true });

    earn("first-guess");
    if (pts === 100) earn("bang-on");
    if (pts === 100 && Math.abs(state.actualC - 37) <= 0.5) earn("fever");
    const streak = pts >= 80 ? store.get("streak", 0) + 1 : 0;
    store.set("streak", streak);
    if (streak >= 10) earn("streak");
  }

  /* ---------------------------------------------------------- results */
  function showFinal() {
    state.phase = "final";
    const max = rules.rounds * 100;
    $("final-title").textContent = state.failed ? "Game over" : rules.failBeyondC != null ? "You survived!" : "Final score";
    $("final-title").classList.toggle("is-bad", !!state.failed);
    $("final-score").innerHTML = `<span class="widget__value">${state.score}</span><span class="widget__unit">/ ${max}</span>`;
    $("final-note").textContent = state.failed ? `${failReason()} Round ${state.failed.round}.` : "";

    const bests = store.get("best", {});
    const isBest = bests[modeKey()] == null || state.score > bests[modeKey()];
    if (isBest) { bests[modeKey()] = state.score; store.set("best", bests); }
    $("final-best").hidden = !isBest || !!state.failed;
    $("final-best-body").innerHTML = bestTile(bests[modeKey()]);
    $("final-best-note").textContent = `${def.name} · °${guessUnit()}`;

    const past = [...store.get(`scores:${modeKey()}`, []), { score: state.score, at: Date.now() }].slice(-20);
    store.set(`scores:${modeKey()}`, past);

    if (!state.failed) {
      if (state.history.every((h) => h.pts === 100)) earn("perfect-game");
      const done = { ...store.get("finished", {}), [guessUnit()]: true };
      store.set("finished", done);
      if (done.C && done.F) earn("both-ways");
      if (state.mode === "oven") earn("baker");
      if (state.mode === "permadeath") earn("survivor");
    }

    SOUNDS.end.play();
    dc.fadeThrough(() => {
      drawTarget();
      drawHistory(past.slice(-rules.historyGames));
      drawAchievements();
      drawAccuracy();
      show("screen-final");
      setBar("", "", "Play again");
      $("go-btn").focus({ preventScroll: true });
      scrollTo(0, 0);
    }).then(() => {
      if (state.failed || state.score <= rules.confettiAbove) return;
      const r = $("final-score").getBoundingClientRect();
      const burst = () => dc.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 40 });
      burst();
      setTimeout(burst, 400);
    });
  }

  const FADE_IN = 0.45; // seconds: charts start once the screen fade clears

  function drawTarget() {
    const Z = rules.zeroBeyondC;
    dc.chart.target($("target-chart"), state.history.map((h) => ({ dist: h.errC, label: `${fmt(h.prompt)}°${state.familiar}` })), {
      zero: Z, slots: rules.rounds, delay: FADE_IN,
      rungs: [{ value: Z, pct: 14 }, { value: Z / 2, pct: 40 }, { value: perfectC(), pct: 100 }],
      ringLabels: [{ value: Z, text: `${fmt(Z)}°C` }, { value: Z / 2, text: `${fmt(Z / 2)}°C` }],
    });
  }

  function drawHistory(list) {
    const svg = $("history-chart");
    const enough = list.length >= 2;
    svg.toggleAttribute("hidden", !enough);
    $("history-empty").hidden = enough;
    $("history-stats").hidden = !enough;
    if (!enough) return;
    const change = list.at(-1).score - list.at(-2).score;
    $("history-change").textContent = `${change > 0 ? "▲" : change < 0 ? "▼" : "•"} ${Math.abs(change)}`;
    $("history-change").className = `stat__value${change > 0 ? " is-up" : change < 0 ? " is-down" : ""}`;
    $("history-best").textContent = Math.max(...list.map((g) => g.score));
    const midnight = (d) => new Date(d).setHours(0, 0, 0, 0);
    const when = (at) => {
      const days = Math.round((midnight(Date.now()) - midnight(at)) / 864e5);
      if (days === 0) return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (days === 1) return "Yesterday";
      return new Date(at).toLocaleDateString([], { day: "numeric", month: "short" });
    };
    dc.chart.line(svg, list.map((g) => ({ value: g.score, x: when(g.at) })), { max: rules.rounds * 100, delay: FADE_IN + 0.9 });
  }

  /** How far off you were on average, in the unit you guessed: a pill on the bullseye tile. */
  function drawAccuracy() {
    const misses = state.history.map((h) => h.errG);
    const avg = misses.reduce((a, b) => a + b, 0) / misses.length;
    $("accuracy-pill").textContent = `${fmt(avg)}°${guessUnit()} off on average`;
  }

  /** Every achievement: earned ones in their tier's colour, this game's marked new. */
  function drawAchievements() {
    const got = unlocked();
    $("ach-count").textContent = `${Object.keys(got).length} / ${ACHIEVEMENTS.length}`;
    $("ach-grid").innerHTML = ACHIEVEMENTS.map((a) => {
      const has = !!got[a.id], isNew = earnedThisGame.includes(a.id);
      return `<div class="ach-item${has ? "" : " is-locked"}${isNew ? " is-new" : ""}" title="${dc.esc(a.desc)}">
        <span class="badge badge--sm${has ? "" : " is-locked"}">${dc.tierIcon(a.tier, !has)}</span>
        <span class="ach-item__name">${dc.esc(a.title)}</span>${isNew ? '<span class="chip chip--green ach-item__new">New</span>' : ""}
      </div>`;
    }).join("");
  }

  /** Paints one repeating tile of spooky emoji (staggered rows, a little tilt each) for the Permadeath tile. */
  function paintTapestry() {
    const set = ["👻", "💀", "☠️"];
    const T = 240, cols = 4, rows = 4, size = 34, dpr = 2;
    const cv = Object.assign(document.createElement("canvas"), { width: T * dpr, height: T * dpr });
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let i = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) {
      const x = (c + (r % 2) / 2 + .25) * (T / cols), y = (r + .5) * (T / rows);
      for (const dx of [-T, 0]) for (const dy of [-T, 0]) { // copies across the edges so the tile wraps seamlessly
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(((i * 37) % 7 - 3) * .06);
        ctx.fillText(set[(i * 5) % set.length], 0, 0);
        ctx.restore();
      }
    }
    $("tapestry").style.setProperty("--tapestry", `url(${cv.toDataURL()})`);
  }
  paintTapestry();

  /* ---------------------------------------------------------- boot */
  // Settings: each change is saved at once
  $("mode-pick").addEventListener("deacald:change", async (e) => {
    if (e.detail === state.mode) return;
    if (e.detail === "permadeath" && !store.get("permadeathSeen", false)) { // explained once
      const ok = await dc.confirm({
        icon: "☠️", title: "Permadeath", body: "One big miss and it's over.",
        items: ["15 seconds a round. Run out of time and you lose.", "Letting go of the handle locks in your guess.", "Miss by more than 10 °C (18 °F) and the game ends.", "No colour hints."],
        confirm: "Take the challenge", cancel: "Not now",
      });
      if (!ok) { syncStart(); return; }
      store.set("permadeathSeen", true);
    }
    state.mode = e.detail;
    savePrefs();
    syncStart();
  });
  $("unit-pick").addEventListener("deacald:change", (e) => { state.familiar = e.detail === "F" ? "C" : "F"; savePrefs(); syncStart(); });
  $("submit-pick").addEventListener("deacald:change", (e) => { state.submit = e.detail; savePrefs(); });
  $("sound-toggle").addEventListener("change", (e) => store.set("sound", e.target.checked));
  $("haptics-toggle").addEventListener("change", (e) => { store.set("haptics", e.target.checked); if (e.target.checked) buzz(15); });
  $("erase-btn").addEventListener("click", async () => {
    const ok = await dc.confirm({
      title: "Erase your data?", body: "This deletes your best scores, past games and settings from this browser.",
      warning: "You can't undo this.", confirm: "Erase data", danger: true,
    });
    if (!ok) return;
    Object.keys(localStorage).filter((k) => k.startsWith(`${KEY}:`)).forEach((k) => localStorage.removeItem(k));
    Object.assign(state, { mode: "weather", familiar: "C", submit: "release" });
    syncStart();
    centreStart();
    dc.toast({ title: "Data erased", icon: "check", color: "green" });
  });

  $("go-btn").addEventListener("click", () => {
    if (state.phase === "start" || state.phase === "final") newGame();
    else if (state.phase === "guess") submit();
    else if (state.phase === "reveal") (state.round >= rules.rounds || state.failed ? showFinal : nextRound)();
  });
  $("back-btn").addEventListener("click", () => dc.fadeThrough(showStart));

  // Sounds load once the page has painted and gone idle, so they never hold it up
  addEventListener("load", () => requestAnimationFrame(() => setTimeout(() => {
    const load = () => Object.values(SOUNDS).forEach((s) => s.load());
    "requestIdleCallback" in window ? requestIdleCallback(load, { timeout: 2000 }) : setTimeout(load, 200);
  })), { once: true });

  showStart();
  document.fonts?.ready.then(() => { if (state.phase === "start") centreStart(); });
})();
