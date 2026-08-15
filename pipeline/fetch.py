"""Fetch pitch-level Statcast data from Baseball Savant.

Downloads (resumable — existing files are skipped):
  data/raw/league/<date>.csv       one file per sampled league game-day (model fitting)
  data/raw/pitchers/<id>_2026.csv  full 2026 season for each roster pitcher (challenge mode)
  data/raw/active_spin_<year>.csv  spin-efficiency leaderboard (gyro-angle priors)

Run: uv run fetch.py
"""

import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

BASE = "https://baseballsavant.mlb.com"
DATA = Path(__file__).parent / "data" / "raw"
SLEEP_S = 2.5  # politeness delay between requests

ROSTER = {
    "imai": 837227,
    "skubal": 669373,
    "skenes": 694973,
    "sasaki": 808963,
    "degrom": 594798,
    "yamamoto": 808967,
    "crochet": 676979,
    "sale": 519242,
    "ohtani": 660271,
    "fried": 608331,
}


def league_days() -> list[date]:
    """Sample game-days across 2025 (full season) and 2026 (to date)."""
    days = []
    d = date(2025, 4, 1)
    while d <= date(2025, 9, 25):
        days.append(d)
        d += timedelta(days=8)
    d = date(2026, 4, 5)
    while d <= date(2026, 8, 12):
        days.append(d)
        d += timedelta(days=10)
    return days


def get(url: str, dest: Path, min_bytes: int = 200) -> bool:
    if dest.exists() and dest.stat().st_size >= min_bytes:
        print(f"skip {dest.name}")
        return True
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=180, headers={"User-Agent": "seam-shifter/0.1 (personal research)"})
            r.raise_for_status()
            if len(r.content) < min_bytes:
                print(f"WARN {dest.name}: only {len(r.content)} bytes, keeping anyway")
            dest.write_bytes(r.content)
            print(f"got  {dest.name} ({len(r.content)//1024} KB)")
            time.sleep(SLEEP_S)
            return True
        except Exception as e:  # noqa: BLE001
            print(f"retry {dest.name} ({attempt + 1}/3): {e}")
            time.sleep(10)
    print(f"FAIL {dest.name}")
    return False


def statcast_day_url(d: date) -> str:
    return (
        f"{BASE}/statcast_search/csv?all=true&player_type=pitcher&type=details"
        f"&game_date_gt={d}&game_date_lt={d}"
    )


def statcast_pitcher_url(pid: int, year: int) -> str:
    return (
        f"{BASE}/statcast_search/csv?all=true&player_type=pitcher&type=details"
        f"&hfSea={year}%7C&pitchers_lookup%5B%5D={pid}"
    )


def main() -> int:
    (DATA / "league").mkdir(parents=True, exist_ok=True)
    (DATA / "pitchers").mkdir(parents=True, exist_ok=True)
    failures = 0

    for year in (2025, 2026):
        url = f"{BASE}/leaderboard/active-spin?year={year}&min=50&csv=true"
        failures += not get(url, DATA / f"active_spin_{year}.csv")

    for d in league_days():
        failures += not get(statcast_day_url(d), DATA / "league" / f"{d}.csv")

    for name, pid in ROSTER.items():
        failures += not get(statcast_pitcher_url(pid, 2026), DATA / "pitchers" / f"{name}_{pid}_2026.csv")

    print(f"done, {failures} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
