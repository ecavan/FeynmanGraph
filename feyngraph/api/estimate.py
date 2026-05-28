"""Cost estimator: predicts RAM/runtime for a generate-amp request.

Pure lookup against bundled calibration data (no gammaloop call).
Falls back gracefully when calibration is missing.
"""

import json
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel

from feyngraph.api._gammaloop_runner import DEFAULT_TIMEOUT_S
from feyngraph.api.generate import GenerateAmpRequest

router = APIRouter(prefix="/api", tags=["estimate"])

Severity = Literal["green", "yellow", "red"]
Confidence = Literal["high", "low"]
Source = Literal["calibrated", "interpolated", "extrapolated",
                 "nearest_theory", "no_data"]


class EstimateResponse(BaseModel):
    estimated_ram_gb: float
    estimated_runtime_s: float
    severity: Severity
    confidence: Confidence
    source: Source


_CALIBRATION: dict[str, Any] | None = None
_DEFAULT_THRESHOLDS = {"green": 6.0, "yellow": 10.0}


def _load() -> dict[str, Any]:
    global _CALIBRATION
    if _CALIBRATION is not None:
        return _CALIBRATION
    path = Path(__file__).parent.parent / "data" / "calibration.json"
    if path.is_file():
        _CALIBRATION = json.loads(path.read_text())
    else:
        _CALIBRATION = {"version": 1, "thresholds_gb": _DEFAULT_THRESHOLDS,
                        "theories": {}}
    return _CALIBRATION


def _severity(ram_gb: float, runtime_s: float,
              thresholds: dict[str, float]) -> Severity:
    # Driven by RAM (OOM risk) OR predicted runtime vs the server timeout: a run
    # we predict can't finish in time is as useless as one that OOMs, and the
    # runtime axis catches heavy cases (multi-leg trees far beyond the measured
    # set) whose RAM the nearest-point extrapolation badly underestimates.
    if ram_gb >= thresholds.get("yellow", 10.0) or runtime_s >= DEFAULT_TIMEOUT_S:
        return "red"
    if (ram_gb >= thresholds.get("green", 6.0)
            or runtime_s >= 0.4 * DEFAULT_TIMEOUT_S):
        return "yellow"
    return "green"


def _pick_theory_points(cal: dict[str, Any], theory: str
                        ) -> tuple[list[dict[str, Any]], bool]:
    """Return (points, is_native). Falls back to SM analog if needed."""
    pts = cal.get("theories", {}).get(theory, {}).get("points") or []
    if pts:
        return pts, True
    sm = cal.get("theories", {}).get("sm", {}).get("points") or []
    return sm, False


def _match(points: list[dict[str, Any]], n_legs: int, loops: int,
           grouping: str) -> tuple[dict[str, float] | None, Source]:
    if not points:
        return None, "no_data"

    for p in points:
        if (p["n_legs"] == n_legs and p["loops"] == loops
                and p["grouping"] == grouping):
            return {"ram_gb": p["ram_gb"], "runtime_s": p["runtime_s"]}, \
                   "calibrated"

    same = sorted(
        (p for p in points
         if p["n_legs"] == n_legs and p["grouping"] == grouping),
        key=lambda p: p["loops"],
    )
    if same:
        below = [p for p in same if p["loops"] < loops]
        above = [p for p in same if p["loops"] > loops]
        if below and above:
            lo, hi = below[-1], above[0]
            t = (loops - lo["loops"]) / (hi["loops"] - lo["loops"])
            return {
                "ram_gb": lo["ram_gb"] + t * (hi["ram_gb"] - lo["ram_gb"]),
                "runtime_s": lo["runtime_s"]
                              + t * (hi["runtime_s"] - lo["runtime_s"]),
            }, "interpolated"
        if below:
            extra = loops - below[-1]["loops"]
            return {
                "ram_gb": below[-1]["ram_gb"] * (3.0 ** extra),
                "runtime_s": below[-1]["runtime_s"] * (4.0 ** extra),
            }, "extrapolated"

    pool = [p for p in points if p["grouping"] == grouping] or points
    nearest = min(
        pool,
        key=lambda p: (p["n_legs"] - n_legs) ** 2
                      + (3 * (p["loops"] - loops)) ** 2,
    )
    leg_jump = abs(nearest["n_legs"] - n_legs)
    loop_jump = max(0, loops - nearest["loops"])
    return {
        "ram_gb": nearest["ram_gb"] * (2.2 ** leg_jump) * (3.0 ** loop_jump),
        "runtime_s": nearest["runtime_s"] * (2.5 ** leg_jump) * (4.0 ** loop_jump),
    }, "extrapolated"


@router.post("/estimate", response_model=EstimateResponse)
async def estimate(req: GenerateAmpRequest) -> EstimateResponse:
    cal = _load()
    thresholds = cal.get("thresholds_gb", _DEFAULT_THRESHOLDS)
    n_legs = len(req.initial_state) + len(req.final_state)
    grouping = req.numerator_grouping or "no_grouping"

    points, native = _pick_theory_points(cal, req.theory_id)
    match, raw_source = _match(points, n_legs, req.loop_count, grouping)
    if match is None:
        return EstimateResponse(
            estimated_ram_gb=0.0, estimated_runtime_s=0.0,
            severity="green", confidence="low", source="no_data",
        )

    if not native:
        source: Source = "nearest_theory"
        confidence: Confidence = "low"
    else:
        source = raw_source
        confidence = "high" if source in ("calibrated", "interpolated") else "low"

    return EstimateResponse(
        estimated_ram_gb=round(match["ram_gb"], 2),
        estimated_runtime_s=round(match["runtime_s"], 1),
        severity=_severity(match["ram_gb"], match["runtime_s"], thresholds),
        confidence=confidence,
        source=source,
    )
