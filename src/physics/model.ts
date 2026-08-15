/** SSW rotation surface: rot = r0 + rG*sin(g) + rT*sin(t)*cos(g) (radians). */
export interface SswSurface {
  r0: number;
  rG: number;
  rT: number;
  s0: number;
}

/** 0 = four-seam-style grip, 1 = two-seam-style grip (SI/CH/FS/ST family). */
export type SeamMode = 0 | 1;

/** Fitted aerodynamic model coefficients, produced by pipeline/fit_model.py. */
export interface AeroModel {
  /** Drag: Cd = cd0 + cdV*(v-130 ft/s) + cdS*S_total */
  cd: { cd0: number; cdV: number; cdS: number };
  /** Lift: Cl = scale * S / (a + b*S), S = R*omegaT/v (scale defaults to 1) */
  cl: { a: number; b: number; scale?: number };
  /**
   * Seam-shifted-wake / non-Magnus deviation: the lateral force is rotated
   * about the flight direction by rot(gyro, tilt), fit separately per seam
   * mode from Statcast observed-vs-spin-inferred movement residuals. Grip is
   * the hidden variable tracking can't see — the sandbox exposes it directly.
   */
  ssw: { mode0: SswSurface; mode1: SswSurface };
  meta?: { fitDate?: string; nPitches?: number; notes?: string };
}

const NO_SSW: SswSurface = { r0: 0, rG: 0, rT: 0, s0: 0 };

/** Physics-only defaults (no SSW) used before/without a fitted model. */
export const DEFAULT_MODEL: AeroModel = {
  cd: { cd0: 0.33, cdV: 0.0, cdS: 0.3 },
  cl: { a: 0.583, b: 2.333 }, // Nathan-style Cl(S) curve
  ssw: { mode0: NO_SSW, mode1: NO_SSW },
  meta: { notes: "unfitted defaults" },
};
