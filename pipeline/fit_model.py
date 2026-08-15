"""Fit the aerodynamic model (drag, lift, SSW deviation) from Statcast data.

Method (per pitch, Statcast 9P kinematics = ground truth):
  - aero accel = (ax, ay, az + g); evaluated against mid-flight velocity
  - drag: Cd = -(a_aero . vhat) / (C0 v^2)          -> fit Cd(v, S_total)
  - lift: Cl_obs = |a_perp| / (C0 v^2)              -> fit Cl(S_T) on
    high-efficiency cohort (FF/SI, small axis deviation), Cl = S/(a + b*S)
  - movement direction phi_obs vs spin-axis-implied tilt -> SSW rotation
    surface rot(gyro, tilt); gyro inferred per pitch by inverting Cl(S)

Outputs:
  ../public/model/model.json                  fitted coefficients
  ../tests/fixtures/validation_pitches.json   held-out pitches for vitest tiers
  data/fit_report.txt                         diagnostics

Run: uv run fit_model.py
"""

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

G = 32.174
C0 = 5.316e-3
R = 9.125 / (2 * math.pi) / 12  # ft
PLATE_Y = 17 / 12
RPM_TO_RADS = 2 * math.pi / 60

HERE = Path(__file__).parent
RAW = HERE / "data" / "raw"
NEEDED = [
    "pitch_type", "p_throws", "release_speed", "release_spin_rate", "spin_axis",
    "release_pos_x", "release_pos_y", "release_pos_z", "release_extension",
    "vx0", "vy0", "vz0", "ax", "ay", "az", "plate_x", "plate_z", "pfx_x", "pfx_z",
    "arm_angle", "pitcher", "player_name", "game_date",
]


def load_league() -> pd.DataFrame:
    files = sorted((RAW / "league").glob("*.csv"))
    if not files:
        raise SystemExit("no league CSVs — run fetch.py first")
    df = pd.concat([pd.read_csv(f, usecols=lambda c: c in NEEDED) for f in files], ignore_index=True)
    non_num = ("pitch_type", "p_throws", "player_name", "game_date")
    for c in df.columns:
        if c not in non_num:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=[c for c in NEEDED if c not in ("arm_angle",)])
    df = df[
        df.release_speed.between(60, 106)
        & df.release_spin_rate.between(300, 3700)
        & df.vy0.between(-155, -80)
        & df.pitch_type.isin(["FF", "SI", "FC", "SL", "ST", "CU", "KC", "CH", "FS", "SV"])
    ].reset_index(drop=True)
    return df


def kinematics(df: pd.DataFrame) -> pd.DataFrame:
    """Per-pitch aero decomposition in the mid-flight frame."""
    out = df.copy()
    vy0, ay = df.vy0.values, df.ay.values
    # time from y=50 to the plate (positive) and back to release (negative)
    def t_at(yplane, y0=50.0):
        c = y0 - yplane
        disc = vy0**2 - 2 * ay * c
        sq = np.sqrt(np.maximum(disc, 0))
        t1, t2 = (-vy0 - sq) / ay, (-vy0 + sq) / ay
        if yplane <= y0:
            t = np.where(t1 >= 0, np.minimum(t1, np.where(t2 >= 0, t2, np.inf)), t2)
        else:
            t = np.where(np.abs(t1) <= np.abs(t2), t1, t2)
        return t

    tp = t_at(PLATE_Y)
    tr = np.array([  # release plane differs per pitch
        (-vy - math.sqrt(max(vy * vy - 2 * a * (50.0 - ry), 0))) / a
        if abs((-vy - math.sqrt(max(vy * vy - 2 * a * (50.0 - ry), 0))) / a)
        <= abs((-vy + math.sqrt(max(vy * vy - 2 * a * (50.0 - ry), 0))) / a)
        else (-vy + math.sqrt(max(vy * vy - 2 * a * (50.0 - ry), 0))) / a
        for vy, a, ry in zip(vy0, ay, df.release_pos_y.values)
    ])
    tm = (tr + tp) / 2

    vx = df.vx0.values + df.ax.values * tm
    vy = vy0 + ay * tm
    vz = df.vz0.values + df.az.values * tm
    v = np.sqrt(vx**2 + vy**2 + vz**2)
    vhx, vhy, vhz = vx / v, vy / v, vz / v

    aax, aay, aaz = df.ax.values, df.ay.values, df.az.values + G
    adotv = aax * vhx + aay * vhy + aaz * vhz
    cd = -adotv / (C0 * v**2)
    # transverse (perp to v) component
    tx, ty, tz = aax - adotv * vhx, aay - adotv * vhy, aaz - adotv * vhz
    amag = np.sqrt(tx**2 + ty**2 + tz**2)
    cl_obs = amag / (C0 * v**2)
    # movement clock angle: 0 = up-in-plane, positive toward -x (arm side, RHP)
    # in-plane basis: zp = z - (z.vh)vh ; xp = x - (x.vh)vh
    zpx, zpy, zpz = -vhz * vhx, -vhz * vhy, 1 - vhz * vhz
    zpn = np.sqrt(zpx**2 + zpy**2 + zpz**2)
    xpx, xpy, xpz = 1 - vhx * vhx, -vhx * vhy, -vhx * vhz
    xpn = np.sqrt(xpx**2 + xpy**2 + xpz**2)
    a_up = (tx * zpx + ty * zpy + tz * zpz) / zpn
    a_side = (tx * xpx + ty * xpy + tz * xpz) / xpn
    phi_obs = np.degrees(np.arctan2(-a_side, a_up))

    tilt_spin = ((df.spin_axis.values - 180) % 360 + 360) % 360
    tilt_spin = np.where(tilt_spin > 180, tilt_spin - 360, tilt_spin)

    omega = df.release_spin_rate.values * RPM_TO_RADS
    s_total = R * omega / v

    out["t_release"], out["t_plate"], out["v_mid"] = tr, tp, v
    out["cd"], out["cl_obs"], out["phi_obs"] = cd, cl_obs, phi_obs
    out["tilt_spin"], out["s_total"], out["omega"] = tilt_spin, s_total, omega
    dphi = phi_obs - tilt_spin
    out["dphi"] = (dphi + 180) % 360 - 180
    return out


