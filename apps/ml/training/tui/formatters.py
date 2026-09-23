"""
Resilient String and Metric Formatters for Ananya ML Trainer TUI.

Guarantees:
- Never renders NaN, Infinity, None, or undefined.
- Uses '—' (em dash) for missing or uncomputable metrics.
- Provides consistent, human-readable numbers, bytes, durations, rates, and percentages.
"""

import math
from typing import Optional, Union, Any

PLACEHOLDER = "—"


def is_invalid_num(val: Any) -> bool:
    """Checks if a value is None, NaN, Infinite, or non-numeric."""
    if val is None:
        return True
    if not isinstance(val, (int, float)):
        return True
    return math.isnan(val) or math.isinf(val)


def format_number(val: Optional[Union[int, float]], default: str = PLACEHOLDER) -> str:
    """Formats an integer or float with thousands separators (e.g. 12,482)."""
    if is_invalid_num(val):
        return default
    try:
        int_val = int(round(val))  # type: ignore
        return f"{int_val:,}"
    except (ValueError, TypeError, OverflowError):
        return default


def format_bytes(bytes_count: Optional[Union[int, float]], default: str = PLACEHOLDER) -> str:
    """Formats byte counts into human-readable B, KB, MB, GB, TB."""
    if is_invalid_num(bytes_count):
        return default
    try:
        b = float(bytes_count)  # type: ignore
        if b < 0:
            return default
        if b < 1024:
            return f"{int(b)} B"
        elif b < 1024 * 1024:
            return f"{b / 1024:.1f} KB"
        elif b < 1024 * 1024 * 1024:
            return f"{b / (1024 * 1024):.1f} MB"
        elif b < 1024 * 1024 * 1024 * 1024:
            return f"{b / (1024 * 1024 * 1024):.2f} GB"
        else:
            return f"{b / (1024 * 1024 * 1024 * 1024):.2f} TB"
    except (ValueError, TypeError, OverflowError):
        return default


def format_rate(
    count: Optional[Union[int, float]],
    unit: str = "docs/min",
    default: str = PLACEHOLDER,
) -> str:
    """Formats processing rate (e.g. 63.5 docs/min)."""
    if is_invalid_num(count):
        return default
    try:
        val = float(count)  # type: ignore
        if val < 0:
            return default
        if val >= 100:
            return f"{int(round(val)):,} {unit}"
        return f"{val:.1f} {unit}"
    except (ValueError, TypeError, OverflowError):
        return default


def format_percentage(
    val: Optional[Union[int, float]],
    multiply: bool = False,
    default: str = PLACEHOLDER,
) -> str:
    """Formats a percentage (e.g. 82.4% or 94.72%)."""
    if is_invalid_num(val):
        return default
    try:
        f = float(val)  # type: ignore
        if multiply:
            f *= 100.0
        if f < 0 or f > 100.0:
            # Bound within 0-100%
            f = max(0.0, min(100.0, f))
        return f"{f:.1f}%"
    except (ValueError, TypeError, OverflowError):
        return default


def format_duration(seconds: Optional[Union[int, float]], default: str = PLACEHOLDER) -> str:
    """Formats seconds into human-readable duration (e.g. 18m 42s, 2h 15m, 45s)."""
    if is_invalid_num(seconds):
        return default
    try:
        s = max(0.0, float(seconds))  # type: ignore
        total_seconds = int(s)
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        secs = total_seconds % 60

        if hours > 0:
            return f"{hours}h {minutes:02d}m"
        elif minutes > 0:
            return f"{minutes}m {secs:02d}s"
        else:
            return f"{secs}s"
    except (ValueError, TypeError, OverflowError):
        return default


def format_eta(seconds: Optional[Union[int, float]], default: str = PLACEHOLDER) -> str:
    """Formats ETA duration; returns placeholder if 0, negative, or unknown."""
    if is_invalid_num(seconds):
        return default
    try:
        s = float(seconds)  # type: ignore
        if s <= 0:
            return default
        return format_duration(s, default=default)
    except (ValueError, TypeError, OverflowError):
        return default


def render_progress_bar(
    current: Optional[int],
    total: Optional[int],
    width: int = 16,
    filled_char: str = "█",
    empty_char: str = "░",
) -> str:
    """Renders a fixed-width Unicode progress bar."""
    if is_invalid_num(current) or is_invalid_num(total) or not total or total <= 0:
        return empty_char * width
    pct = max(0.0, min(1.0, float(current) / float(total)))
    filled_count = int(round(width * pct))
    empty_count = max(0, width - filled_count)
    return (filled_char * filled_count) + (empty_char * empty_count)
