import { PLATE_Y } from "./constants";
import type { AeroModel, SeamMode } from "./model";
import { accel } from "./forces";
import { add, scale, sub, type V3 } from "./vec";

export interface TrajPoint {
  t: number;
  pos: V3;
  vel: V3;
}

export interface Trajectory {
  points: TrajPoint[]; // dense samples, dt apart, release -> past the plate
  /** state interpolated exactly at the plate-crossing plane y = PLATE_Y */
  plate: TrajPoint | null;
  flightTime: number; // release -> plate, s
}

const DT = 0.002; // s; RK4 at 2 ms is far below measurement noise

/** Integrate a pitch with RK4 from release until it crosses the plate plane (or hits ground). */
export function simulate(pos0: V3, vel0: V3, omega: V3, model: AeroModel, handSign = 1, seam: SeamMode = 0): Trajectory {
  let pos = pos0;
  let vel = vel0;
  let t = 0;
  const points: TrajPoint[] = [{ t, pos, vel }];
  let plate: TrajPoint | null = null;

  const f = (v: V3): V3 => accel(v, omega, model, handSign, seam);

  for (let i = 0; i < 1000; i++) {
    const prev: TrajPoint = { t, pos, vel };
    // RK4 on (pos, vel); accel depends only on vel (and fixed omega)
    const a1 = f(vel);
    const v2 = add(vel, scale(a1, DT / 2));
    const a2 = f(v2);
    const v3_ = add(vel, scale(a2, DT / 2));
    const a3 = f(v3_);
    const v4 = add(vel, scale(a3, DT));
    const a4 = f(v4);

    const dpos = scale(
      add(add(vel, scale(add(v2, v3_), 2)), v4),
      DT / 6,
    );
    const dvel = scale(add(add(a1, scale(add(a2, a3), 2)), a4), DT / 6);

    pos = add(pos, dpos);
    vel = add(vel, dvel);
    t += DT;
    points.push({ t, pos, vel });

    if (plate === null && pos[1] <= PLATE_Y) {
      // linear interp within the step to the plate plane
      const f01 = (prev.pos[1] - PLATE_Y) / (prev.pos[1] - pos[1]);
      plate = {
        t: prev.t + f01 * DT,
        pos: add(prev.pos, scale(sub(pos, prev.pos), f01)),
        vel: add(prev.vel, scale(sub(vel, prev.vel), f01)),
      };
    }
    // stop past the catcher, or in the dirt once the plate plane is recorded
    // (a bounced pitch still has plate coordinates, like Statcast reports)
    if (pos[1] < -2 || (plate !== null && pos[2] < 0)) break;
  }

  return { points, plate, flightTime: plate?.t ?? t };
}
