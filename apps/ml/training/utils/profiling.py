"""
Lightweight, thread-safe stage profiler for the autonomous collection pipeline.

Accumulates per-stage durations (seconds) and byte counters so document
acquisition can be measured without changing production behaviour. Disabled by
default; opt in by constructing a :class:`StageProfiler` and passing it to the
collector or wrapping pipeline calls manually.
"""

import time
import statistics
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Iterator


@dataclass
class StageStats:
    """Aggregated timing statistics for a single pipeline stage."""

    count: int = 0
    total: float = 0.0
    maximum: float = 0.0
    samples: List[float] = field(default_factory=list)

    @property
    def average(self) -> float:
        return self.total / self.count if self.count else 0.0

    @property
    def median(self) -> float:
        return statistics.median(self.samples) if self.samples else 0.0

    def percentile(self, pct: float) -> float:
        if not self.samples:
            return 0.0
        ordered = sorted(self.samples)
        if len(ordered) == 1:
            return ordered[0]
        rank = (pct / 100.0) * (len(ordered) - 1)
        lower = int(rank)
        upper = min(lower + 1, len(ordered) - 1)
        frac = rank - lower
        return ordered[lower] + (ordered[upper] - ordered[lower]) * frac


class StageProfiler:
    """Thread-safe accumulator for named pipeline stage timings and counters."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stages: Dict[str, StageStats] = {}
        self._counters: Dict[str, float] = {}

    def record(self, stage: str, seconds: float) -> None:
        with self._lock:
            stats = self._stages.get(stage)
            if stats is None:
                stats = StageStats()
                self._stages[stage] = stats
            stats.count += 1
            stats.total += seconds
            stats.maximum = max(stats.maximum, seconds)
            stats.samples.append(seconds)

    def increment(self, counter: str, amount: float = 1.0) -> None:
        with self._lock:
            self._counters[counter] = self._counters.get(counter, 0.0) + amount

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        start = time.perf_counter()
        try:
            yield
        finally:
            self.record(name, time.perf_counter() - start)

    def stage_stats(self, name: str) -> StageStats:
        with self._lock:
            return self._stages.get(name, StageStats())

    def counter(self, name: str) -> float:
        with self._lock:
            return self._counters.get(name, 0.0)

    def summary(self) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            return {
                name: {
                    "count": stats.count,
                    "total": stats.total,
                    "average": stats.average,
                    "median": stats.median,
                    "p95": stats.percentile(95.0),
                    "maximum": stats.maximum,
                }
                for name, stats in self._stages.items()
            }

    def counters(self) -> Dict[str, float]:
        with self._lock:
            return dict(self._counters)

    def reset(self) -> None:
        with self._lock:
            self._stages.clear()
            self._counters.clear()

    def render(self, title: str = "STAGE PROFILE") -> str:
        lines = [title, "=" * 72]
        lines.append(f"{'Stage':<26}{'Count':>7}{'Avg(s)':>10}{'Med(s)':>10}{'P95(s)':>10}{'Max(s)':>10}")
        lines.append("-" * 72)
        for name, s in self.summary().items():
            lines.append(
                f"{name:<26}{s['count']:>7}{s['average']:>10.4f}{s['median']:>10.4f}"
                f"{s['p95']:>10.4f}{s['maximum']:>10.4f}"
            )
        counters = self.counters()
        if counters:
            lines.append("-" * 72)
            for name, value in counters.items():
                if float(value).is_integer():
                    lines.append(f"{name}: {int(value):,}")
                else:
                    lines.append(f"{name}: {value:,.3f}")
        lines.append("=" * 72)
        return "\n".join(lines)


def format_duration(seconds: float) -> str:
    """Formats a duration in seconds as HH:MM:SS."""
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def percentiles(samples: List[float]) -> Dict[str, float]:
    """Returns average/median/p95/max for a list of duration samples."""
    if not samples:
        return {"average": 0.0, "median": 0.0, "p95": 0.0, "maximum": 0.0}
    stats = StageStats()
    for s in samples:
        stats.count += 1
        stats.total += s
        stats.maximum = max(stats.maximum, s)
        stats.samples.append(s)
    return {
        "average": stats.average,
        "median": stats.median,
        "p95": stats.percentile(95.0),
        "maximum": stats.maximum,
    }


def load_profiler_from_env() -> Optional[StageProfiler]:
    """Creates a profiler when ANANYA_ML_PROFILE is truthy, otherwise None."""
    import os

    if os.environ.get("ANANYA_ML_PROFILE", "").strip().lower() in ("1", "true", "yes", "on"):
        return StageProfiler()
    return None