def fit(df: pd.DataFrame) -> dict:
    rep = []
    ok = df[(df.cd.between(0.1, 0.7)) & (df.cl_obs.between(0.0, 0.9))].copy()
    rep.append(f"pitches after QC: {len(ok)} / {len(df)}")

    # --- drag: Cd ~ 1 + (v-130) + S_total (robust linear via 2-pass sigma clip)
    X = np.column_stack([np.ones(len(ok)), ok.v_mid - 130, ok.s_total])
    y = ok.cd.values
    for _ in range(2):
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        r = y - X @ beta
        keep = np.abs(r) < 3 * r.std()
        X, y = X[keep], y[keep]
    cd0, cdV, cdS = beta
    rep.append(f"Cd = {cd0:.4f} + {cdV:.5f}(v-130) + {cdS:.4f}S  (resid sd {r.std():.4f})")

    # --- lift Cl(S): high-efficiency cohort = FF/SI with small axis deviation
    he = ok[ok.pitch_type.isin(["FF", "SI"]) & (ok.dphi.abs() < 15)].copy()
    eff0 = 0.94  # typical FF/SI active-spin fraction; refined below by iteration
    for _ in range(3):
        st = he.s_total * eff0
        # least squares on 1/Cl = a/S + b
        w = 1.0 / np.maximum(he.cl_obs, 0.05)
        A = np.column_stack([1.0 / st, np.ones(len(he))])
        coef, *_ = np.linalg.lstsq(A, w, rcond=None)
        a_cl, b_cl = coef
        # re-estimate cohort efficiency: invert Cl for each pitch, cap at 1
        s_need = a_cl * he.cl_obs / np.maximum(1 - b_cl * he.cl_obs, 1e-6)
        eff = np.clip(s_need / he.s_total, 0.2, 1.0)
        eff0 = float(np.median(eff))
    rep.append(f"Cl(S) = S/({a_cl:.4f} + {b_cl:.4f} S), FF/SI cohort eff median {eff0:.3f}, n={len(he)}")

    # --- per-pitch gyro from inverting Cl(S)
    s_need = a_cl * ok.cl_obs / np.maximum(1 - b_cl * ok.cl_obs, 1e-6)
    eff = np.clip(s_need / ok.s_total, 0.0, 1.0)
    ok["gyro"] = np.degrees(np.arccos(eff))

    # --- SSW rotation, RHP-normalized (mirror LHP), fit separately per seam
    # mode. Grip/seam orientation is unobservable in tracking data but is the
    # dominant hidden variable (FF vs SI deviate oppositely at the same tilt),
    # so pitch type serves as the grip proxy: 4-seam-style vs 2-seam-style.
    SEAM_MODE = {"FF": 0, "FC": 0, "SL": 0, "CU": 0, "KC": 0, "SV": 0,
                 "SI": 1, "CH": 1, "FS": 1, "ST": 1}
    ok["seam"] = ok.pitch_type.map(SEAM_MODE)
    sgn = np.where(ok.p_throws == "R", 1.0, -1.0)
    ok["dphi_n"] = ok.dphi * sgn
    ok["tilt_n"] = ok.tilt_spin * sgn

    ssw = {}
    for mode, sub in ok.groupby("seam"):
        g_rad = np.radians(sub.gyro)
        t_rad = np.radians(sub.tilt_n)
        Xs = np.column_stack([np.ones(len(sub)), np.sin(g_rad), np.sin(t_rad) * np.cos(g_rad)])
        ys = np.radians(sub.dphi_n)
        for _ in range(2):
            bs, *_ = np.linalg.lstsq(Xs, ys, rcond=None)
            rs = ys - Xs @ bs
            keep = np.abs(rs) < 3 * rs.std()
            Xs, ys = Xs[keep], ys[keep]
        r0, rG, rT = bs
        ssw[f"mode{mode}"] = {"r0": round(float(r0), 5), "rG": round(float(rG), 5),
                              "rT": round(float(rT), 5), "s0": 0.0}
        rep.append(
            f"SSW mode{mode}: rot = {r0:.4f} + {rG:.4f} sin(g) + {rT:.4f} sin(t)cos(g) rad "
            f"(resid sd {math.degrees(rs.std()):.1f} deg, n={len(sub)})"
        )
    by_type = ok.groupby("pitch_type").agg(n=("dphi_n", "size"), dphi_med=("dphi_n", "median"), gyro_med=("gyro", "median"))
    rep.append("axis deviation by pitch type (deg, RHP-normalized):\n" + by_type.to_string())

    model = {
        "cd": {"cd0": round(float(cd0), 5), "cdV": round(float(cdV), 6), "cdS": round(float(cdS), 5)},
        "cl": {"a": round(float(a_cl), 5), "b": round(float(b_cl), 5)},
        "ssw": ssw,
        "meta": {"fitDate": pd.Timestamp.today().strftime("%Y-%m-%d"), "nPitches": int(len(ok))},
    }
    return {"model": model, "report": "\n".join(rep), "pitches": ok}


