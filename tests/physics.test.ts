import { describe, expect, it } from "vitest";
import { G, MPH_TO_FPS, PLATE_Y } from "../src/physics/constants";
import { accel } from "../src/physics/forces";
import { simulate } from "../src/physics/integrate";
import { DEFAULT_MODEL, type AeroModel } from "../src/physics/model";
import { throwPitch, type PitchParams } from "../src/physics/pitch";
import { spinAxisToTilt, spinVector, tiltToClock, tiltToSpinAxis } from "../src/physics/spin";
import { ninePFromRow, stateAt, timeAtY } from "../src/physics/statcast";

const NO_SSW = { r0: 0, rG: 0, rT: 0, s0: 0 };
const VACUUM: AeroModel = { cd: { cd0: 0, cdV: 0, cdS: 0 }, cl: { a: 1, b: 0 }, ssw: { mode0: NO_SSW, mode1: NO_SSW } };

describe("spin conventions", () => {
  it("tilt <-> spin_axis round trip", () => {
    expect(tiltToSpinAxis(0)).toBe(180);
    expect(tiltToSpinAxis(30)).toBe(210);
    expect(spinAxisToTilt(210)).toBe(30);
    expect(spinAxisToTilt(150)).toBe(-30);
  });
  it("tilt clock formatting", () => {
    expect(tiltToClock(0)).toBe("12:00");
    expect(tiltToClock(37.5)).toBe("1:15");
    expect(tiltToClock(-30)).toBe("11:00");
  });
  it("pure backspin (12:00) produces upward Magnus", () => {
    const vhat: [number, number, number] = [0, -1, 0];
    const omega = spinVector(2400, 0, 0, vhat);
    const a = accel([0, -130, 0], omega, DEFAULT_MODEL);
    expect(a[2]).toBeGreaterThan(-G); // fights gravity
    expect(Math.abs(a[0])).toBeLessThan(1e-9); // no sideways
  });
  it("gyro spin produces no Magnus", () => {
    const vhat: [number, number, number] = [0, -1, 0];
    const omega = spinVector(2400, 0, 90, vhat);
    const a = accel([0, -130, 0], omega, DEFAULT_MODEL);
    expect(a[2] + G).toBeCloseTo(0, 6);
    expect(a[0]).toBeCloseTo(0, 6);
  });
});

describe("integrator", () => {
  it("matches the closed-form parabola in vacuum", () => {
    const v0: [number, number, number] = [2, -120, -5];
    const p0: [number, number, number] = [-1, 55, 6];
    const traj = simulate(p0, v0, [0, 0, 0], VACUUM);
    for (const pt of traj.points) {
      expect(pt.pos[0]).toBeCloseTo(p0[0] + v0[0] * pt.t, 8);
      expect(pt.pos[2]).toBeCloseTo(p0[2] + v0[2] * pt.t - 0.5 * G * pt.t * pt.t, 6);
    }
    expect(traj.plate).not.toBeNull();
    expect(traj.plate!.pos[1]).toBeCloseTo(PLATE_Y, 4);
  });
});

describe("aim solver", () => {
  it("hits the requested target through full physics", () => {
    const p: PitchParams = {
      veloMph: 95, rpm: 2400, tiltDeg: 20, gyroDeg: 10, seam: 0,
      releaseSide: -1.8, releaseHeight: 5.9, extension: 6.5,
      target: { x: 0.3, z: 2.2 },
    };
    const r = throwPitch(p, DEFAULT_MODEL);
    expect(r.plateLoc).not.toBeNull();
    expect(r.plateLoc!.x).toBeCloseTo(0.3, 2);
    expect(r.plateLoc!.z).toBeCloseTo(2.2, 2);
    expect(r.flightTime).toBeGreaterThan(0.35);
    expect(r.flightTime).toBeLessThan(0.55);
  });
  it("a 95mph ride fastball has plausible IVB and plate velo", () => {
    const p: PitchParams = {
      veloMph: 95, rpm: 2400, tiltDeg: 10, gyroDeg: 5, seam: 0,
      releaseSide: -1.5, releaseHeight: 5.8, extension: 6.5,
      target: { x: 0, z: 2.5 },
    };
    const r = throwPitch(p, DEFAULT_MODEL);
    expect(r.ivb).toBeGreaterThan(10);
    expect(r.ivb).toBeLessThan(24);
    expect(r.plateVeloMph).toBeGreaterThan(84);
    expect(r.plateVeloMph).toBeLessThan(92);
  });
});

describe("statcast 9P", () => {
  // a realistic RHP four-seamer's 9P-ish numbers
  const row = {
    vx0: 6.0, vy0: -135.0, vz0: -5.5,
    ax: -8.0, ay: 28.0, az: -14.0,
    plate_x: 0.25, plate_z: 2.8,
  };
  it("reconstructed 9P reproduces the plate crossing", () => {
    const k = ninePFromRow(row);
    const tp = timeAtY(k, PLATE_Y);
    const s = stateAt(k, tp);
    expect(s.pos[0]).toBeCloseTo(row.plate_x, 6);
    expect(s.pos[2]).toBeCloseTo(row.plate_z, 6);
  });
  it("release plane lookup gives negative time", () => {
    const k = ninePFromRow(row);
    expect(timeAtY(k, 54)).toBeLessThan(0);
  });
});
