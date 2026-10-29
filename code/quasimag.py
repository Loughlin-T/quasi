"""quasimag - small, dependency-light tools for airborne magnetometer processing.
(c) QuASI Inc. MIT License."""
import numpy as np
from scipy import signal

def bpf(x, fs=10.0, lo=0.1, hi=0.9, order=4):
    """Zero-phase Butterworth band-pass filter."""
    sos = signal.butter(order, [lo, hi], btype="band", fs=fs, output="sos")
    return signal.sosfiltfilt(sos, x, axis=0)

def tl_matrix(bx, by, bz, terms="permanent,induced,eddy", fs=10.0):
    """Tolles-Lawson design matrix from a vector magnetometer (fluxgate).
    Returns A with columns: 3 permanent, 5 induced, 8 eddy (16 total; redundant
    terms dropped because c.c = 1 and c.dc = 0)."""
    bt = np.sqrt(bx**2 + by**2 + bz**2)
    c = np.stack([bx/bt, by/bt, bz/bt], 1)
    dc = np.gradient(c, 1/fs, axis=0)
    cols = []
    t = terms.split(",")
    if "permanent" in t:
        cols += [c[:, 0], c[:, 1], c[:, 2]]
    if "induced" in t:
        cols += [bt*c[:, 0]*c[:, 1], bt*c[:, 0]*c[:, 2], bt*c[:, 1]**2,
                 bt*c[:, 1]*c[:, 2], bt*c[:, 2]**2]
    if "eddy" in t:
        # 8 eddy terms: c.dc = 0, so the c_z*dc_z column is redundant
        for i in range(3):
            for j in range(3):
                if not (i == 2 and j == 2):
                    cols.append(bt*c[:, i]*dc[:, j])
    return np.stack(cols, 1)

def tl_fit(A, y, fs=10.0, lam=0.0, lo=0.1, hi=0.9):
    """Fit TL coefficients on band-passed data (optionally ridge-regularised)."""
    Af, yf = bpf(A, fs, lo, hi), bpf(y, fs, lo, hi)
    trim = int(20*fs)  # drop filter edge effects
    Af, yf = Af[trim:-trim], yf[trim:-trim]
    return np.linalg.solve(Af.T@Af + lam*np.eye(A.shape[1]), Af.T@yf)

def tl_apply(A, y, coef):
    """Remove the modelled aircraft field (mean-preserving)."""
    corr = A@coef
    return y - (corr - corr.mean())

def detrend_std(x):
    """Std after removing a linear trend (removes per-line level/diurnal drift)."""
    return np.std(signal.detrend(x))

def psd(x, fs=10.0, nperseg=1024):
    f, p = signal.welch(signal.detrend(x), fs=fs, nperseg=nperseg)
    return f, np.sqrt(p)  # amplitude spectral density, units/sqrt(Hz)

def load_flight(path, keys=None):
    """Load a DAF-MIT MagNav HDF5 flight file into a dict of numpy arrays."""
    import h5py
    with h5py.File(path, "r") as f:
        n = int(np.array(f["N"]))
        keys = keys or [k for k in f.keys() if f[k].shape == (n,)]
        return {k: np.array(f[k]) for k in keys}

def load_map(path):
    """Load a MagNav HDF5 map; returns (xx, yy, map, alt) with 0-fill -> NaN."""
    import h5py
    with h5py.File(path, "r") as f:
        m = np.array(f["map"]).astype(float)
        m[m == 0] = np.nan
        return np.array(f["xx"]), np.array(f["yy"]), m, float(np.array(f["alt"]))

def style():
    """Matplotlib house style used in QuASI notebooks."""
    import matplotlib as mpl
    mpl.rcParams.update({
        "figure.dpi": 110, "figure.figsize": (9, 4), "axes.spines.top": False,
        "axes.spines.right": False, "axes.grid": True, "grid.alpha": .25,
        "axes.prop_cycle": mpl.cycler(color=["#1f4e79", "#e07a1f", "#2a9d8f",
                                             "#8e44ad", "#c0392b", "#7f8c8d"]),
        "font.size": 10, "axes.titleweight": "bold", "legend.frameon": False})

# ---------------------------------------------------------------- compensation
AUX_PREFIX = ("cur_", "vol_")
AUX_EXTRA = ["ins_roll", "ins_pitch", "roll_rt", "pitch_rt", "yaw_rt"]

