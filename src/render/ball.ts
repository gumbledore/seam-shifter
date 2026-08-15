import * as THREE from "three";
import { BALL_RADIUS } from "../physics/constants";
import type { V3 } from "../physics/vec";

/**
 * Baseball with real seam geometry (tennis-ball curve on the sphere), spun in
 * real time by the actual spin vector so slow-mo shows the axis you dialed in.
 */
export class Ball {
  readonly group = new THREE.Group();
  private omega = new THREE.Vector3(); // scene-frame spin vector, rad/s

  constructor(scale = 1) {
    const r = BALL_RADIUS * scale;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(r, 40, 28),
      new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.55 }),
    );
    this.group.add(sphere);

    // seam: z = k*sin(2t) style closed curve on the sphere
    const k = 0.62;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 240; i++) {
      const t = (i / 240) * Math.PI * 2;
      const z = k * Math.sin(2 * t);
      const c = Math.sqrt(Math.max(0, 1 - z * z));
      pts.push(new THREE.Vector3(c * Math.cos(t) * r, c * Math.sin(t) * r, z * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const seam = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 360, r * 0.045, 6, true),
      new THREE.MeshStandardMaterial({ color: 0xb0332a, roughness: 0.7 }),
    );
    this.group.add(seam);
  }

  /** Set the spin vector in Statcast coords (rad/s). */
  setSpin(omegaStatcast: V3): void {
    this.omega.set(omegaStatcast[0], omegaStatcast[2], -omegaStatcast[1]);
  }

  /** Advance the seam rotation by dt seconds (already slow-mo scaled). */
  spin(dt: number): void {
    const w = this.omega.length();
    if (w < 1e-6) return;
    const q = new THREE.Quaternion().setFromAxisAngle(
      this.omega.clone().normalize(),
      w * dt,
    );
    this.group.quaternion.premultiply(q);
  }

  setPosition(v: THREE.Vector3): void {
    this.group.position.copy(v);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }
}
