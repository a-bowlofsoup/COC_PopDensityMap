/*
 * Demo data generator.
 * Used only when data/density-data.js (made by pipeline/build_density_frames.py) is missing.
 * The population totals are real Census figures. The spatial pattern is a hand-tuned
 * simulation of how Chandler grew (downtown first, then west and north, then south
 * of the Santan Freeway, then the southeast), so the app can be shown before the real
 * parcel data is processed. Replace it with real data before submitting.
 */
(function (root) {
  'use strict';

  // Approximate city outline (lon, lat). Section-line stair steps, like the real limits.
  const OUTLINE = [
    [-111.972, 33.350], [-111.935, 33.350], [-111.935, 33.336], [-111.897, 33.336],
    [-111.897, 33.350], [-111.861, 33.350], [-111.861, 33.336], [-111.825, 33.336],
    [-111.825, 33.322], [-111.790, 33.322], [-111.790, 33.292], [-111.756, 33.292],
    [-111.756, 33.263], [-111.720, 33.263], [-111.720, 33.219], [-111.790, 33.219],
    [-111.806, 33.205], [-111.861, 33.205], [-111.880, 33.219], [-111.915, 33.219],
    [-111.915, 33.248], [-111.930, 33.263], [-111.945, 33.292], [-111.972, 33.306]
  ];

  const CENSUS = { 1970: 13763, 1980: 29673, 1990: 90533, 2000: 176581, 2010: 236123, 2020: 275987, 2024: 280014, 2025: 278748 };

  const LON0 = -111.985, LON1 = -111.705, LAT0 = 33.193, LAT1 = 33.362;
  const CELL = 100;
  const MX = 111320 * Math.cos(33.28 * Math.PI / 180); // metres per degree longitude
  const MY = 110950;
  const W = Math.round((LON1 - LON0) * MX / CELL);
  const H = Math.round((LAT1 - LAT0) * MY / CELL);
  const gx = lon => (lon - LON0) * MX / CELL;
  const gy = lat => (LAT1 - lat) * MY / CELL;

  function censusPop(y) {
    const ks = Object.keys(CENSUS).map(Number).sort((a, b) => a - b);
    if (CENSUS[y]) return CENSUS[y];
    if (y < ks[0]) return CENSUS[ks[0]];
    if (y > ks[ks.length - 1]) return CENSUS[ks[ks.length - 1]];
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i], b = ks[i + 1];
      if (y > a && y < b) return CENSUS[a] * Math.pow(CENSUS[b] / CENSUS[a], (y - a) / (b - a));
    }
  }

  function pip(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Non-residential land: blobs are never placed here, so it stays blue.
  const HOLES = [
    p => Math.hypot((p[0] + 111.811) * MX, (p[1] - 33.269) * MY) < 1100,             // Chandler Municipal Airport
    p => p[0] > -111.902 && p[0] < -111.883 && p[1] > 33.232 && p[1] < 33.292,       // Price Rd corridor / Intel Ocotillo
    p => p[0] > -111.972 && p[0] < -111.950 && p[1] > 33.300 && p[1] < 33.325,       // I-10 industrial edge
    p => Math.hypot((p[0] + 111.815) * MX, (p[1] - 33.315) * MY) < 350               // Tumbleweed Park
  ];

  // Growth zones: [lonMin, lonMax, latMin, latMax, startMin, startMax, count, weight, sigmaMin, sigmaMax]
  const ZONES = [
    [-111.852, -111.830, 33.293, 33.313, 1935, 1968, 18, 0.38, 3.0, 4.0],  // original townsite
    [-111.875, -111.805, 33.285, 33.335, 1960, 1984, 44, 0.5, 3.5, 5.5],   // near-downtown ring
    [-111.972, -111.885, 33.300, 33.350, 1980, 1996, 76, 0.5, 3.5, 5.5],   // west Chandler
    [-111.830, -111.790, 33.292, 33.335, 1984, 1999, 40, 0.5, 3.5, 5.5],   // northeast
    [-111.945, -111.805, 33.262, 33.300, 1988, 2003, 84, 0.5, 3.5, 5.5],   // central, Ray to Pecos
    [-111.915, -111.855, 33.219, 33.262, 1996, 2010, 52, 0.48, 3.5, 5.5],  // Ocotillo
    [-111.862, -111.800, 33.205, 33.262, 1998, 2012, 60, 0.48, 3.5, 5.5],  // south central
    [-111.800, -111.720, 33.219, 33.292, 2000, 2020, 84, 0.45, 3.5, 5.5],  // southeast
  ];
  // Denser pockets: apartments and townhomes. [lon, lat, jitter, startMin, startMax, count, weight]
  const DENSE = [
    [-111.8415, 33.3030, 0.006, 2012, 2024, 5, 3.0],   // downtown infill
    [-111.8960, 33.3060, 0.008, 1999, 2014, 6, 2.6],   // around Chandler Fashion Center
    [-111.8415, 33.2700, 0.030, 1996, 2022, 8, 2.4],   // Arizona Ave corridor
    [-111.9400, 33.3300, 0.010, 1986, 1999, 4, 2.2],   // west Chandler apartments
    [-111.8700, 33.2450, 0.010, 2003, 2019, 4, 2.2],   // Ocotillo / Price corridor
    [-111.8000, 33.3050, 0.010, 1995, 2008, 3, 2.0],   // Gilbert Rd
  ];

  function makeDemoData() {
    const YEARS = [];
    for (let y = 1970; y <= 2025; y++) YEARS.push(y);
    const R = rng(20261118);
    const polyG = OUTLINE.map(([lo, la]) => [gx(lo), gy(la)]);
    const mask = new Uint8Array(W * H);
    let nIn = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (pip(i + 0.5, j + 0.5, polyG)) { mask[j * W + i] = 1; nIn++; }
    }
    const okAt = (lon, lat) => pip(gx(lon), gy(lat), polyG) && !HOLES.some(h => h([lon, lat]));

    const blobs = [];
    const place = (lo0, lo1, la0, la1) => {
      for (let k = 0; k < 60; k++) {
        const lon = lo0 + R() * (lo1 - lo0), lat = la0 + R() * (la1 - la0);
        if (okAt(lon, lat)) return [lon, lat];
      }
      return null;
    };
    for (const [lo0, lo1, la0, la1, s0, s1, n, w, sg0, sg1] of ZONES) {
      for (let k = 0; k < n; k++) {
        const p = place(lo0, lo1, la0, la1);
        if (!p) continue;
        blobs.push({ x: gx(p[0]), y: gy(p[1]), s: sg0 + R() * (sg1 - sg0), w: w * (0.7 + R() * 0.6),
          start: s0 + R() * (s1 - s0), dur: 2 + R() * 5 });
      }
    }
    for (const [lon, lat, j, s0, s1, n, w] of DENSE) {
      for (let k = 0; k < n; k++) {
        const p = place(lon - j, lon + j, lat - j, lat + j);
        if (!p) continue;
        blobs.push({ x: gx(p[0]), y: gy(p[1]), s: 2.0 + R() * 1.2, w: w * 0.3 * (0.7 + R() * 0.6),
          start: s0 + R() * (s1 - s0), dur: 2 + R() * 3 });
      }
    }

    // Precompute each blob's kernel footprint once.
    for (const b of blobs) {
      const r = Math.ceil(b.s * 3);
      b.i0 = Math.max(0, Math.floor(b.x) - r); b.i1 = Math.min(W - 1, Math.floor(b.x) + r);
      b.j0 = Math.max(0, Math.floor(b.y) - r); b.j1 = Math.min(H - 1, Math.floor(b.y) + r);
      const k = new Float32Array((b.i1 - b.i0 + 1) * (b.j1 - b.j0 + 1));
      let t = 0;
      for (let j = b.j0; j <= b.j1; j++) for (let i = b.i0; i <= b.i1; i++) {
        const dx = i + 0.5 - b.x, dy = j + 0.5 - b.y;
        k[t++] = Math.exp(-(dx * dx + dy * dy) / (2 * b.s * b.s));
      }
      // Normalise so every blob of weight 1 holds the same number of people per unit area of peak.
      b.k = k;
    }

    const refPop = censusPop(2020);
    const refCellPop = refPop / nIn;
    const frames = [];
    const population = {};
    for (const year of YEARS) {
      const f = new Float32Array(W * H);
      // scattered farmhouses
      for (let c = 0; c < f.length; c++) if (mask[c]) f[c] = 0.012;
      for (const b of blobs) {
        const g = Math.min(1, Math.max(0, (year - b.start) / b.dur));
        if (g <= 0) continue;
        const a = b.w * g * g * (3 - 2 * g);
        let t = 0;
        for (let j = b.j0; j <= b.j1; j++) {
          const row = j * W;
          for (let i = b.i0; i <= b.i1; i++) f[row + i] += a * b.k[t++];
        }
      }
      let sum = 0;
      for (let c = 0; c < f.length; c++) if (mask[c]) sum += f[c];
      const pop = censusPop(year);
      const sc = pop / sum / refCellPop;
      for (let c = 0; c < f.length; c++) f[c] *= sc;
      frames.push(f);
      population[year] = Math.round(pop);
    }

    const label = (name, lon, lat, rank) => ({ name, x: gx(lon), y: gy(lat), rank });
    return {
      version: 1,
      demo: true,
      title: 'Chandler, filling in',
      place: 'Chandler, AZ',
      width: W, height: H, cellSizeM: CELL,
      years: YEARS,
      population,
      censusYears: [1970, 1980, 1990, 2000, 2010, 2020],
      refYear: 2020,
      refDensityPerSqMi: 4276,
      boundary: [polyG],
      labels: [
        label('Downtown', -111.8413, 33.3030, 1),
        label('Chandler Fashion Center', -111.8990, 33.3010, 2),
        label('West Chandler', -111.9450, 33.3270, 3),
        label('Ocotillo', -111.8750, 33.2440, 2),
        label('Airport', -111.8110, 33.2690, 3),
        label('Southeast', -111.7550, 33.2420, 3),
      ],
      chapters: [
        { from: 1970, to: 1980, title: 'A farm town on the edge', text: '13,763 people, a downtown square and miles of cotton and alfalfa. Most of today’s city is still fields.' },
        { from: 1980, to: 1990, title: 'Silicon Desert', text: 'Intel opens in Chandler in 1980. In ten years the city triples, to 90,533.' },
        { from: 1990, to: 2000, title: 'The subdivision decade', text: 'Master-planned neighborhoods fill west and north Chandler. The city nearly doubles, to 176,581.' },
        { from: 2000, to: 2010, title: 'South of the Santan', text: 'Chandler Fashion Center opens in 2001 and the Santan Freeway is finished in 2006. Homes push south and east.' },
        { from: 2010, to: 2025, title: 'Built out, building up', text: 'Farmland runs out and growth slows. New residents arrive in apartments near downtown and the freeways.' },
      ],
      source: 'Population: U.S. Census Bureau decennial census & PEP. Map pattern: simulated demo. Run the ArcPy pipeline to replace it with parcel data.',
      frames
    };
  }

  root.makeDemoData = makeDemoData;
})(typeof window !== 'undefined' ? window : globalThis);
