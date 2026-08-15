import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type ViewName = "catcher" | "pitcher" | "side" | "top";

interface Preset {
  pos: [number, number, number];
  target: [number, number, number];
}

/** Scene-frame presets (x right, y up, z toward catcher; plate at origin). */
const PRESETS: Record<ViewName, Preset> = {
  catcher: { pos: [0, 2.7, 5.8], target: [0, 3.0, -25] },
  pitcher: { pos: [0, 6.2, -66], target: [0, 2.6, 0] },
  side: { pos: [42, 3.0, -30.5], target: [0, 5.4, -30] },
  top: { pos: [0, 62, -30.5], target: [0, 0, -30] },
};

export class Views {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  constructor(canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 500);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.set("catcher");
  }

  set(name: ViewName): void {
    const p = PRESETS[name];
    this.camera.position.set(...p.pos);
    this.controls.target.set(...p.target);
    this.controls.update();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(): void {
    this.controls.update();
  }
}
