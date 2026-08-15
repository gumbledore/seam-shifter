import { PLATE_Y } from "./constants";
import type { TrajPoint } from "./integrate";
import { add, scale, type V3 } from "./vec";

/**
 * Statcast 9-parameter kinematics: position/velocity at y=50 ft plus constant
 * acceleration. This is Statcast's own smoothed representation of a tracked
 * pitch — we use it as ground truth for validation and to render challenge
 * targets exactly.
 */
export interface NineP {
  p0: V3; // position at t=0 (y = 50 ft plane)
  v0: V3;
  a: V3;
}

export function stateAt(k: NineP, t: number): TrajPoint {
  return {
    t,
    pos: add(add(k.p0, scale(k.v0, t)), scale(k.a, 0.5 * t * t)),
    vel: add(k.v0, scale(k.a, t)),
  };
}

/**
 * Time when the y-coordinate crosses plane yPlane. Planes closer to the plate
 * than p0 give t > 0; planes behind (toward release) give t < 0. Picks the
 * physical root (smallest |t|).
 */
export function timeAtY(k: NineP, yPlane: number): number {
  const y0 = k.p0[1];
  const vy = k.v0[1];
  const ay = k.a[1];
  // 0.5*ay*t^2 + vy*t + (y0 - yPlane) = 0
  const c = y0 - yPlane;
  if (Math.abs(ay) < 1e-9) return -c / vy;
  const disc = vy * vy - 2 * ay * c;
  const sq = Math.sqrt(Math.max(0, disc));
  const t1 = (-vy - sq) / ay;
  const t2 = (-vy + sq) / ay;
  const want = yPlane <= y0 ? [t1, t2].filter((t) => t >= 0) : [t1, t2].filter((t) => t <= 0);
  want.sort((a, b) => Math.abs(a) - Math.abs(b));
  return want[0] ?? 0;
}

/**
 * Build the 9P from raw Statcast columns. vx0/vy0/vz0 are reported at y=50;
 * x0/z0 are not published, so recover them from the plate crossing.
 */
export function ninePFromRow(row: {
  vx0: number; vy0: number; vz0: number;
  ax: number; ay: number; az: number;
  plate_x: number; plate_z: number;
}): NineP {
  const k: NineP = {
    p0: [0, 50, 0],
    v0: [row.vx0, row.vy0, row.vz0],
    a: [row.ax, row.ay, row.az],
  };
  const tp = timeAtY(k, PLATE_Y);
  const x0 = row.plate_x - row.vx0 * tp - 0.5 * row.ax * tp * tp;
  const z0 = row.plate_z - row.vz0 * tp - 0.5 * row.az * tp * tp;
  k.p0 = [x0, 50, z0];
  return k;
}

/** Back-extrapolate the 9P to the release plane y = 60.5 - extension (t will be negative). */
export function timeAtRelease(k: NineP, extension: number): number {
  return timeAtY(k, 60.5 - extension);
}
