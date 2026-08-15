import type { PitchParams } from "../physics/pitch";
import type { PitchResult } from "../physics/pitch";
import type { SeamMode } from "../physics/model";
import { tiltToClock } from "../physics/spin";

interface SliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  fmt?: (v: number) => string;
}

const SLIDERS: SliderDef[] = [
  { key: "veloMph", label: "Velocity (mph)", min: 65, max: 105, step: 0.5, value: 95 },
  { key: "rpm", label: "Spin rate (rpm)", min: 300, max: 3400, step: 25, value: 2300 },
  { key: "tiltDeg", label: "Spin direction", min: -180, max: 180, step: 2.5, value: 15, fmt: (v) => tiltToClock(v) },
  { key: "gyroDeg", label: "Gyro angle (deg)", min: -90, max: 90, step: 2.5, value: 5 },
  { key: "releaseSide", label: "Release side (ft)", min: -3.5, max: 3.5, step: 0.05, value: -1.8 },
  { key: "releaseHeight", label: "Release height (ft)", min: 4.2, max: 7.2, step: 0.05, value: 5.9 },
  { key: "extension", label: "Extension (ft)", min: 5, max: 7.5, step: 0.1, value: 6.4 },
  { key: "targetX", label: "Target side (ft)", min: -1.6, max: 1.6, step: 0.05, value: 0 },
  { key: "targetZ", label: "Target height (ft)", min: 0.8, max: 4.2, step: 0.05, value: 2.4 },
];

/** Builds the sandbox sliders + seam toggle; calls onChange with fresh params. */
export class ControlPanel {
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly labels = new Map<string, HTMLElement>();
  private seam: SeamMode = 0;
  private readonly seamButtons: HTMLButtonElement[] = [];

  constructor(root: HTMLElement, private readonly onChange: () => void) {
    for (const def of SLIDERS) {
      const wrap = document.createElement("div");
      wrap.className = "ctl";
      const label = document.createElement("label");
      const name = document.createElement("span");
      name.textContent = def.label;
      const val = document.createElement("b");
      label.append(name, val);
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(def.value);
      input.addEventListener("input", () => {
        this.refreshLabel(def);
        this.onChange();
      });
      wrap.append(label, input);
      root.append(wrap);
      this.inputs.set(def.key, input);
      this.labels.set(def.key, val);
      this.refreshLabel(def);
    }

    // seam mode toggle
    const seg = document.createElement("div");
    seg.className = "seg";
    (["4-seam", "2-seam"] as const).forEach((txt, i) => {
      const b = document.createElement("button");
      b.textContent = txt;
      if (i === this.seam) b.classList.add("active");
      b.addEventListener("click", () => {
        this.seam = i as SeamMode;
        this.seamButtons.forEach((x, j) => x.classList.toggle("active", j === i));
        this.onChange();
      });
      this.seamButtons.push(b);
      seg.append(b);
    });
    root.append(seg);

    // aim mode: solve to target vs hold the current launch direction (tunnel)
    const aimSeg = document.createElement("div");
    aimSeg.className = "seg";
    (["Aim: target", "Aim: hold"] as const).forEach((txt, i) => {
      const b = document.createElement("button");
      b.textContent = txt;
      if (i === 0) b.classList.add("active");
      b.addEventListener("click", () => {
        this.aimMode = i === 0 ? "target" : "hold";
        this.aimButtons.forEach((x, j) => x.classList.toggle("active", j === i));
        this.onAimModeChange?.(this.aimMode);
        this.onChange();
      });
      this.aimButtons.push(b);
      aimSeg.append(b);
    });
    root.append(aimSeg);
  }

  aimMode: "target" | "hold" = "target";
  onAimModeChange?: (mode: "target" | "hold") => void;
  private readonly aimButtons: HTMLButtonElement[] = [];

  private refreshLabel(def: SliderDef): void {
    const v = Number(this.inputs.get(def.key)!.value);
    this.labels.get(def.key)!.textContent = def.fmt ? `${def.fmt(v)}` : `${v}`;
  }

  private num(key: string): number {
    return Number(this.inputs.get(key)!.value);
  }

  params(): PitchParams {
    return {
      veloMph: this.num("veloMph"),
      rpm: this.num("rpm"),
      tiltDeg: this.num("tiltDeg"),
      gyroDeg: this.num("gyroDeg"),
      seam: this.seam,
      releaseSide: this.num("releaseSide"),
      releaseHeight: this.num("releaseHeight"),
      extension: this.num("extension"),
      target: { x: this.num("targetX"), z: this.num("targetZ") },
    };
  }
}

/** Live numeric readouts under the sliders. */
export class Readouts {
  private readonly cells = new Map<string, HTMLElement>();

  constructor(root: HTMLElement) {
    const items: [string, string][] = [
      ["ivb", "IVB"],
      ["hb", "HB"],
      ["pvelo", "@plate"],
      ["time", "flight"],
      ["eff", "efficiency"],
      ["clock", "tilt"],
      ["loc", "location"],
    ];
    for (const [key, label] of items) {
      const div = document.createElement("div");
      div.className = "ro";
      const s = document.createElement("span");
      s.textContent = label;
      const b = document.createElement("b");
      b.textContent = "–";
      div.append(s, b);
      root.append(div);
      this.cells.set(key, b);
    }
  }

  update(r: PitchResult, p: PitchParams): void {
    const set = (k: string, v: string) => (this.cells.get(k)!.textContent = v);
    set("ivb", `${r.ivb >= 0 ? "+" : ""}${r.ivb.toFixed(1)} in`);
    set("hb", `${r.hb >= 0 ? "+" : ""}${r.hb.toFixed(1)} in`);
    set("pvelo", `${r.plateVeloMph.toFixed(1)} mph`);
    set("time", `${(r.flightTime * 1000).toFixed(0)} ms`);
    set("eff", `${(Math.cos((p.gyroDeg * Math.PI) / 180) * 100).toFixed(0)}%`);
    set("clock", tiltToClock(p.tiltDeg));
    set("loc", r.plateLoc ? `${r.plateLoc.x.toFixed(2)}, ${r.plateLoc.z.toFixed(2)} ft` : "–");
  }
}
