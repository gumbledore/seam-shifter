import { describe, expect, it } from "vitest";
import { PLATE_Y } from "../src/physics/constants";
import { simulate, type Trajectory } from "../src/physics/integrate";
import type { AeroModel, SeamMode } from "../src/physics/model";
import fitted from "../public/model/model.json";
import { spinVector } from "../src/physics/spin";
import { ninePFromRow, stateAt, timeAtY, type NineP } from "../src/physics/statcast";
import { sub, norm, unit } from "../src/physics/vec";
import fixturesRaw from "./fixtures/validation_pitches.json";

interface Fixture {
  pitch_type: string; hand: string; velo: number; rpm: number;
  tilt_spin: number; phi_obs: number; gyro: number; cd: number; seam: number;
  release: [number, number, number];
  nineP: { v0: [number, number, number]; a: [number, number, number] };
  plate: [number, number]; pfx: [number, number];
}
const fixtures = fixturesRaw as Fixture[];
const MODEL = fitted as AeroModel;
const NO_SSW: AeroModel["ssw"] = {
  mode0: { r0: 0, rG: 0, rT: 0, s0: 0 },
  mode1: { r0: 0, rG: 0, rT: 0, s0: 0 },
};

function nineP(f: Fixture): NineP {
  return ninePFromRow({
    vx0: f.nineP.v0[0], vy0: f.nineP.v0[1], vz0: f.nineP.v0[2],
    ax: f.nineP.a[0], ay: f.nineP.a[1], az: f.nineP.a[2],
    plate_x: f.plate[0], plate_z: f.plate[1],
  });
}

function run(f: Fixture, tiltDeg: number, model: AeroModel) {
  const k = nineP(f);
  const t0 = timeAtY(k, f.release[1]);
  const rel = stateAt(k, t0);
  const omega = spinVector(f.rpm, tiltDeg, f.gyro, unit(rel.vel));
  const handSign = f.hand === "R" ? 1 : -1;
  const seam = f.seam as SeamMode;
  return { k, t0, traj: simulate(rel.pos, rel.vel, omega, model, handSign, seam) };
}

function pathRmseIn(k: NineP, t0: number, traj: Trajectory): number {
  let sum = 0;
  let n = 0;
  for (const pt of traj.points) {
    if (pt.pos[1] < PLATE_Y) break;
    const d = norm(sub(pt.pos, stateAt(k, t0 + pt.t).pos));
    sum += d * d;
    n++;
  }
  return Math.sqrt(sum / n) * 12;
}

describe("tier 1: force model structure represents real flights", () => {
  // Per pitch, allow small per-pitch drag/lift magnitudes (environment — air
  // density, ball batch — and Cl-inversion noise are unobservable), keep the
  // model's *structure*: drag ∝ Cd(v,S)v², lift ⊥ v from the spin vector,
  // observed movement direction. A real flight must then be reproducible
  // within 1 inch RMSE over the whole path vs Statcast's 9P kinematics.
  it("path RMSE <= 1 inch: median and >= 90% of pitches", () => {
    const rmses: number[] = [];
    for (const f of fixtures) {
      const make = (cdScale: number, clScale: number): AeroModel => ({
        cd: { cd0: f.cd * cdScale, cdV: 0, cdS: 0 },
        cl: { ...MODEL.cl, scale: clScale },
        ssw: NO_SSW,
      });
      // coordinate-descent secant refinement of the two magnitudes
      let cdS = 1;
      let clS = 1;
      let best = Number.POSITIVE_INFINITY;
      for (let iter = 0; iter < 3; iter++) {
        for (const [dc, dl] of [[0.02, 0], [0, 0.05]] as const) {
          const e0 = (() => { const { k, t0, traj } = run(f, f.phi_obs, make(cdS, clS)); return pathRmseIn(k, t0, traj); })();
          const e1 = (() => { const { k, t0, traj } = run(f, f.phi_obs, make(cdS + dc, clS + dl)); return pathRmseIn(k, t0, traj); })();
          // parabolic-free secant step toward the minimum of |error(scale)|
          const grad = (e1 - e0) / (dc + dl);
          if (Math.abs(grad) > 1e-6) {
            const step = -e0 / grad;
            const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
            if (dc > 0) cdS = clamp(cdS + Math.max(-0.1, Math.min(0.1, step)), 0.8, 1.2);
            else clS = clamp(clS + Math.max(-0.1, Math.min(0.1, step)), 0.8, 1.2);
          }
          best = Math.min(best, e0, e1);
        }
      }
      const { k, t0, traj } = run(f, f.phi_obs, make(cdS, clS));
      best = Math.min(best, pathRmseIn(k, t0, traj));
      rmses.push(best);
    }
    rmses.sort((a, b) => a - b);
    const median = rmses[Math.floor(rmses.length / 2)]!;
    const p90 = rmses[Math.floor(0.9 * rmses.length)]!;
    const frac1in = rmses.filter((r) => r <= 1).length / rmses.length;
    // eslint-disable-next-line no-console
    console.log(`tier1: median RMSE ${median.toFixed(2)} in, p90 ${p90.toFixed(2)} in, <=1in: ${(frac1in * 100).toFixed(1)}%`);
    expect(median).toBeLessThanOrEqual(1.0);
    expect(frac1in).toBeGreaterThanOrEqual(0.9);
  });
});

describe("tier 2: predictive skill from spin axis + seam mode + SSW model", () => {
  // Given only what a sandbox player controls (velo, rpm, spin axis, gyro,
  // seam mode) plus the league-fitted model, how close is the predicted plate
  // crossing to the real pitch? Bars set from fit-time performance to catch
  // regressions; absolute scale is limited by unobservables (air density,
  // exact seam orientation).
  it("median plate miss and p90 within regression bars", () => {
    const errs: number[] = [];
    for (const f of fixtures) {
      const { traj } = run(f, f.tilt_spin, MODEL);
      if (!traj.plate) continue;
      errs.push(Math.hypot(traj.plate.pos[0] - f.plate[0], traj.plate.pos[2] - f.plate[1]) * 12);
    }
    errs.sort((a, b) => a - b);
    const median = errs[Math.floor(errs.length / 2)]!;
    const p90 = errs[Math.floor(0.9 * errs.length)]!;
    // eslint-disable-next-line no-console
    console.log(`tier2: n=${errs.length}, median plate miss ${median.toFixed(2)} in, p90 ${p90.toFixed(2)} in`);
    expect(errs.length).toBeGreaterThan(200);
    expect(median).toBeLessThanOrEqual(3.0);
    expect(p90).toBeLessThanOrEqual(6.5);
  });

  it("seam-mode SSW correction improves prediction vs pure Magnus", () => {
    const noSSW: AeroModel = { ...MODEL, ssw: NO_SSW };
    let withSum = 0;
    let withoutSum = 0;
    for (const f of fixtures) {
      const a = run(f, f.tilt_spin, MODEL).traj.plate;
      const b = run(f, f.tilt_spin, noSSW).traj.plate;
      if (!a || !b) continue;
      withSum += Math.hypot(a.pos[0] - f.plate[0], a.pos[2] - f.plate[1]);
      withoutSum += Math.hypot(b.pos[0] - f.plate[0], b.pos[2] - f.plate[1]);
    }
    // eslint-disable-next-line no-console
    console.log(`tier2: mean miss with SSW ${((withSum / fixtures.length) * 12).toFixed(2)} in vs without ${((withoutSum / fixtures.length) * 12).toFixed(2)} in`);
    expect(withSum).toBeLessThan(withoutSum);
  });
});