def compensate_classic(D, mag, cal_mask, flux="b"):
    """Classic Tolles-Lawson fitted on a calibration manoeuvre (band-passed)."""
    A = tl_matrix(*(D[f"flux_{flux}_{a}"] for a in "xyz"))
    return tl_apply(A, D[mag], tl_fit(A[cal_mask], D[mag][cal_mask]))

def compensate_supervised(D, mag, ref, train_mask, flux="b", telemetry=True,
                          lp_hz=0.5, lam=1.0):
    """TL (+ optional low-passed aircraft telemetry) fitted to (mag - ref)."""
    A = tl_matrix(*(D[f"flux_{flux}_{a}"] for a in "xyz"))
    X = np.c_[A, np.ones(len(A))]
    if telemetry:
        keys = [k for k in D if k.startswith(AUX_PREFIX)] + AUX_EXTRA
        Z = np.stack([D[k] for k in keys], 1)
        Z = (Z - Z[train_mask].mean(0)) / (Z[train_mask].std(0) + 1e-9)
        if lp_hz:
            Z = signal.sosfiltfilt(signal.butter(4, lp_hz, fs=10, output="sos"), Z, axis=0)
        X = np.c_[X, Z]
    y = D[mag] - ref
    Xt = X[train_mask]
    coef = np.linalg.solve(Xt.T @ Xt + lam*np.eye(X.shape[1]), Xt.T @ y[train_mask])
    return D[mag] - X @ coef

# ---------------------------------------------------------------- navigation
def map_interpolator(xx, yy, m):
    from scipy.interpolate import RegularGridInterpolator
    return RegularGridInterpolator((xx, yy), m, bounds_error=False, fill_value=np.nan)

def simulate_ins(x, y, dt, bias_sd=0.5, rw_sd=0.01, rng=None):
    """Dead-reckoned track from true positions with a velocity bias + random walk
    error (m/s, m/s/sqrt(s)). bias_sd=0.5 m/s gives ~1.8 km/h drift."""
    rng = np.random.default_rng(rng)
    vx, vy = np.gradient(x, dt), np.gradient(y, dt)
    n = len(x)
    ev = rng.normal(0, bias_sd, 2) + np.cumsum(rng.normal(0, rw_sd*np.sqrt(dt), (n, 2)), 0)
    xi = x[0] + np.cumsum((vx + ev[:, 0])*dt) - (vx[0] + ev[0, 0])*dt
    yi = y[0] + np.cumsum((vy + ev[:, 1])*dt) - (vy[0] + ev[0, 1])*dt
    return xi, yi

def magnav_pf(z, xi, yi, interp, sigma, dt=1.0, n=3000, init_sd=200.0,
              q_pos=2.0, q_vel=0.01, bias_sd=50.0, rng=None):
    """Particle filter estimating the INS position error from scalar map matching.
    State per particle: [dx, dy, dvx, dvy, map_bias]. Returns estimated (x, y)."""
    rng = np.random.default_rng(rng)
    P = np.zeros((n, 5))
    P[:, :2] = rng.normal(0, init_sd, (n, 2))
    P[:, 2:4] = rng.normal(0, 0.5, (n, 2))
    P[:, 4] = rng.normal(np.nanmedian(z - interp(np.c_[xi, yi])), bias_sd, n)
    w = np.full(n, 1/n)
    est = np.zeros((len(z), 2))
    for k in range(len(z)):
        if k:
            P[:, 0:2] += P[:, 2:4]*dt + rng.normal(0, q_pos*np.sqrt(dt), (n, 2))
            P[:, 2:4] += rng.normal(0, q_vel*np.sqrt(dt), (n, 2))
            P[:, 4] += rng.normal(0, 0.2*np.sqrt(dt), n)
        h = interp(np.c_[xi[k] + P[:, 0], yi[k] + P[:, 1]]) + P[:, 4]
        ll = -0.5*((z[k] - h)/sigma)**2
        ll[np.isnan(ll)] = -1e3
        w = w*np.exp(ll - ll.max()); w /= w.sum()
        est[k] = [xi[k] + w @ P[:, 0], yi[k] + w @ P[:, 1]]
        if 1/np.sum(w**2) < n/2:  # systematic resampling
            idx = np.searchsorted(np.cumsum(w), (rng.random() + np.arange(n))/n)
            P, w = P[np.minimum(idx, n-1)], np.full(n, 1/n)
    return est[:, 0], est[:, 1]
