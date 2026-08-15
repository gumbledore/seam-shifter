import { BALL_RADIUS, C0, G } from "./constants";
import type { AeroModel, SeamMode } from "./model";
import { add, cross, dot, norm, scale, sub, unit, type V3 } from "./vec";

export interface PitchSpin {
  rpm: number;
  tiltDeg: number;
  gyroDeg: number;
}

/**
 * Total acceleration on the ball: gravity + drag + Magnus + SSW deviation.
 * omega is the fixed spin vector (rad/s) — spin decay over 0.4s is negligible.
 * handSign: +1 RHP, -1 LHP; the SSW surface was fit RHP-normalized and mirrors.
 */
export function accel(vel: V3, omega: V3, model: AeroModel, handSign = 1, seam: SeamMode = 0): V3 {
  const v = norm(vel);
  if (v === 0) return [0, 0, -G];
  const vhat = unit(vel);
  const w = norm(omega);

  // decompose spin into transverse + gyro relative to travel direction
  const wGyro = dot(omega, vhat);
  const wTvec = sub(omega, scale(vhat, wGyro));
  const wT = norm(wTvec);

  const S = (BALL_RADIUS * w) / v; // total spin factor (drag uses total spin)
  const ST = (BALL_RADIUS * wT) / v; // transverse spin factor (lift)

  const cd = model.cd.cd0 + model.cd.cdV * (v - 130) + model.cd.cdS * S;
  const aDrag = scale(vhat, -C0 * cd * v * v);

  let aLat: V3 = [0, 0, 0];
  if (wT > 1e-9) {
    const cl = (model.cl.scale ?? 1) * (ST / (model.cl.a + model.cl.b * ST));
    const magnusDir = unit(cross(wTvec, vhat));
    // SSW: rotate the lateral force about vhat, scale its magnitude
    const g = Math.abs(Math.asin(Math.max(-1, Math.min(1, wGyro / (w || 1)))));
    const t = handSign * Math.atan2(-magnusDir[0], magnusDir[2]); // tilt, RHP-normalized
    const { r0, rG, rT, s0 } = seam === 0 ? model.ssw.mode0 : model.ssw.mode1;
    const rot = handSign * (r0 + rG * Math.sin(g) + rT * Math.sin(t) * Math.cos(g));
    const mag = C0 * cl * v * v * (1 + s0 * Math.sin(g) * Math.sin(g));
    const dir = rotateAbout(magnusDir, vhat, rot);
    aLat = scale(dir, mag);
  }

  return add(add(aDrag, aLat), [0, 0, -G]);
}

/** Rodrigues rotation of vector p about unit axis k by angle a. */
export function rotateAbout(p: V3, k: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return add(add(scale(p, c), scale(cross(k, p), s)), scale(k, dot(k, p) * (1 - c)));
}
