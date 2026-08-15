import { BALL_RADIUS, RPM_TO_RADS } from "./constants";
import { cross, scale, unit, type V3, add } from "./vec";

/**
 * Spin conventions.
 *
 * Tilt: clock-face direction the *movement* points, pitcher's-view clock in
 * degrees clockwise from 12:00 (Savant convention: 12:00 = pure backspin/ride).
 * Positive tilt (toward 1:00-3:00) = glove... arm-side for RHP; the Statcast
 * `spin_axis` column relates as spin_axis = (180 + tilt) mod 360.
 *
 * Gyro angle: 0 deg = fully transverse spin (100% efficiency), +/-90 deg =
 * pure gyro (bullet spin). Sign = component along (+) or against (-) the
 * direction of travel; it doesn't affect Magnus but feeds the SSW term.
 */

/** Movement unit direction in the x-z plane (catcher view) for a tilt in degrees. */
export function movementDir(tiltDeg: number): V3 {
  const t = (tiltDeg * Math.PI) / 180;
  // 12:00 -> +z (ride); 3:00 (pitcher's view) -> catcher's -x (RHP arm side)
  return [-Math.sin(t), 0, Math.cos(t)];
}

/** Full spin vector (rad/s) from rpm, tilt and gyro angle, given travel dir vhat. */
export function spinVector(rpm: number, tiltDeg: number, gyroDeg: number, vhat: V3): V3 {
  const w = rpm * RPM_TO_RADS;
  const g = (gyroDeg * Math.PI) / 180;
  const m = movementDir(tiltDeg);
  const wT = unit(cross(vhat, m)); // transverse spin axis producing movement along m
  return add(scale(wT, w * Math.cos(g)), scale(vhat, w * Math.sin(g)));
}

/** Spin factor S = R * omega_transverse / v (dimensionless), drives lift. */
export function spinFactor(omegaT: number, v: number): number {
  return v > 0 ? (BALL_RADIUS * omegaT) / v : 0;
}

export const tiltToSpinAxis = (tiltDeg: number): number => (((180 + tiltDeg) % 360) + 360) % 360;
export const spinAxisToTilt = (spinAxisDeg: number): number => {
  const t = (((spinAxisDeg - 180) % 360) + 360) % 360;
  return t > 180 ? t - 360 : t; // signed (-180, 180]
};

/** Format tilt degrees as a clock string, e.g. 37.5 -> "1:15". */
export function tiltToClock(tiltDeg: number): string {
  const t = (((tiltDeg % 360) + 360) % 360) / 30; // hours from 12
  let h = Math.floor(t);
  let m = Math.round((t - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  h = ((h + 11) % 12) + 1; // 0 -> 12
  return `${h}:${m.toString().padStart(2, "0")}`;
}
