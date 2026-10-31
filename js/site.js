// QuASI site behaviour: nav state, mobile menu, hero map + profile trace.
(function () {
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const btn = document.getElementById('menuBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
    });
    nav.querySelectorAll('ul a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open'); btn.setAttribute('aria-expanded', false);
    }));
  }

  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Preview curve on the MAD simulator card: an Anderson-like dipole signature.
  const pv = document.getElementById('pvSig');
  if (pv) {
    let d = '';
    for (let i = 0; i <= 200; i++) {
      const u = (i - 100) / 22, f = (1 + u * u) ** -2.5;
      const v = 0.9 * f - 1.6 * u * f + 0.25 * u * u * f;
      d += (i ? 'L' : 'M') + (20 + i * 1.85).toFixed(1) + ' ' + (75 - 55 * v).toFixed(1);
    }
    pv.setAttribute('d', d);
  }

  const H = window.HERO_LINE;
  const map = document.getElementById('mapSvg'), tr = document.getElementById('traceSvg');
  if (!H || !map || !tr) return;

  const n = H.px.length, W = 1000, MH = 827, TH = 170;
  const all = H.map.concat(H.meas).filter(v => v !== null && !isNaN(v));
  const lo = Math.min(...all), hi = Math.max(...all), kmMax = H.km[n - 1];
  const tx = i => (H.km[i] / kmMax) * W;
  const ty = v => TH - 12 - ((v - lo) / (hi - lo)) * (TH - 24);
  const path = (arr, fx, fy) => {
    let d = '', pen = false;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (v === null || isNaN(v)) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + fx(i).toFixed(1) + ' ' + fy(v, i).toFixed(1); pen = true;
    }
    return d;
  };

  // map: flight line + aircraft marker
  const mapLine = el('path', {
    d: path(H.px, i => H.px[i] * W, (_, i) => H.py[i] * MH),
    fill: 'none', stroke: '#14202e', 'stroke-width': 3, 'stroke-linecap': 'round',
    'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', opacity: .85
  }, map);
  const dot = el('circle', { r: 9, fill: '#fff', stroke: '#1d5fa8', 'stroke-width': 3,
    cx: H.px[0] * W, cy: H.py[0] * MH, 'vector-effect': 'non-scaling-stroke' }, map);

  // MagNav estimate (teal, with 2-sigma ring drawn x20) and INS-only drift (orange), shown on hover
  const hasEst = Array.isArray(H.estPx);
  const navG = el('g', { opacity: 0, style: 'transition:opacity .2s' }, map);
  const insLine = el('line', { stroke: '#e07a1f', 'stroke-width': 2.5, 'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke' }, navG);
  const insDot = el('circle', { r: 11, fill: '#e07a1f', stroke: '#fff', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, navG);
  const ring = el('circle', { fill: 'rgba(30,158,143,.18)', stroke: '#1e9e8f', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, navG);
  const estDot = el('circle', { r: 9, fill: '#1e9e8f', stroke: '#fff', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, navG);
  const EX = 40;
  const fmtD = m => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
  function showNav(i) {
    if (!hasEst) return;
    const tx_ = H.px[i] * W, ty_ = H.py[i] * MH;
    insLine.setAttribute('x1', tx_); insLine.setAttribute('y1', ty_);
    insLine.setAttribute('x2', H.insPx[i] * W); insLine.setAttribute('y2', H.insPy[i] * MH);
    insDot.setAttribute('cx', H.insPx[i] * W); insDot.setAttribute('cy', H.insPy[i] * MH);
    const r = Math.max(22, H.sd2[i] * EX * W / H.mW);
    ring.setAttribute('cx', H.estPx[i] * W); ring.setAttribute('cy', H.estPy[i] * MH); ring.setAttribute('r', r);
    estDot.setAttribute('cx', H.estPx[i] * W); estDot.setAttribute('cy', H.estPy[i] * MH);
    navG.setAttribute('opacity', 1);
  }

  // trace
  el('line', { x1: 0, x2: W, y1: TH - 2, y2: TH - 2, stroke: '#dce3ea', 'vector-effect': 'non-scaling-stroke' }, tr);
  const mp = el('path', { d: path(H.map, tx, v => ty(v)), fill: 'none', stroke: '#9fb3c8',
    'stroke-width': 4, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, tr);
  const ms = el('path', { d: path(H.meas, tx, v => ty(v)), fill: 'none', stroke: '#1d5fa8',
    'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, tr);
  const cur = el('line', { y1: 0, y2: TH, stroke: '#14202e', 'stroke-width': 1,
    'vector-effect': 'non-scaling-stroke', opacity: 0 }, tr);

  // one orchestrated moment: the aircraft flies the line as the trace draws
  if (!reduce) {
    const dur = 2600;
    [mapLine, mp, ms].forEach(p => {
      const L = p.getTotalLength();
      p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
      p.getBoundingClientRect();
      p.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(.45,0,.25,1)`;
      requestAnimationFrame(() => { p.style.strokeDashoffset = 0; });
    });
    const t0 = performance.now();
    const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur), i = Math.round(ease(t) * (n - 1));
      dot.setAttribute('cx', H.px[i] * W); dot.setAttribute('cy', H.py[i] * MH);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  } else {
    dot.setAttribute('cx', H.px[n - 1] * W); dot.setAttribute('cy', H.py[n - 1] * MH);
  }

  const readout = document.getElementById('traceReadout'), defaultText = readout.textContent;
  const move = e => {
    const r = tr.getBoundingClientRect();
    const km = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * kmMax;
    let i = 0; while (i < n - 1 && H.km[i] < km) i++;
    dot.setAttribute('cx', H.px[i] * W); dot.setAttribute('cy', H.py[i] * MH);
    cur.setAttribute('x1', tx(i)); cur.setAttribute('x2', tx(i)); cur.setAttribute('opacity', .5);
    const m = H.meas[i], p = H.map[i];
    showNav(i);
    readout.textContent = `${H.km[i].toFixed(1)} km: measured ${m >= 0 ? '+' : ''}${m.toFixed(0)} nT, map ${p >= 0 ? '+' : ''}${(p ?? NaN).toFixed(0)} nT` +
      (hasEst ? ` · MagNav error ${fmtD(H.err[i])} (±${fmtD(H.sd2[i])}), INS alone ${fmtD(H.insErr[i])}` : '');
  };
  tr.addEventListener('pointermove', move);
  tr.addEventListener('pointerleave', () => { cur.setAttribute('opacity', 0); navG.setAttribute('opacity', 0); readout.textContent = defaultText; });
})();

// Portrait: fades in, then eases from a slight zoom to rest as it scrolls through the viewport.
(function () {
  const box = document.getElementById('portrait');
  if (!box) return;
  const img = box.querySelector('img');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { box.classList.add('in'); return; }
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = box.getBoundingClientRect(), vh = innerHeight;
    // p: 0 when the photo's top enters the bottom of the screen, 1 when it reaches 25% from the top
    const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
    const e = 1 - Math.pow(1 - p, 3);
    img.style.transform = `scale(${(1.14 - 0.14 * e).toFixed(4)}) translateY(${(3 - 3 * e).toFixed(2)}%)`;
    if (p > 0.05) box.classList.add('in');
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); update();
})();
