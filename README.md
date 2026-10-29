# QuASI Inc. website

Static site for Quantum & Autonomous Sensing Innovations Inc., served with GitHub Pages.

- `index.html`: home page
- `tools/`: browser calculators (noise budget, MAD simulator). Plain JavaScript, no build step.
- `notebooks/`: open notebooks (`.ipynb` plus rendered `.html`) and `quasimag.py`
- `code/quasimag.py`: shared Python module (MIT licence)

Notebook data: DAF-MIT AIA open flight data for magnetic navigation research, https://doi.org/10.5281/zenodo.4271803 (public domain).
Put `Flt1002-train.h5` and `Renfrew_1.h5` in `notebooks/data/` (or set `MAGNAV_DATA`) to re-run them.
