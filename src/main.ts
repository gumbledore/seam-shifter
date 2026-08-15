import * as THREE from "three";
import type { Trajectory } from "./physics/integrate";
import type { AeroModel } from "./physics/model";
import { throwPitch, type PitchResult } from "./physics/pitch";
import { spinVector } from "./physics/spin";
import { unit, type V3 } from "./physics/vec";
import { Ball } from "./render/ball";
import { buildScene, buildZone, toScene } from "./render/scene";
import { setTrailResolution, Trail } from "./render/trails";
import { Views, type ViewName } from "./render/views";
import {
  describeReveal, loadPitcher, loadRoster, scorePitch, targetTrajectory,
  type PitcherData, type RealPitch,
} from "./ui/challenge";
import { ControlPanel, Readouts } from "./ui/controls";

const DT = 0.002;

function sample(traj: Trajectory, t: number): V3 {
  const tt = Math.min(t, (traj.points.length - 1) * DT);
  const i = Math.min(Math.floor(tt / DT), traj.points.length - 2);
  const f = tt / DT - i;
  const a = traj.points[i]!.pos;
  const b = traj.points[i + 1]!.pos;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

async function boot(): Promise<void> {
  const model = (await (await fetch("model/model.json")).json()) as AeroModel;

  // --- three.js setup
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = buildScene();
  buildZone(scene);
  const views = new Views(canvas);

  const liveBall = new Ball();
  scene.add(liveBall.group);
  const targetBall = new Ball();
  (targetBall.group.children[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({
    color: 0xe0b34f, roughness: 0.55,
  });
  targetBall.setVisible(false);
  scene.add(targetBall.group);

  const stage = document.getElementById("stage")!;
  const resize = (): void => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    views.resize(w, h);
    setTrailResolution(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // --- state
  let live: { traj: Trajectory; result: PitchResult } | null = null;
  let heldDir: V3 | null = null;
  let liveTrail: Trail | null = null;
  let target: { pitch: RealPitch; traj: Trajectory } | null = null;
  let targetTrail: Trail | null = null;
  const ghosts: Trail[] = [];
  let mode: "sandbox" | "challenge" = "sandbox";
  let pitcher: PitcherData | null = null;

  // --- playback
  let clockT = 0;
  let playing = true;
  let speed = 0.25;
  const scrub = document.getElementById("scrub") as HTMLInputElement;
  const duration = (): number =>
    Math.max(live?.traj.flightTime ?? 0.45, target?.traj.flightTime ?? 0) + 0.3;

  // --- throwing
  const readouts = new Readouts(document.getElementById("readouts")!);
  const challengeBox = document.getElementById("challenge-box")!;
  let scoreEl: HTMLElement | null = null;

  const reThrow = (): void => {
    const p = panel.params();
    const result = throwPitch(p, model, panel.aimMode === "hold" && heldDir ? heldDir : undefined);
    live = { traj: result.traj, result };
    liveTrail?.dispose(scene);
    liveTrail = new Trail(result.traj, "live");
    scene.add(liveTrail.line);
    const vhat = unit(result.traj.points[0]!.vel);
    liveBall.setSpin(spinVector(p.rpm, p.tiltDeg, p.gyroDeg, vhat));
    readouts.update(result, p);
    if (mode === "challenge" && target && scoreEl) {
      const s = scorePitch(result, p.veloMph, target.pitch);
      scoreEl.innerHTML =
        `<div class="score">${s.total}</div>` +
        `<div class="detail">movement &Delta; ${s.dMov.toFixed(1)} in &middot; ` +
        `location &Delta; ${s.dPlate.toFixed(1)} in &middot; velo &Delta; ${s.dVelo.toFixed(1)} mph</div>`;
    }
    clockT = 0;
    playing = true;
  };
  const panel = new ControlPanel(document.getElementById("controls")!, reThrow);
  panel.onAimModeChange = (mode) => {
    // freeze the current launch direction the moment "hold" is engaged
    heldDir = mode === "hold" && live ? unit(live.traj.points[0]!.vel) : null;
  };

  // --- ghosts
  document.getElementById("btn-pin")!.addEventListener("click", () => {
    if (!live) return;
    const g = new Trail(live.traj, "ghost");
    g.revealAll();
    scene.add(g.line);
    ghosts.push(g);
  });
  document.getElementById("btn-clear-ghosts")!.addEventListener("click", () => {
    for (const g of ghosts) g.dispose(scene);
    ghosts.length = 0;
  });

  // --- views
  document.querySelectorAll<HTMLButtonElement>("#view-bar button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#view-bar button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      views.set(b.dataset.view as ViewName);
    });
  });

  // --- playback controls
  (document.getElementById("speed") as HTMLSelectElement).addEventListener("change", (e) => {
    speed = Number((e.target as HTMLSelectElement).value);
  });
  document.getElementById("btn-replay")!.addEventListener("click", () => {
    clockT = 0;
    playing = true;
  });
  scrub.addEventListener("input", () => {
    playing = false;
    clockT = (Number(scrub.value) / 1000) * duration();
  });

  // --- challenge mode
  const setupChallenge = async (): Promise<void> => {
    const roster = await loadRoster();
    challengeBox.innerHTML = "";
    const select = document.createElement("select");
    for (const r of roster) {
      const o = document.createElement("option");
      o.value = r.id;
      o.textContent = `${r.player} (${r.hand}HP)`;
      select.append(o);
    }
    const newBtn = document.createElement("button");
    newBtn.textContent = "New pitch";
    const hint = document.createElement("div");
    hint.className = "hint";
    scoreEl = document.createElement("div");
    const revealBtn = document.createElement("button");
    revealBtn.textContent = "Reveal";
    const revealEl = document.createElement("div");
    revealEl.className = "detail";
    challengeBox.append(select, newBtn, hint, scoreEl, revealBtn, revealEl);

    const newPitch = async (): Promise<void> => {
      if (!pitcher || pitcher.id !== select.value) pitcher = await loadPitcher(select.value);
      const pitch = pitcher.pitches[Math.floor(Math.random() * pitcher.pitches.length)]!;
      const { traj } = targetTrajectory(pitch);
      target = { pitch, traj };
      targetTrail?.dispose(scene);
      targetTrail = new Trail(traj, "target");
      scene.add(targetTrail.line);
      targetBall.setVisible(true);
      const vhat = unit(traj.points[0]!.vel);
      const tilt = ((pitch.axis - 180 + 540) % 360) - 180;
      targetBall.setSpin(spinVector(pitch.rpm, tilt, 0, vhat));
      hint.textContent = `Mystery pitch: ${pitch.velo} mph. Match its flight.`;
      revealEl.textContent = "";
      clockT = 0;
      playing = true;
      reThrow();
    };
    newBtn.addEventListener("click", newPitch);
    select.addEventListener("change", newPitch);
    revealBtn.addEventListener("click", () => {
      if (target && pitcher) revealEl.textContent = describeReveal(target.pitch, pitcher.hand);
    });
    await newPitch();
  };

  const tabS = document.getElementById("tab-sandbox")!;
  const tabC = document.getElementById("tab-challenge")!;
  tabC.addEventListener("click", async () => {
    mode = "challenge";
    tabC.classList.add("active");
    tabS.classList.remove("active");
    challengeBox.classList.remove("hidden");
    if (!target) await setupChallenge();
  });
  tabS.addEventListener("click", () => {
    mode = "sandbox";
    tabS.classList.add("active");
    tabC.classList.remove("active");
    challengeBox.classList.add("hidden");
    targetTrail?.dispose(scene);
    targetTrail = null;
    target = null;
    targetBall.setVisible(false);
  });

  // --- render loop
  const wall = new THREE.Clock();
  const tick = (): void => {
    requestAnimationFrame(tick);
    const dt = Math.min(wall.getDelta(), 0.1) * speed;
    if (playing) {
      clockT += dt;
      if (clockT > duration()) clockT = 0;
      scrub.value = String(Math.round((clockT / duration()) * 1000));
    }
    if (live) {
      const ft = live.traj.flightTime;
      liveBall.setPosition(toScene(sample(live.traj, Math.min(clockT, ft))));
      liveBall.spin(playing ? dt : 0);
      liveTrail?.reveal(clockT / ft);
    }
    if (target) {
      const ft = target.traj.flightTime;
      targetBall.setPosition(toScene(sample(target.traj, Math.min(clockT, ft))));
      targetBall.spin(playing ? dt : 0);
      targetTrail?.reveal(clockT / ft);
    }
    views.update();
    renderer.render(scene, views.camera);
  };

  reThrow();
  tick();
}

void boot();
