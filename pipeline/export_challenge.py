"""Export per-pitcher challenge data: compact per-pitch records the game can
render exactly (via the 9P kinematics) and score against.

Outputs ../public/data/pitchers/<name>.json + ../public/data/roster.json

Run: uv run export_challenge.py
"""

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
RAW = HERE / "data" / "raw" / "pitchers"
OUT = HERE.parent / "public" / "data"
MAX_PER_TYPE = 40

COLS = [
    "pitch_type", "pitch_name", "p_throws", "player_name", "game_date",
    "release_speed", "release_spin_rate", "spin_axis",
    "release_pos_x", "release_pos_y", "release_pos_z", "release_extension",
    "vx0", "vy0", "vz0", "ax", "ay", "az", "plate_x", "plate_z",
    "pfx_x", "pfx_z", "sz_top", "sz_bot", "arm_angle", "description",
]


def export_one(f: Path) -> dict | None:
    name = f.stem.split("_")[0]
    df = pd.read_csv(f, usecols=lambda c: c in COLS)
    for c in df.columns:
        if c not in ("pitch_type", "pitch_name", "p_throws", "player_name", "game_date", "description"):
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=[c for c in COLS if c not in ("arm_angle", "description", "pitch_name")])
    if df.empty:
        return None
    # per pitch type, keep a random spread (not just best/worst)
    parts = [g.sample(n=min(MAX_PER_TYPE, len(g)), random_state=11) for _, g in df.groupby("pitch_type") if len(g) >= 15]
    if not parts:
        return None
    keep = pd.concat(parts)
    pitches = []
    for _, r in keep.iterrows():
        pitches.append({
            "pt": r.pitch_type,
            "ptName": r.get("pitch_name", r.pitch_type),
            "date": str(r.game_date),
            "velo": round(float(r.release_speed), 1),
            "rpm": round(float(r.release_spin_rate)),
            "axis": round(float(r.spin_axis)),
            "rel": [round(float(r.release_pos_x), 2), round(float(r.release_pos_y), 2), round(float(r.release_pos_z), 2)],
            "ext": round(float(r.release_extension), 2),
            "v0": [round(float(r.vx0), 3), round(float(r.vy0), 3), round(float(r.vz0), 3)],
            "a": [round(float(r.ax), 3), round(float(r.ay), 3), round(float(r.az), 3)],
            "plate": [round(float(r.plate_x), 2), round(float(r.plate_z), 2)],
            "pfx": [round(float(r.pfx_x) * 12, 1), round(float(r.pfx_z) * 12, 1)],  # inches
            "sz": [round(float(r.sz_bot), 2), round(float(r.sz_top), 2)],
        })
    p0 = df.iloc[0]
    arsenal = (
        df.groupby("pitch_type")
        .agg(n=("release_speed", "size"), velo=("release_speed", "mean"), rpm=("release_spin_rate", "mean"))
        .query("n >= 15").round(1).reset_index().to_dict("records")
    )
    return {
        "id": name,
        "player": str(p0.player_name),
        "hand": str(p0.p_throws),
        "arsenal": arsenal,
        "pitches": pitches,
    }


def main() -> None:
    (OUT / "pitchers").mkdir(parents=True, exist_ok=True)
    roster = []
    for f in sorted(RAW.glob("*.csv")):
        d = export_one(f)
        if d is None:
            print(f"skip {f.name} (no usable pitches)")
            continue
        (OUT / "pitchers" / f"{d['id']}.json").write_text(json.dumps(d))
        roster.append({"id": d["id"], "player": d["player"], "hand": d["hand"], "n": len(d["pitches"])})
        print(f"{d['player']}: {len(d['pitches'])} pitches, {len(d['arsenal'])} pitch types")
    (OUT / "roster.json").write_text(json.dumps(roster, indent=1))


if __name__ == "__main__":
    main()
