# seam-shifter

Pitch-physics sandbox + replicate-a-pitch minigame. Statcast-calibrated
RK4 flight model (drag/Magnus/seam-shifted-wake), Three.js frontend.

## Key directories

- `src/physics/` — pure-TS flight model (no three.js imports). Statcast frame:
  ft/s, +x catcher's right, +y toward pitcher, +z up. SSW surfaces are
  RHP-normalized; LHP mirrors via handSign.
- `src/render/`, `src/ui/`, `src/main.ts` — Three.js views + slider UI.
- `pipeline/` — Python (uv): fetch Savant data → fit model → export challenge
  JSON. Raw data in `pipeline/data/` (gitignored).
- `public/model/model.json` — fitted coefficients (committed; regenerate via
  `uv run fit_model.py`).
- `tests/` — physics unit tests + two-tier Statcast validation
  (`tests/fixtures/validation_pitches.json`, 250 held-out pitches).

## How to run

- `npm run dev` / `npm test` / `npm run build` (tsc + vite)
- Pipeline: `cd pipeline && uv run fetch.py|fit_model.py|export_challenge.py`

## Conventions

- Physics changes must keep `tests/validation.test.ts` green (tier-1 ≤1 in
  path RMSE; tier-2 bars are regression guards — retune only with refit).
- Tilt = movement clock (pitcher's view, 0° = 12:00); `spin_axis = 180 + tilt`.
- Player-facing randomness lives in challenge targets (real per-pitch data),
  never in the sandbox — sliders are deterministic.

## Deferred (agreed 2026-08-14)

- "Real golf game"-style arm/hand delivery mode (grip + arm slot stand-in
  exists as seam toggle only).
- HB/IVB movement chart panel; GitHub remote/hosting.
