# seam shifter

A physics-accurate pitch design sandbox and replicate-a-pitch minigame,
calibrated on MLB Statcast pitch-level data.

Dial in velocity, spin rate, spin direction (tilt), gyro angle, seam mode
(4-seam vs 2-seam grip), and release point — watch the resulting flight in
real time from catcher/pitcher/side/top views with slow-mo, scrubbing, and
ghost-trail comparisons. Challenge mode serves you a real pitch from a real
pitcher (Imai, Skubal, Skenes, Sasaki, deGrom, Yamamoto, Crochet, Sale,
Ohtani, Fried — 2026 season); you reverse-engineer the sliders to match it.

## Run

```
npm install
npm run dev        # sandbox at localhost:5173
npm test           # physics + validation suites
```

## Physics

RK4 integration of gravity + drag + Magnus + an empirical seam-shifted-wake
(SSW) term, in the Statcast coordinate frame (ft, s):

- **Drag**: `Cd = cd0 + cdV(v-130) + cdS·S`, fit on ~133k pitches
- **Lift**: `Cl = S/(a + bS)` (Nathan-style), `S = R·ω_transverse/v`, fit on a
  high-efficiency FF/SI cohort
- **SSW**: the lateral force is rotated about the flight direction by
  `rot(gyro, tilt)`, fit separately for 4-seam-style and 2-seam-style grips
  (grip is the hidden variable tracking can't see; pitch type is the proxy).
  This reproduces the known phenomenology: sinkers/changeups/splitters deviate
  arm-side (+18–27°), gyro sliders/cutters glove-side (−22–28°).

### Validation (tests/validation.test.ts, run in CI-style via vitest)

- **Tier 1** — given a real pitch's spin direction and per-pitch drag, the
  model reproduces its full Statcast 9P flight path: **median RMSE 0.35 in,
  100% of held-out pitches ≤ 1 in**.
- **Tier 2** — given only sandbox inputs (velo, rpm, axis, gyro, seam) plus
  the league-fit model: **median plate miss 2.4 in** on held-out pitches; the
  SSW term improves mean miss from 4.5 → 2.8 in vs pure Magnus.

## Pipeline (offline, Python/uv)

```
cd pipeline
uv run fetch.py             # league sample + roster pitchers from Baseball Savant
uv run fit_model.py         # -> public/model/model.json + tests/fixtures
uv run export_challenge.py  # -> public/data/pitchers/*.json
```

Raw CSVs stay gitignored; only the fitted model and compact per-pitcher pitch
samples are committed.