def export_fixtures(ok: pd.DataFrame, n: int = 250, seed: int = 7) -> list[dict]:
    """Held-out pitches for the vitest validation tiers."""
    sample = ok.sample(n=min(n, len(ok)), random_state=seed)
    fixtures = []
    for _, r in sample.iterrows():
        fixtures.append({
            "pitch_type": r.pitch_type,
            "hand": r.p_throws,
            "velo": round(float(r.release_speed), 2),
            "rpm": round(float(r.release_spin_rate), 0),
            "tilt_spin": round(float(r.tilt_spin), 2),
            "phi_obs": round(float(r.phi_obs), 2),
            "gyro": round(float(r.gyro), 2),
            "cd": round(float(r.cd), 4),
            "seam": int(r.seam),
            "release": [round(float(r.release_pos_x), 3), round(float(r.release_pos_y), 3), round(float(r.release_pos_z), 3)],
            "nineP": {
                "v0": [round(float(r.vx0), 4), round(float(r.vy0), 4), round(float(r.vz0), 4)],
                "a": [round(float(r.ax), 4), round(float(r.ay), 4), round(float(r.az), 4)],
            },
            "plate": [round(float(r.plate_x), 3), round(float(r.plate_z), 3)],
            "pfx": [round(float(r.pfx_x), 3), round(float(r.pfx_z), 3)],
        })
    return fixtures


def main() -> None:
    df = kinematics(load_league())
    res = fit(df)
    out_model = HERE.parent / "public" / "model" / "model.json"
    out_model.parent.mkdir(parents=True, exist_ok=True)
    out_model.write_text(json.dumps(res["model"], indent=2))

    fixtures = export_fixtures(res["pitches"])
    out_fix = HERE.parent / "tests" / "fixtures" / "validation_pitches.json"
    out_fix.parent.mkdir(parents=True, exist_ok=True)
    out_fix.write_text(json.dumps(fixtures))

    report = res["report"]
    (HERE / "data" / "fit_report.txt").write_text(report)
    print(report)
    print(f"\nwrote {out_model} and {len(fixtures)} fixtures")


if __name__ == "__main__":
    main()
