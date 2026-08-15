import type { Trajectory, TrajPoint } from "../physics/integrate";
import type { PitchResult } from "../physics/pitch";
import { ninePFromRow, stateAt, timeAtY, type NineP } from "../physics/statcast";
import { spinAxisToTilt, tiltToClock } from "../physics/spin";

/** Compact pitch record exported by pipeline/export_challenge.py. */
export interface RealPitch {
  pt: string;
  ptName: string;
  date: string;
  velo: number;
  rpm: number;
  axis: number;
  rel: [number, number, number];
  ext: number;
  v0: [number, number, number];
  a: [number, number, number];
  plate: [number, number];
  pfx: [number, number]; // inches
  sz: [number, number];
}

export interface PitcherData {
  id: string;
  player: string;
  hand: string;
  arsenal: { pitch_type: string; n: number; velo: number; rpm: number }[];
  pitches: RealPitch[];
}

export interface RosterEntry {
  id: string;
  player: string;
  hand: string;
  n: number;
}

/** Rebuild the exact tracked flight from the pitch's 9P kinematics. */
export function targetTrajectory(p: RealPitch): { traj: Trajectory; nineP: NineP } {
  const k = ninePFromRow({
    vx0: p.v0[0], vy0: p.v0[1], vz0: p.v0[2],
    ax: p.a[0], ay: p.a[1], az: p.a[2],
    plate_x: p.plate[0], plate_z: p.plate[1],
  });
  const t0 = timeAtY(k, p.rel[1]);
  const tPlate = timeAtY(k, 17 / 12);
  const points: TrajPoint[] = [];
  for (let t = t0; t <= tPlate + 0.02; t += 0.002) {
    const s = stateAt(k, t);
    points.push({ t: t - t0, pos: s.pos, vel: s.vel });
  }
  const plateState = stateAt(k, tPlate);
  return {
    traj: {
      points,
      plate: { t: tPlate - t0, pos: plateState.pos, vel: plateState.vel },
      flightTime: tPlate - t0,
    },
    nineP: k,
  };
}

export interface Score {
  total: number;
  dMov: number; // inches
  dPlate: number; // inches
  dVelo: number; // mph
}

/**
 * Composite match score. Movement + plate location + velocity — parameters
 * that produce the same flight count as a match (degenerate axis/gyro combos
 * are physically equivalent, so we score the flight, not the sliders).
 */
export function scorePitch(result: PitchResult, veloMph: number, target: RealPitch): Score {
  const dMov = Math.hypot(result.hb - target.pfx[0], result.ivb - target.pfx[1]);
  const dPlate = result.plateLoc
    ? Math.hypot(result.plateLoc.x - target.plate[0], result.plateLoc.z - target.plate[1]) * 12
    : 60;
  const dVelo = Math.abs(veloMph - target.velo);
  const z = (dMov / 6) ** 2 + (dPlate / 10) ** 2 + (dVelo / 3) ** 2;
  return { total: Math.round(100 * Math.exp(-0.5 * z)), dMov, dPlate, dVelo };
}

export function describeReveal(p: RealPitch, hand: string): string {
  const tilt = spinAxisToTilt(p.axis);
  return `${p.ptName} — ${p.velo} mph, ${p.rpm} rpm, tilt ${tiltToClock(tilt)}, ${hand}HP, ${p.date}`;
}

export async function loadRoster(): Promise<RosterEntry[]> {
  const r = await fetch("data/roster.json");
  return r.json();
}

export async function loadPitcher(id: string): Promise<PitcherData> {
  const r = await fetch(`data/pitchers/${id}.json`);
  return r.json();
}
