// Tiny canvas plotting helper for the QuASI tools. No dependencies.
// plot(canvas, {series:[{x,y,color,width,dash,label}], xlog, ylog, xlim, ylim,
//   xlabel, ylabel, hlines:[{y,color,dash,label}], vlines:[{x,color,dash}],
//   shade:{x0,x1,color}, points:[{x,y,color,r,label}]})
(function () {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function niceTicks(lo, hi, n) {
    const span = hi - lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || mag * 10;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
    return out;
  }
  function logTicks(lo, hi) {
    const out = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      const v = 10 ** e; if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
    return out;
  }
  const fmt = v => {
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1e4 || a < 1e-2) return v.toExponential(0).replace('e+', 'e');
    return (+v.toPrecision(3)).toString();
  };
  function extent(series, key, log, pad) {
    let lo = Infinity, hi = -Infinity;
    series.forEach(s => s[key].forEach(v => { if (isFinite(v) && (!log || v > 0)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    if (!isFinite(lo)) { lo = log ? 1 : 0; hi = log ? 10 : 1; }
    if (lo === hi) { lo -= log ? lo / 2 : 1; hi += log ? hi : 1; }
    if (!log && pad) { const p = (hi - lo) * pad; lo -= p; hi += p; }
    return [lo, hi];
  }
  window.qplot = function (cv, o) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const m = { l: 62, r: 14, t: 12, b: 42 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const series = o.series || [];
    const [x0, x1] = o.xlim || extent(series, 'x', o.xlog, 0);
    const [y0, y1] = o.ylim || extent(series, 'y', o.ylog, 0.08);
    const tx = o.xlog ? v => m.l + pw * (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : v => m.l + pw * (v - x0) / (x1 - x0);
    const ty = o.ylog ? v => m.t + ph * (1 - (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) : v => m.t + ph * (1 - (v - y0) / (y1 - y0));
    const ink = css('--ink') || '#14202e', rule = css('--rule') || '#dce3ea', mute = css('--mute') || '#7a8896';
    g.font = '12px ' + (css('--sans') || 'sans-serif'); g.lineWidth = 1;
    if (o.shade) { g.fillStyle = o.shade.color || 'rgba(30,158,143,.10)'; g.fillRect(tx(o.shade.x0), m.t, tx(o.shade.x1) - tx(o.shade.x0), ph); }
    const xt = o.xlog ? logTicks(x0, x1) : niceTicks(x0, x1, Math.max(3, Math.floor(pw / 90)));
    const yt = o.ylog ? logTicks(y0, y1) : niceTicks(y0, y1, Math.max(3, Math.floor(ph / 45)));
    g.strokeStyle = rule; g.fillStyle = mute; g.textAlign = 'center'; g.textBaseline = 'top';
    xt.forEach(v => { const X = tx(v); g.beginPath(); g.moveTo(X, m.t); g.lineTo(X, m.t + ph); g.stroke(); g.fillText(fmt(v), X, m.t + ph + 6); });
    g.textAlign = 'right'; g.textBaseline = 'middle';
    yt.forEach(v => { const Y = ty(v); g.beginPath(); g.moveTo(m.l, Y); g.lineTo(m.l + pw, Y); g.stroke(); g.fillText(fmt(v), m.l - 8, Y); });
    g.strokeStyle = '#b8c4d0'; g.beginPath(); g.moveTo(m.l, m.t + ph); g.lineTo(m.l + pw, m.t + ph); g.stroke();
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'bottom';
    if (o.xlabel) g.fillText(o.xlabel, m.l + pw / 2, H - 2);
    if (o.ylabel) { g.save(); g.translate(13, m.t + ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText(o.ylabel, 0, 0); g.restore(); }
    g.save(); g.beginPath(); g.rect(m.l, m.t, pw, ph); g.clip();
    const line = (s) => {
      g.strokeStyle = s.color || '#1d5fa8'; g.lineWidth = s.width || 2; g.setLineDash(s.dash || []); g.lineJoin = 'round';
      g.beginPath(); let pen = false;
      for (let i = 0; i < s.x.length; i++) {
        const xv = s.x[i], yv = s.y[i];
        if (!isFinite(xv) || !isFinite(yv) || (o.xlog && xv <= 0) || (o.ylog && yv <= 0)) { pen = false; continue; }
        const X = tx(xv), Y = ty(yv); pen ? g.lineTo(X, Y) : g.moveTo(X, Y); pen = true;
      }
      g.stroke(); g.setLineDash([]);
    };
    (o.hlines || []).forEach(h => line({ x: [x0, x1], y: [h.y, h.y], color: h.color, width: h.width || 1.5, dash: h.dash }));
    (o.vlines || []).forEach(v => line({ x: [v.x, v.x], y: [y0, y1], color: v.color, width: v.width || 1.5, dash: v.dash }));
    series.forEach(line);
    (o.points || []).forEach(p => { g.fillStyle = p.color || ink; g.beginPath(); g.arc(tx(p.x), ty(p.y), p.r || 5, 0, 7); g.fill(); });
    g.restore();
    const labels = [...series, ...(o.hlines || [])].filter(s => s.label);
    if (labels.length) {
      g.textAlign = 'left'; g.textBaseline = 'middle'; let X = m.l + 10, Y = m.t + 12;
      labels.forEach(s => {
        const w = g.measureText(s.label).width + 36;
        if (X + w > m.l + pw) { X = m.l + 10; Y += 18; }
        g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(X - 4, Y - 8, w, 16);
        g.strokeStyle = s.color; g.lineWidth = 2.5; g.setLineDash(s.dash || []); g.beginPath(); g.moveTo(X, Y); g.lineTo(X + 20, Y); g.stroke(); g.setLineDash([]);
        g.fillStyle = ink; g.fillText(s.label, X + 26, Y); X += w + 8;
      });
    }
    return { tx, ty };
  };
})();
