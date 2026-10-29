// MAD simulator: dipole total-field anomaly, synthetic noise, Anderson-function detector.
(function () {
  const $ = id => document.getElementById(id);
  const val = (id, d = 0) => { const v = parseFloat($(id).value); return isFinite(v) ? v : d; };
  const rad = Math.PI / 180, MU = 1e-7;
  let seed = 1;

  // seeded RNG + Gaussian
  function rng(s) {
    let a = s >>> 0;
    const u = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
  }
  const unit = (incDeg, decDeg) => {
    const I = incDeg * rad, D = decDeg * rad;
    return [Math.cos(I) * Math.sin(D), Math.cos(I) * Math.cos(D), -Math.sin(I)]; // east, north, up
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // total-field anomaly (nT) at position p (m) from dipole m (A m^2 vector) at origin
  function dT(p, mv, F) {
    const r = Math.hypot(p[0], p[1], p[2]), rh = [p[0] / r, p[1] / r, p[2] / r], mr = dot(mv, rh);
    const B = [0, 1, 2].map(i => MU * (3 * mr * rh[i] - mv[i]) / r ** 3);
    return dot(B, F) * 1e9;
  }
  // chi-square (3 dof) survival function and inverse
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  const chi3sf = x => erfc(Math.sqrt(x / 2)) + Math.sqrt(2 * x / Math.PI) * Math.exp(-x / 2);
  function chi3inv(p) { let lo = 0, hi = 400; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; chi3sf(m) > p ? lo = m : hi = m; } return (lo + hi) / 2; }

  // magnetic location preset
  $('loc').addEventListener('change', () => {
    const v = $('loc').value; if (v === 'custom') return;
    const [i, d] = v.split(','); $('inc').value = i; $('dec').value = d; syncMoment(); run();
  });
  ['inc', 'dec'].forEach(id => $(id).addEventListener('input', () => { $('loc').value = 'custom'; syncMoment(); }));
  function syncMoment() {
    const induced = $('mag').value === 'induced';
    $('minc').disabled = $('mdec').disabled = induced;
    if (induced) { $('minc').value = $('inc').value; $('mdec').value = $('dec').value; }
  }
  $('mag').addEventListener('change', () => { syncMoment(); run(); });
  $('rerun').addEventListener('click', () => { seed++; run(); });
  document.querySelectorAll('#f input, #f select').forEach(e => e.addEventListener('input', run));
  addEventListener('resize', run);

  function run() {
    const F = unit(val('inc'), val('dec'));
    const mdir = unit(val('minc'), val('mdec')), mm = Math.max(0, val('m'));
    const mv = mdir.map(c => c * mm);
    const h = Math.max(1, val('h', 40)), cpa = val('cpa'), hdg = val('hdg') * rad;
    const v = Math.max(0.5, val('v', 15)), fs = Math.min(200, Math.max(1, val('fs', 10)));
    const d = [Math.sin(hdg), Math.cos(hdg), 0], n = [Math.cos(hdg), -Math.sin(hdg), 0];
    const R = Math.hypot(cpa, h);

    // record: +/- 12 R, capped length
    let N = Math.round(24 * R / v * fs);
    const stride = Math.max(1, Math.ceil(N / 6000)); N = Math.min(N, 6000 * stride);
    const ds = v / fs, L = (N - 1) / 2 * ds;
    const s = new Float64Array(N), t = new Float64Array(N), sig = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      s[i] = -L + i * ds; t[i] = s[i] / v;
      const p = [cpa * n[0] + s[i] * d[0], cpa * n[1] + s[i] * d[1], h];
      sig[i] = dT(p, mv, F);
    }

    // noise: white + 1/f (filter bank) + slow platform residual
    const g = rng(seed * 7919), S0 = Math.max(0, val('s0')) * 1e-3, fc = Math.max(0, val('fc'));
    const noise = new Float64Array(N), sw = S0 * Math.sqrt(fs / 2);
    for (let i = 0; i < N; i++) noise[i] = sw * g();
    if (fc > 0 && S0 > 0) {
      const dl = Math.log(2) / 2, fmin = fs / N / 2;
      for (let gk = fmin; gk < fs / 2; gk *= Math.exp(dl)) {
        const Sk = (2 / Math.PI) * S0 * S0 * fc * dl / gk, a = Math.exp(-2 * Math.PI * gk / fs), b = (1 - a) * Math.sqrt(Sk * fs / 2);
        let x = b / (1 - a) * g();
        for (let i = 0; i < N; i++) { x = a * x + b * g(); noise[i] += x; }
      }
    }
    const sp = Math.max(0, val('plat'));
    if (sp > 0) {
      const a = Math.exp(-2 * Math.PI * 0.1 / fs), b = sp * Math.sqrt(1 - a * a);
      let x = sp * g();
      for (let i = 0; i < N; i++) { x = a * x + b * g(); noise[i] += x; }
    }
    let mean = 0; for (let i = 0; i < N; i++) mean += noise[i]; mean /= N;
    let vr = 0; for (let i = 0; i < N; i++) vr += (noise[i] - mean) ** 2;
    const sigma = Math.sqrt(vr / N);
    const meas = sig.map((x, i) => x + noise[i] - mean);

    // Anderson basis over a +/- 3R window, orthogonalised against a local linear trend
    const nW = Math.max(3, Math.round(3 * R / ds));
    const cols = [];
    const u = Array.from({ length: 2 * nW + 1 }, (_, j) => (j - nW) * ds / R);
    cols.push(u.map(() => 1), u.slice(), ...[0, 1, 2].map(k => u.map(x => x ** k / (1 + x * x) ** 2.5)));
    const Q = [];
    cols.forEach(c => {
      const q = c.slice();
      Q.forEach(p => { const a = p.reduce((acc, pv, j) => acc + pv * q[j], 0); for (let j = 0; j < q.length; j++) q[j] -= a * p[j]; });
      const nn = Math.hypot(...q); Q.push(q.map(x => x / nn));
    });
    const A = Q.slice(2);
    const energy = x => {
      const E = new Float64Array(N).fill(NaN);
      for (let c = nW; c < N - nW; c += stride) {
        let e = 0;
        for (const q of A) { let a = 0; for (let j = 0; j < q.length; j++) a += q[j] * x[c - nW + j]; e += a * a; }
        E[c] = e;
      }
      return E;
    };
    const En = energy(noise), Em = energy(meas);
    let acc = 0, cnt = 0; En.forEach(e => { if (isFinite(e)) { acc += e; cnt++; } });
    const norm = cnt ? acc / cnt / 3 : 1;
    const stat = Array.from(Em, e => e / norm);
    const thr = chi3inv(parseFloat($('pfa').value));
    let best = 0, iBest = -1, fa = 0, inside = false;
    for (let i = 0; i < N; i++) {
      if (!isFinite(stat[i])) continue;
      const near = Math.abs(s[i]) <= 3 * R;
      if (near && stat[i] > best) { best = stat[i]; iBest = i; }
      if (!near) { if (stat[i] > thr && !inside) { fa++; inside = true; } if (stat[i] <= thr) inside = false; }
    }

    // KPIs
    let mx = -Infinity, mn = Infinity, pk = 0;
    sig.forEach(x => { mx = Math.max(mx, x); mn = Math.min(mn, x); pk = Math.max(pk, Math.abs(x)); });
    const f = x => x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toPrecision(2);
    $('kPeak').textContent = f(mx - mn) + ' nT';
    $('kSnr').textContent = f(pk / (sigma || 1e-12));
    const det = best > thr;
    $('kDet').textContent = det ? 'Detected' : 'Not detected';
    $('kDetBox').className = det ? 'ok' : 'bad';
    $('kDetSub').textContent = `Peak statistic ${best.toFixed(1)} vs threshold ${thr.toFixed(1)}` + (fa ? `; ${fa} false alarm${fa > 1 ? 's' : ''} elsewhere` : '');
    $('sigCap').textContent = `Total-field anomaly along a ${(2 * L).toFixed(0)} m track. Range at closest approach ${R.toFixed(0)} m; noise rms ${f(sigma)} nT.`;

    const T = Array.from(t);
    qplot($('cSig'), {
      series: [{ x: T, y: Array.from(meas), color: '#9fb3c8', width: 1.2, label: 'Measured (signal + noise)' },
               { x: T, y: Array.from(sig), color: '#1d5fa8', width: 2.5, label: 'Target signal' }],
      xlabel: 'Time from closest approach (s)', ylabel: 'nT'
    });
    qplot($('cDet'), {
      series: [{ x: T.filter((_, i) => isFinite(stat[i])), y: stat.filter(isFinite), color: '#1d5fa8', width: 2, label: 'Detection statistic' }],
      hlines: [{ y: thr, color: '#1e9e8f', dash: [6, 4], label: 'Threshold' }],
      points: iBest >= 0 ? [{ x: t[iBest], y: best, color: det ? '#1e9e8f' : '#b5452f', r: 5 }] : [],
      ylim: [0, Math.max(thr * 1.6, best * 1.15)], xlim: [t[0], t[N - 1]],
      xlabel: 'Time from closest approach (s)', ylabel: 'χ² (3 dof)'
    });
    drawMap(mv, F, h, cpa, d, n, R);
  }

  const STOPS = ['#173f6e', '#2f6fb5', '#9cbde0', '#f4f7fa', '#a9ddd5', '#2aa392', '#0f6a60'].map(hx => [1, 3, 5].map(i => parseInt(hx.substr(i, 2), 16)));
  const cmap = z => { // z in [-1,1]
    const p = (Math.max(-1, Math.min(1, z)) + 1) / 2 * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(p)), f = p - i;
    return STOPS[i].map((c, k) => c + (STOPS[i + 1][k] - c) * f);
  };
  function drawMap(mv, F, h, cpa, d, n, R) {
    const cv = $('cMap'), dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ext = Math.max(3 * R, Math.abs(cpa) + 2 * R), aspect = W / H;
    const ex = ext * Math.max(1, aspect), ey = ext * Math.max(1, 1 / aspect);
    const G = 160, gw = Math.round(G * Math.max(1, aspect)), gh = Math.round(G * Math.max(1, 1 / aspect));
    const vals = new Float64Array(gw * gh); let vmax = 0;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = -ex + (i + .5) / gw * 2 * ex, y = ey - (j + .5) / gh * 2 * ey;
      const vv = dT([x, y, h], mv, F); vals[j * gw + i] = vv; vmax = Math.max(vmax, Math.abs(vv));
    }
    const img = g.createImageData(gw, gh);
    vals.forEach((vv, k) => { const c = cmap(Math.sign(vv) * Math.sqrt(Math.abs(vv) / (vmax || 1))); img.data.set([c[0], c[1], c[2], 255], k * 4); });
    const off = document.createElement('canvas'); off.width = gw; off.height = gh; off.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(off, 0, 0, W, H);
    const px = x => (x + ex) / (2 * ex) * W, py = y => (ey - y) / (2 * ey) * H;
    // track
    const big = 4 * Math.max(ex, ey);
    g.strokeStyle = '#14202e'; g.lineWidth = 2; g.setLineDash([]);
    g.beginPath(); g.moveTo(px(cpa * n[0] - big * d[0]), py(cpa * n[1] - big * d[1])); g.lineTo(px(cpa * n[0] + big * d[0]), py(cpa * n[1] + big * d[1])); g.stroke();
    // arrow for heading
    const ax = cpa * n[0] + 0.7 * ext * d[0], ay = cpa * n[1] + 0.7 * ext * d[1], hx = d[0], hy = d[1];
    g.fillStyle = '#14202e'; g.beginPath();
    g.moveTo(px(ax + 0.06 * ext * hx), py(ay + 0.06 * ext * hy));
    g.lineTo(px(ax - 0.04 * ext * hx + 0.035 * ext * hy), py(ay - 0.04 * ext * hy - 0.035 * ext * hx));
    g.lineTo(px(ax - 0.04 * ext * hx - 0.035 * ext * hy), py(ay - 0.04 * ext * hy + 0.035 * ext * hx)); g.fill();
    // target + CPA
    g.strokeStyle = '#14202e'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(px(0) - 7, py(0)); g.lineTo(px(0) + 7, py(0)); g.moveTo(px(0), py(0) - 7); g.lineTo(px(0), py(0) + 7); g.stroke();
    g.setLineDash([4, 4]); g.beginPath(); g.moveTo(px(0), py(0)); g.lineTo(px(cpa * n[0]), py(cpa * n[1])); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(px(cpa * n[0]), py(cpa * n[1]), 5, 0, 7); g.fill(); g.stroke();
    // labels
    g.font = '12px ' + getComputedStyle(document.documentElement).getPropertyValue('--sans');
    g.fillStyle = 'rgba(255,255,255,.88)'; g.fillRect(8, H - 28, 230, 20);
    g.fillStyle = '#14202e'; g.textBaseline = 'middle';
    g.fillText(`${(2 * ex).toFixed(0)} m × ${(2 * ey).toFixed(0)} m  ·  ±${vmax.toPrecision(2)} nT`, 14, H - 18);
    g.fillStyle = 'rgba(255,255,255,.88)'; g.fillRect(W - 34, 8, 26, 34);
    g.fillStyle = '#14202e'; g.textAlign = 'center'; g.fillText('N', W - 21, 34);
    g.beginPath(); g.moveTo(W - 21, 12); g.lineTo(W - 26, 22); g.lineTo(W - 16, 22); g.fill(); g.textAlign = 'left';
  }

  syncMoment(); run();
})();
