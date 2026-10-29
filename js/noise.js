// Noise budget & detection range calculator
(function () {
  const $ = id => document.getElementById(id);
  const num = id => Math.max(0, parseFloat($(id).value) || 0);
  const MU = 1e-7; // mu0 / 4pi

  function presetLink(sel, ids) {
    $(sel).addEventListener('change', () => {
      const v = $(sel).value;
      if (v !== 'custom') v.split(',').forEach((x, i) => { $(ids[i]).value = x; });
      update();
    });
    ids.forEach(id => $(id).addEventListener('input', () => { $(sel).value = 'custom'; }));
  }
  presetLink('sensor', ['s0', 'fc']);
  presetLink('band', ['f1', 'f2']);
  presetLink('tgt', ['m']);

  const fmtNT = v => v === 0 ? '0' : v >= 1 ? v.toFixed(2) + ' nT' : v >= 0.001 ? (v * 1000).toPrecision(3) + ' pT' : (v * 1000).toExponential(1) + ' pT';
  const fmtM = r => r >= 1000 ? (r / 1000).toPrecision(3) + ' km' : r.toPrecision(3) + ' m';

  function update() {
    const s0 = num('s0'), fc = num('fc');
    let f1 = num('f1') || 1e-4, f2 = num('f2') || 1;
    if (f2 <= f1) f2 = f1 * 10;
    const sensor = s0 * Math.sqrt((f2 - f1) + fc * Math.log(f2 / f1)) / 1000; // nT
    const k = parseFloat($('k').value);
    const srcm = num('srcm'), srcr = Math.max(0.01, num('srcr'));
    const source = MU * Math.SQRT2 * srcm / srcr ** 3 * 1e9; // nT
    const parts = [
      ['Sensor (integrated over band)', sensor],
      ['Platform residual', num('plat')],
      ['Uncompensated source', source],
      ['Environment', num('env')],
    ];
    const tot = Math.sqrt(parts.reduce((a, p) => a + p[1] ** 2, 0));
    const m = num('m'), snr = Math.max(0.1, num('snr'));
    const range = tot > 0 ? Math.cbrt(k * MU * m / (snr * tot * 1e-9)) : Infinity;
    const dom = parts.reduce((a, b) => b[1] > a[1] ? b : a);

    $('kTot').textContent = fmtNT(tot);
    $('kRange').textContent = isFinite(range) ? fmtM(range) : '∞';
    $('kDom').textContent = dom[0].split(' (')[0];

    const mx = Math.max(...parts.map(p => p[1]), 1e-12);
    $('budget').innerHTML = parts.map(([n, v]) =>
      `<tr><td>${n}</td><td><div class="bar" style="width:${(100 * v / mx).toFixed(1)}%;${v === dom[1] ? '' : 'background:#9fb3c8'}"></div></td><td>${fmtNT(v)}</td></tr>`
    ).join('') + `<tr class="total"><td>Total (root sum of squares)</td><td></td><td>${fmtNT(tot)}</td></tr>`;

    // spectrum
    const fx = [], fy = [];
    for (let e = -4; e <= 1.3; e += 0.02) { const f = 10 ** e; fx.push(f); fy.push(s0 * Math.sqrt(1 + fc / f)); }
    const eq = tot * 1000 / Math.sqrt(f2 - f1);
    qplot($('cSpec'), {
      xlog: true, ylog: true, xlim: [1e-4, 20],
      ylim: [Math.max(1e-3, Math.min(...fy, eq) / 3), Math.max(...fy, eq) * 3],
      series: [{ x: fx, y: fy, color: '#1d5fa8', width: 2.5, label: 'Sensor ASD' }],
      hlines: [{ y: eq, color: '#e07a1f', dash: [6, 4], label: 'Total budget as flat in-band density' }],
      shade: { x0: f1, x1: f2 }, xlabel: 'Frequency (Hz)', ylabel: 'pT/√Hz'
    });

    // anomaly vs range
    const rr = [], an = [];
    const rmax = isFinite(range) ? range * 4 : 1e4, rmin = Math.max(0.5, (isFinite(range) ? range : 10) / 8);
    for (let i = 0; i <= 200; i++) { const r = rmin * (rmax / rmin) ** (i / 200); rr.push(r); an.push(k * MU * m / r ** 3 * 1e9); }
    qplot($('cRange'), {
      xlog: true, ylog: true, xlim: [rmin, rmax], ylim: [Math.min(an[200], tot) / 3, an[0] * 2],
      series: [{ x: rr, y: an, color: '#1d5fa8', width: 2.5, label: 'Peak anomaly' }],
      hlines: [{ y: snr * tot, color: '#1e9e8f', dash: [6, 4], label: `Threshold (SNR ${snr} × noise)` },
               { y: tot, color: '#9fb3c8', dash: [2, 3], label: 'Noise rms' }],
      points: isFinite(range) ? [{ x: range, y: snr * tot, color: '#1e9e8f', r: 6 }] : [],
      xlabel: 'Range (m)', ylabel: 'nT'
    });
  }
  document.querySelectorAll('#f input, #f select').forEach(e => e.addEventListener('input', update));
  addEventListener('resize', update);
  update();
})();
