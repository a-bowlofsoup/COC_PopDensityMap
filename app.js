/* Chandler density relief: renderer and player. No dependencies. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- data
  function loadData() {
    const src = window.DENSITY_DATA;
    if (!src) return window.makeDemoData();
    const d = Object.assign({}, src);
    if (typeof d.frames === 'string') {
      const bin = atob(d.frames);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const n = d.width * d.height;
      const dv = new DataView(bytes.buffer);
      const frames = [];
      for (let f = 0; f < d.years.length; f++) {
        const a = new Float32Array(n);
        const off = f * n * 2;
        for (let c = 0; c < n; c++) a[c] = dv.getUint16(off + c * 2, true) / d.scale;
        frames.push(a);
      }
      d.frames = frames;
    }
    return d;
  }

  const D = loadData();
  const W = D.width, H = D.height, N = W * H;
  const Y0 = D.years[0], Y1 = D.years[D.years.length - 1];
  const censusSet = new Set(D.censusYears || []);

  // ---------------------------------------------------------------- colour
  // Ratio to the reference-year city average. Blue below half, green around average,
  // yellow-orange-red above, white for the most crowded places.
  //
  // WHITE_AT sets where white begins. 'auto' picks it from the last year so the top
  // WHITE_SHARE of the city shows white by the end of the loop. Use a number (e.g. 2.0)
  // to fix it instead. Lower = more white.
  const WHITE_AT = 'auto';
  const WHITE_SHARE = 0.05;          // 5% of the city's area is white in the final year

  // cells inside the city outline (used for the auto threshold)
  const inCity = (() => {
    const m = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = i + 0.5, y = j + 0.5;
      let inside = false;
      for (const ring of D.boundary) for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        const [xa, ya] = ring[a], [xb, yb] = ring[b];
        if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) inside = !inside;
      }
      m[j * W + i] = inside ? 1 : 0;
    }
    return m;
  })();
  const WHITE = (() => {
    if (typeof WHITE_AT === 'number') return WHITE_AT;
    const last = D.frames[D.frames.length - 1], vals = [];
    for (let c = 0; c < N; c++) if (inCity[c]) vals.push(last[c]);
    vals.sort((a, b) => a - b);
    const v = vals[Math.floor(vals.length * (1 - WHITE_SHARE))] || 3;
    return Math.min(3, Math.max(1.6, Math.round(v * 10) / 10));
  })();
  const hot = f => 1 + f * (WHITE - 1);      // spread the warm colours between x1 and WHITE
  const STOPS = [
    [0.00, [14, 34, 78]], [0.18, [26, 64, 132]], [0.36, [44, 104, 182]], [0.499, [82, 146, 214]],
    [0.50, [20, 86, 40]], [0.80, [32, 116, 46]], [hot(0), [54, 142, 56]], [hot(0.2), [108, 168, 62]],
    [hot(0.4), [186, 194, 76]], [hot(0.55), [236, 188, 62]], [hot(0.7), [238, 144, 46]], [hot(0.85), [220, 82, 42]],
    [hot(0.99), [192, 42, 38]], [WHITE, [236, 233, 228]], [WHITE * 1.3, [255, 255, 255]]
  ];
  const LUT_MAX = WHITE * 1.3, LUT_N = 760;
  const LUT = new Uint8ClampedArray(LUT_N * 3);
  for (let k = 0; k < LUT_N; k++) {
    const v = (k / (LUT_N - 1)) * LUT_MAX;
    let s = 0;
    while (s < STOPS.length - 2 && v > STOPS[s + 1][0]) s++;
    const [a, ca] = STOPS[s], [b, cb] = STOPS[s + 1];
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    for (let ch = 0; ch < 3; ch++) LUT[k * 3 + ch] = ca[ch] + (cb[ch] - ca[ch]) * t;
  }
  const lutIndex = v => Math.min(LUT_N - 1, Math.max(0, Math.round((v / LUT_MAX) * (LUT_N - 1))));

  // ---------------------------------------------------------------- field
  const field = new Float32Array(N);
  function computeField(t) {
    const i = Math.min(D.frames.length - 1, Math.floor(t));
    const j = Math.min(D.frames.length - 1, i + 1);
    let f = t - i;
    f = f * f * (3 - 2 * f);
    const A = D.frames[i], B = D.frames[j];
    for (let c = 0; c < N; c++) field[c] = A[c] + (B[c] - A[c]) * f;
  }

  // ---------------------------------------------------------------- relief raster
  const UP = 2;                               // upsample factor for the shaded raster
  const RW = W * UP, RH = H * UP;
  const off = document.createElement('canvas');
  off.width = RW; off.height = RH;
  const offCtx = off.getContext('2d');
  const img = offCtx.createImageData(RW, RH);
  const hgt = new Float32Array(RW * RH);
  const val = new Float32Array(RW * RH);

  // light from the north-west, 42 degrees up
  const L = (() => { const az = 315 * Math.PI / 180, al = 42 * Math.PI / 180;
    const v = [Math.sin(az) * Math.cos(al), -Math.cos(az) * Math.cos(al), Math.sin(al)];
    return v; })();
  const RELIEF = 26;   // vertical exaggeration

  function renderRaster() {
    // bilinear upsample
    for (let y = 0; y < RH; y++) {
      const gy = Math.min(H - 1.001, Math.max(0, (y + 0.5) / UP - 0.5));
      const j = Math.floor(gy), fy = gy - j;
      for (let x = 0; x < RW; x++) {
        const gx = Math.min(W - 1.001, Math.max(0, (x + 0.5) / UP - 0.5));
        const i = Math.floor(gx), fx = gx - i;
        const c = j * W + i;
        const v = (field[c] * (1 - fx) + field[c + 1] * fx) * (1 - fy) +
                  (field[c + W] * (1 - fx) + field[c + W + 1] * fx) * fy;
        const p = y * RW + x;
        val[p] = v;
        hgt[p] = Math.log1p(v * 3);
      }
    }
    const px = img.data;
    const k = RELIEF / UP;
    for (let y = 0; y < RH; y++) {
      const ym = y > 0 ? y - 1 : y, yp = y < RH - 1 ? y + 1 : y;
      for (let x = 0; x < RW; x++) {
        const xm = x > 0 ? x - 1 : x, xp = x < RW - 1 ? x + 1 : x;
        const p = y * RW + x;
        const dx = (hgt[y * RW + xp] - hgt[y * RW + xm]) * k;
        const dy = (hgt[yp * RW + x] - hgt[ym * RW + x]) * k;
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const lam = (-dx * L[0] - dy * L[1] + L[2]) * inv;
        let sh = 0.42 + 0.78 * Math.max(0, lam);
        const flat = L[2];
        const spec = Math.max(0, lam - flat) * 0.9;
        const li = lutIndex(val[p]) * 3;
        const q = p * 4;
        px[q] = LUT[li] * sh + 255 * spec;
        px[q + 1] = LUT[li + 1] * sh + 255 * spec;
        px[q + 2] = LUT[li + 2] * sh + 255 * spec;
        px[q + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------- contours
  const LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5, 4, 5];
  const MAJOR = new Set([0.5, 1, 2, 3]);
  // One pass over the grid; each cell only tests the levels between its min and max.
  function allContours() {
    const out = LEVELS.map(() => []);
    const nL = LEVELS.length;
    for (let j = 0; j < H - 1; j++) {
      for (let i = 0; i < W - 1; i++) {
        const c = j * W + i;
        const a = field[c], b = field[c + 1], cc = field[c + W + 1], d = field[c + W];
        const lo = Math.min(a, b, cc, d), hi = Math.max(a, b, cc, d);
        if (hi < LEVELS[0] || lo >= LEVELS[nL - 1]) continue;
        for (let k = 0; k < nL; k++) {
          const lv = LEVELS[k];
          if (lv > hi) break;
          if (lv <= lo) continue;
          cellSegs(out[k], lv, i, j, a, b, cc, d);
        }
      }
    }
    return out;
  }
  function cellSegs(segs, level, i, j, a, b, cc, d) {
    {
      {
        let idx = 0;
        if (a >= level) idx |= 8;
        if (b >= level) idx |= 4;
        if (cc >= level) idx |= 2;
        if (d >= level) idx |= 1;
        if (idx === 0 || idx === 15) return;
        const x = i + 0.5, y = j + 0.5;
        const top = [x + (level - a) / (b - a), y];
        const right = [x + 1, y + (level - b) / (cc - b)];
        const bottom = [x + (level - d) / (cc - d), y + 1];
        const left = [x, y + (level - a) / (d - a)];
        switch (idx) {
          case 1: case 14: segs.push(left, bottom); break;
          case 2: case 13: segs.push(bottom, right); break;
          case 3: case 12: segs.push(left, right); break;
          case 4: case 11: segs.push(top, right); break;
          case 6: case 9: segs.push(top, bottom); break;
          case 7: case 8: segs.push(left, top); break;
          case 5: segs.push(left, top, bottom, right); break;
          case 10: segs.push(top, right, left, bottom); break;
        }
      }
    }
    return segs;
  }

  // ---------------------------------------------------------------- map canvas
  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');
  let view = { s: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 };

  function boundaryPath(c, dx, dy) {
    c.beginPath();
    for (const ring of D.boundary) {
      ring.forEach(([x, y], k) => {
        const X = view.ox + x * view.s + (dx || 0), Y = view.oy + y * view.s + (dy || 0);
        k ? c.lineTo(X, Y) : c.moveTo(X, Y);
      });
      c.closePath();
    }
  }

  function resize() {
    const wrap = canvas.parentElement;
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    // fit the city's own extent, not the padded grid
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const ring of D.boundary) for (const [x, y] of ring) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const pad = 0.015;
    const s = Math.min(r.width / ((x1 - x0) * (1 + pad * 2)), r.height / ((y1 - y0) * (1 + pad * 2)));
    view = { s, dpr, cw: r.width, ch: r.height,
      ox: (r.width - (x1 - x0) * s) / 2 - x0 * s,
      oy: (r.height - (y1 - y0) * s) / 2 - y0 * s };
    lastDrawn = -1;
  }

  function drawMap() {
    const { s, ox, oy, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.cw, view.ch);

    // drop shadow: a soft dark halo around the whole city, slightly offset down-right
    const blur = Math.max(24, Math.min(view.cw, view.ch) * 0.07);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = blur * 0.15;
    ctx.shadowOffsetY = blur * 0.25;
    ctx.fillStyle = '#000';
    boundaryPath(ctx);
    ctx.fill('evenodd');
    ctx.fill('evenodd');                // second pass deepens the halo
    ctx.shadowBlur = blur * 0.3;       // tighter pass gives the edge some weight
    ctx.fill('evenodd');
    ctx.restore();

    ctx.save();
    boundaryPath(ctx);
    ctx.clip('evenodd');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, ox, oy, W * s, H * s);

    // contours
    ctx.lineJoin = 'round';
    const all = allContours();
    for (let li = 0; li < LEVELS.length; li++) {
      const lv = LEVELS[li], segs = all[li];
      if (!segs.length) continue;
      ctx.beginPath();
      for (let k = 0; k < segs.length; k += 2) {
        ctx.moveTo(ox + segs[k][0] * s, oy + segs[k][1] * s);
        ctx.lineTo(ox + segs[k + 1][0] * s, oy + segs[k + 1][1] * s);
      }
      const major = MAJOR.has(lv);
      if (lv < 0.5) { ctx.strokeStyle = 'rgba(200,225,255,0.22)'; ctx.lineWidth = 0.8; }
      else if (lv >= WHITE) { ctx.strokeStyle = 'rgba(40,20,10,0.45)'; ctx.lineWidth = major ? 1.4 : 0.9; }
      else { ctx.strokeStyle = major ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.38)'; ctx.lineWidth = major ? 1.5 : 0.9; }
      ctx.stroke();
    }
    ctx.restore();

    // crisp rim
    boundaryPath(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    drawLabels();
    drawScaleBar();
  }

  function drawLabels() {
    const { s, ox, oy } = view;
    const base = Math.max(12, Math.min(34, s * 3.6));
    for (const lb of D.labels) {
      const X = ox + lb.x * s, Y = oy + lb.y * s;
      const size = base * (lb.rank === 1 ? 1.25 : lb.rank === 2 ? 1.0 : 0.82);
      ctx.beginPath();
      ctx.arc(X, Y, Math.max(2, size * 0.16), 0, Math.PI * 2);
      ctx.fillStyle = '#c8321f';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
      ctx.font = `700 ${size}px "Public Sans", "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2.5, size * 0.22);
      ctx.strokeStyle = 'rgba(6,10,8,0.82)';
      ctx.strokeText(lb.name, X, Y + size * 0.35);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(lb.name, X, Y + size * 0.35);
    }
  }

  function drawScaleBar() {
    const { s } = view;
    const cellsPerMile = 1609.344 / D.cellSizeM;
    const miles = s * cellsPerMile * 2 > view.cw * 0.25 ? 1 : 2;
    const len = s * cellsPerMile * miles;
    const x = 22, y = view.ch - 22;   // bottom-left corner, clear of the city shape
    ctx.strokeStyle = 'rgba(233,239,233,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 5);
    ctx.stroke();
    ctx.font = `500 ${Math.max(12, Math.round(view.ch * 0.016))}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(233,239,233,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${miles} mi`, x + len / 2, y - 6);
  }

  // ---------------------------------------------------------------- panel
  const $ = id => document.getElementById(id);
  const el = {
    year: $('year'), pop: $('pop'), popKind: $('popKind'), chTitle: $('chTitle'), chRange: $('chRange'),
    chText: $('chText'), chList: $('chList'), scrub: $('scrub'), play: $('play'), speed: $('speed'),
    spark: $('spark'), legend: $('legend'), legendNote: $('legendNote'), source: $('source'),
    badge: $('demoBadge'), ticks: $('ticks'), full: $('fullscreen'), ui: $('controls'), place: $('place')
  };
  const fmt = n => Math.round(n).toLocaleString('en-US');

  el.place.textContent = D.place || 'Chandler, AZ';
  el.source.textContent = D.source || '';
  el.badge.hidden = !D.demo;
  el.legendNote.textContent =
    `Compared with ${D.place ? D.place.split(',')[0] : 'the city'}’s ${D.refYear} average` +
    (D.refDensityPerSqMi ? ` (about ${fmt(D.refDensityPerSqMi)} people per sq mi)` : '');

  el.scrub.min = 0;
  el.scrub.max = D.years.length - 1;
  el.scrub.step = 'any';

  // decade ticks under the scrubber
  for (const y of D.years) {
    if (y % 10 !== 0 && y !== Y1 && y !== Y0) continue;
    const t = document.createElement('span');
    t.textContent = y;
    t.style.left = ((y - Y0) / (Y1 - Y0) * 100) + '%';
    el.ticks.appendChild(t);
  }

  const chapters = D.chapters || [];
  chapters.forEach((c, k) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="range">${c.from}–${c.to}</span><span class="name"></span>`;
    b.querySelector('.name').textContent = c.title;
    b.addEventListener('click', () => { seek(D.years.indexOf(c.from)); });
    li.appendChild(b);
    el.chList.appendChild(li);
  });
  const chapterFor = y => {
    let k = 0;
    chapters.forEach((c, i) => { if (y >= c.from) k = i; });
    return k;
  };

  // legend: stepped bar like a printed key
  function drawLegend() {
    const cv = el.legend, r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const steps = 30, w = r.width, h = r.height;
    const max = WHITE * 1.2;
    for (let k = 0; k < steps; k++) {
      const v = (k + 0.5) / steps * max;
      const li = lutIndex(v) * 3;
      c.fillStyle = `rgb(${LUT[li]},${LUT[li + 1]},${LUT[li + 2]})`;
      c.fillRect(Math.floor(k / steps * w), 0, Math.ceil(w / steps) + 1, h);
    }
    const ticks = document.getElementById('legendTicks');
    ticks.innerHTML = '';
    [[0, '0'], [0.5, '×0.5'], [1, '×1'], ...(WHITE - 1.5 > 0.3 ? [[1.5, '×1.5']] : []), [WHITE, '×' + WHITE.toFixed(1) + '+']].forEach(([v, t]) => {
      const s = document.createElement('span');
      s.textContent = t;
      s.style.left = (v / max * 100) + '%';
      if (v === 1) s.className = 'avg';
      ticks.appendChild(s);
    });
  }

  // population sparkline
  const popArr = D.years.map(y => D.population[y] || D.population[String(y)] || 0);
  const popMax = Math.max(...popArr);
  function drawSpark(t) {
    const cv = el.spark, r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height, top = Math.max(16, h * 0.12), bot = h - Math.max(16, h * 0.13);
    c.clearRect(0, 0, w, h);
    const X = k => k / (popArr.length - 1) * (w - 2) + 1;
    const Yp = p => bot - p / (popMax * 1.08) * (bot - top);
    const css = getComputedStyle(document.documentElement);
    const line = css.getPropertyValue('--ink-2').trim();
    const accent = css.getPropertyValue('--sand').trim();
    // faint gridline at 100k and 200k
    c.strokeStyle = css.getPropertyValue('--rule').trim();
    c.lineWidth = 1;
    const fs = Math.max(10, Math.round(h * 0.085));
    c.font = `500 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
    c.fillStyle = css.getPropertyValue('--ink-3').trim();
    c.textBaseline = 'bottom';
    c.textAlign = 'left';
    [100000, 200000].forEach(p => {
      c.beginPath(); c.moveTo(0, Math.round(Yp(p)) + 0.5); c.lineTo(w, Math.round(Yp(p)) + 0.5); c.stroke();
      c.fillText(`${p / 1000}k`, 2, Yp(p) - 2);
    });
    // full series faint, travelled part bright
    c.beginPath();
    popArr.forEach((p, k) => k ? c.lineTo(X(k), Yp(p)) : c.moveTo(X(k), Yp(p)));
    c.strokeStyle = line; c.globalAlpha = 0.35; c.lineWidth = 1.5; c.stroke(); c.globalAlpha = 1;
    const kEnd = Math.min(popArr.length - 1, t);
    c.beginPath();
    c.moveTo(X(0), bot);
    for (let k = 0; k <= Math.floor(kEnd); k++) c.lineTo(X(k), Yp(popArr[k]));
    const i = Math.floor(kEnd), f = kEnd - i;
    const pNow = popArr[i] + ((popArr[Math.min(i + 1, popArr.length - 1)] - popArr[i]) * f);
    c.lineTo(X(kEnd), Yp(pNow));
    c.lineTo(X(kEnd), bot);
    c.closePath();
    c.fillStyle = accent; c.globalAlpha = 0.16; c.fill(); c.globalAlpha = 1;
    c.beginPath();
    for (let k = 0; k <= i; k++) k ? c.lineTo(X(k), Yp(popArr[k])) : c.moveTo(X(k), Yp(popArr[k]));
    c.lineTo(X(kEnd), Yp(pNow));
    c.strokeStyle = accent; c.lineWidth = Math.max(2, h * 0.018); c.stroke();
    c.beginPath(); c.arc(X(kEnd), Yp(pNow), Math.max(3.5, h * 0.03), 0, Math.PI * 2); c.fillStyle = accent; c.fill();
    c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = css.getPropertyValue('--ink-3').trim();
    c.fillText(String(Y0), 1, bot + 3);
    c.textAlign = 'right';
    c.fillText(String(Y1), w - 1, bot + 3);
  }

  let shownYear = null, shownChapter = -1;
  function updatePanel(t) {
    const k = Math.min(D.years.length - 1, Math.floor(t + 1e-6));
    const y = D.years[k];
    if (y !== shownYear) {
      shownYear = y;
      el.year.textContent = y;
      const p = popArr[k];
      const exact = censusSet.has(y);
      el.pop.textContent = (exact ? '' : '≈ ') + fmt(exact ? p : Math.round(p / 100) * 100);
      el.popKind.textContent = exact ? `${y} Census` : 'estimate';
      el.popKind.classList.toggle('census', exact);
      const ci = chapterFor(y);
      if (ci !== shownChapter && chapters[ci]) {
        shownChapter = ci;
        const c = chapters[ci];
        el.chRange.textContent = `${c.from}–${c.to}`;
        el.chTitle.textContent = c.title;
        el.chText.textContent = c.text;
        [...el.chList.children].forEach((li, j) => {
          li.classList.toggle('active', j === ci);
          li.classList.toggle('past', j < ci);
        });
        const story = document.getElementById('story');
        story.classList.remove('enter'); void story.offsetWidth; story.classList.add('enter');
      }
    }
    el.scrub.value = t;
    el.scrub.style.setProperty('--pct', (t / (D.years.length - 1) * 100) + '%');
    drawSpark(t);
  }

  // ---------------------------------------------------------------- playback
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = 0;                   // position in years (index into frames, fractional)
  let playing = !reduce;
  let speed = 1;               // years per ~0.8 s at 1x
  const SEC_PER_YEAR = 0.8;
  const END_HOLD = 4.0, START_HOLD = 1.2;
  let hold = START_HOLD;
  let lastTs = null, lastDrawn = -1;
  let fading = 0;              // loop fade: >0 while fading out and back in

  function frame(ts) {
    const dt = lastTs == null ? 0 : Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    if (playing) {
      if (fading > 0) {
        fading -= dt;
        const a = fading > 0.45 ? (fading - 0.45) / 0.45 : 1 - fading / 0.45;
        canvas.style.opacity = Math.max(0, Math.min(1, a)).toFixed(3);
        if (fading <= 0.45 && t !== 0) { t = 0; hold = START_HOLD; }
        if (fading <= 0) { canvas.style.opacity = 1; fading = 0; }
      } else if (hold > 0) {
        hold -= dt;
      } else {
        t += dt * speed / SEC_PER_YEAR;
        if (t >= D.years.length - 1) {
          t = D.years.length - 1;
          hold = END_HOLD;
          fading = -1;          // mark: fade after the end hold
        }
      }
      if (fading === -1 && hold <= 0) fading = 0.9;
    }
    if (t !== lastDrawn) {
      computeField(t);
      renderRaster();
      drawMap();
      updatePanel(t);
      lastDrawn = t;
    }
    requestAnimationFrame(frame);
  }

  function setPlaying(p) {
    playing = p;
    el.play.setAttribute('aria-pressed', String(p));
    el.play.setAttribute('aria-label', p ? 'Pause' : 'Play');
    el.play.querySelector('.lbl').textContent = p ? 'Pause' : 'Play';
    document.body.classList.toggle('is-playing', p);
    if (p && t >= D.years.length - 1) { t = 0; hold = START_HOLD; }
    lastTs = null;
    poke();
  }
  function seek(k) {
    t = Math.max(0, Math.min(D.years.length - 1, k));
    hold = 0; fading = 0; canvas.style.opacity = 1;
    lastDrawn = -1;
    poke();
  }

  el.play.addEventListener('click', () => setPlaying(!playing));
  el.scrub.addEventListener('input', () => { setPlaying(false); seek(parseFloat(el.scrub.value)); });
  el.speed.addEventListener('change', () => { speed = parseFloat(el.speed.value); });
  el.full.addEventListener('click', () => {
    const d = document;
    if (d.fullscreenElement) d.exitFullscreen().catch(() => {});
    else d.documentElement.requestFullscreen().catch(() => {});
  });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowRight') { setPlaying(false); seek(Math.floor(t + 1e-6) + 1); }
    else if (e.key === 'ArrowLeft') { setPlaying(false); seek(Math.ceil(t - 1e-6) - 1); }
    else if (e.key === 'Home') { seek(0); }
    else if (e.key === 'End') { setPlaying(false); seek(D.years.length - 1); }
    else if (e.key === 'f' || e.key === 'F') el.full.click();
    else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('kiosk');
    else if (/^[1-9]$/.test(e.key) && chapters[+e.key - 1]) seek(D.years.indexOf(chapters[+e.key - 1].from));
  });

  // controls fade out while playing and the pointer is idle
  let idleTimer = null;
  function poke() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (playing) document.body.classList.add('idle'); }, 3500);
  }
  ['pointermove', 'pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, poke, { passive: true }));

  if (location.hash === '#kiosk') document.body.classList.add('kiosk');

  function fitColumns() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const ring of D.boundary) for (const [x, y] of ring) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const aspect = (x1 - x0) / (y1 - y0);
    const mapH = canvas.parentElement.getBoundingClientRect().height || window.innerHeight * 0.85;
    // as wide as the map needs at full height, but always leave the story column at least ~30% of the screen
    const w = Math.min(mapH * aspect * 1.03, window.innerWidth * 0.68);
    document.documentElement.style.setProperty('--map-w', Math.round(w) + 'px');
  }
  window.addEventListener('resize', () => { fitColumns(); resize(); drawLegend(); el.spark.width = 0; });
  fitColumns();
  resize();
  drawLegend();
  setPlaying(playing);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lastDrawn = -1; drawLegend(); });
  requestAnimationFrame(frame);
})();
