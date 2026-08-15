import { MPH_TO_FPS, RUBBER_Y } from "./constants";
import type { AeroModel, SeamMode } from "./model";
import { simulate, type Trajectory } from "./integrate";
import { spinVector } from "./spin";
import { scale, sub, unit, type V3 } from "./vec";

/** Everything the sandbox sliders control. */
export interface PitchParams {
  veloMph: number; // release speed
  rpm: number;
  tiltDeg: number; // movement clock, degrees CW from 12:00 (pitcher's view)
  gyroDeg: number; // 0 = fully transverse, +/-90 = pure gyro
  seam: SeamMode; // 0 = four-seam grip, 1 = two-seam grip (drives the SSW term)
  releaseSide: number; // ft, +x = catcher's right (RHP typically negative)
  releaseHeight: number; // ft
  extension: number; // ft toward the plate from the rubber
  target: { x: number; z: number }; // aim point at the front of the plate
}

export interface PitchResult {
  traj: Trajectory;
  /** movement vs a spinless (gravity+drag only) twin, inches, at the plate */
  ivb: number;
  hb: number;
  plateLoc: { x: number; z: number } | null;
  plateVeloMph: number;
  flightTime: number;
}

export function releasePos(p: PitchParams): V3 {
  return [p.releaseSide, RUBBER_Y - p.extension, p.releaseHeight];
}

/**
 * Throw a pitch: solve the launch direction so the (full-physics) trajectory
 * crosses the plate at the target, then report movement vs the spinless twin.
 * Pass fixedDir to skip the solve and hold a frozen launch direction instead —
 * the tunneling comparison: same release, same aim, different arrival.
 */
export function throwPitch(p: PitchParams, model: AeroModel, fixedDir?: V3): PitchResult {
  const pos0 = releasePos(p);
  const speed = p.veloMph * MPH_TO_FPS;
  const handSign = p.releaseSide <= 0 ? 1 : -1; // release side stands in for handedness

  const dirFor = (aim: { x: number; z: number }): V3 =>
    unit(sub([aim.x, 0, aim.z], pos0));

  // secant-style shooting: adjust an aim proxy until plate crossing hits target
  let aim = { ...p.target };
  let traj!: Trajectory;
  let omega!: V3;
  for (let i = 0; i < 8; i++) {
    const vhat = fixedDir ?? dirFor(aim);
    omega = spinVector(p.rpm, p.tiltDeg, p.gyroDeg, vhat);
    traj = simulate(pos0, scale(vhat, speed), omega, model, handSign, p.seam);
    if (fixedDir || !traj.plate) break;
    const ex = traj.plate.pos[0] - p.target.x;
    const ez = traj.plate.pos[2] - p.target.z;
    if (Math.hypot(ex, ez) < 0.005) break; // < 1/16 inch
    aim = { x: aim.x - ex, z: aim.z - ez };
  }

  // spinless twin from the same release state (movement = induced break)
  const twin = simulate(pos0, traj.points[0]!.vel, [0, 0, 0], model, handSign);

  let ivb = 0;
  let hb = 0;
  let plateLoc: { x: number; z: number } | null = null;
  let plateVeloMph = 0;
  if (traj.plate && twin.plate) {
    ivb = (traj.plate.pos[2] - twin.plate.pos[2]) * 12;
    hb = (traj.plate.pos[0] - twin.plate.pos[0]) * 12;
    plateLoc = { x: traj.plate.pos[0], z: traj.plate.pos[2] };
    const v = traj.plate.vel;
    plateVeloMph = Math.hypot(v[0], v[1], v[2]) / MPH_TO_FPS;
  }
  return { traj, ivb, hb, plateLoc, plateVeloMph, flightTime: traj.flightTime };
}
