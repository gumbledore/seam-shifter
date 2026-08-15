import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Trajectory } from "../physics/integrate";
import { toScene } from "./scene";

export type TrailKind = "live" | "ghost" | "target";

const STYLE: Record<TrailKind, { color: number; width: number; opacity: number }> = {
  live: { color: 0xe8543f, width: 3.5, opacity: 0.95 },
  ghost: { color: 0x4fa3e0, width: 2.5, opacity: 0.7 },
  target: { color: 0xe0b34f, width: 3.5, opacity: 0.85 },
};

// LineMaterial needs the drawing-buffer resolution; keep one shared vector.
const resolution = new THREE.Vector2(1, 1);
export function setTrailResolution(w: number, h: number): void {
  resolution.set(w, h);
}

/** A rendered flight path; `reveal(f)` draws the first fraction f of it. */
export class Trail {
  readonly line: Line2;
  private readonly total: number;

  constructor(traj: Trajectory, kind: TrailKind) {
    const pts: number[] = [];
    for (const p of traj.points) {
      if (p.pos[1] < -0.5) break;
      const v = toScene(p.pos);
      pts.push(v.x, v.y, v.z);
    }
    this.total = pts.length / 3;
    const geo = new LineGeometry();
    geo.setPositions(pts);
    const s = STYLE[kind];
    const mat = new LineMaterial({
      color: s.color,
      linewidth: s.width,
      transparent: true,
      opacity: s.opacity,
      worldUnits: false,
    });
    mat.resolution = resolution;
    this.line = new Line2(geo, mat);
    this.reveal(0);
  }

  reveal(frac: number): void {
    const n = Math.floor(this.total * Math.min(1, Math.max(0, frac)));
    // instanced line segments: one instance per segment
    this.line.geometry.instanceCount = Math.max(0, n - 1);
  }

  revealAll(): void {
    this.reveal(1);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}
