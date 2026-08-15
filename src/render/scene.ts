import * as THREE from "three";
import type { V3 } from "../physics/vec";

/** Statcast (x right, y toward pitcher, z up) -> three.js (x, y up, z toward camera). */
export const toScene = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[2], -p[1]);

export function buildScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141a);
  scene.fog = new THREE.Fog(0x10141a, 90, 220);

  scene.add(new THREE.HemisphereLight(0xbfd4e6, 0x2a2420, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2df, 1.6);
  sun.position.set(40, 80, 20);
  scene.add(sun);

  // grass
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(160, 48),
    new THREE.MeshLambertMaterial({ color: 0x2c5e34 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.02;
  scene.add(grass);

  // infield dirt around the plate and the mound
  const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const plateDirt = new THREE.Mesh(new THREE.CircleGeometry(13, 40), dirtMat);
  plateDirt.rotation.x = -Math.PI / 2;
  plateDirt.position.set(0, -0.01, 0);
  scene.add(plateDirt);

  const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 9, 10 / 12, 40), dirtMat);
  mound.position.set(0, 5 / 12, -59);
  scene.add(mound);

  // pitching rubber
  const rubber = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.05, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xdddddd }),
  );
  rubber.position.set(0, 10 / 12 + 0.03, -60.5);
  scene.add(rubber);

  // home plate (pentagon, 17 in wide, point toward catcher)
  const w = 17 / 12 / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w, 0.7);
  shape.lineTo(w, 0.7);
  shape.lineTo(w, 0.2);
  shape.lineTo(0, -0.15);
  shape.lineTo(-w, 0.2);
  shape.closePath();
  const plate = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, 0.005, -1.0);
  scene.add(plate);

  return scene;
}

/** Strike-zone wireframe at the front of the plate; height adjustable per batter. */
export function buildZone(scene: THREE.Scene, szBot = 1.55, szTop = 3.45): THREE.LineSegments {
  const w = 17 / 12 / 2;
  const g = new THREE.BufferGeometry();
  const y0 = szBot;
  const y1 = szTop;
  const zPlane = -17 / 12;
  const thirds: number[] = [];
  for (let i = 0; i <= 3; i++) {
    const x = -w + (i * 2 * w) / 3;
    thirds.push(x, y0, zPlane, x, y1, zPlane);
    const y = y0 + (i * (y1 - y0)) / 3;
    thirds.push(-w, y, zPlane, w, y, zPlane);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(thirds, 3));
  const zone = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color: 0xaab6c2, transparent: true, opacity: 0.75 }),
  );
  scene.add(zone);
  return zone;
}
