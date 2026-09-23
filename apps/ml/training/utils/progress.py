"""
Shared Progress Reporting Utility for Ananya ML Training Workspace.

Supports:
- Progress bars when totals are known
- Indeterminate spinners when totals are unknown
- Elapsed time and ETA estimation
- TTY in-place updates with line-clearing
- Clean, non-spammed non-TTY / CI output
- Quiet mode (--quiet) and Verbose mode (--verbose)
- Structured metrics and counters
- Safe exception handling without swallow or corrupting output
"""

import sys
import time
from typing import Optional, Dict, Any, TextIO, Iterable, Iterator, List


def format_time(seconds: float) -> str:
    """Formats seconds into HH:MM:SS."""
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


class LiveProgress:
    """
    Live terminal progress tracker with TTY awareness and quiet mode.
    """

    SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    ASCII_SPINNER = ["|", "/", "-", "\\"]

    def __init__(
        self,
        quiet: bool = False,
        verbose: bool = False,
        stream: Optional[TextIO] = None,
        is_tty: Optional[bool] = None,
        update_interval: float = 0.1,
        non_tty_interval: float = 5.0,
        stage: Optional[str] = None,
        total: Optional[int] = None,
        event_sink: Optional[Any] = None,
    ):
        self.quiet = quiet
        self.verbose = verbose
        self.stream = stream or sys.stdout
        self.is_tty = is_tty if is_tty is not None else getattr(self.stream, "isatty", lambda: False)()
        self.update_interval = update_interval
        self.non_tty_interval = non_tty_interval

        self.event_sink = event_sink
        if self.event_sink is None:
            try:
                from ..tui import get_event_sink
                self.event_sink = get_event_sink()
            except (ImportError, ValueError):
                self.event_sink = None

        # Stage state
        self.stage_title: str = ""
        self.total: Optional[int] = None
        self.current: int = 0
        self.unit: str = "items"
        self.metrics: Dict[str, Any] = {}
        self.start_time: float = 0.0
        self.last_render_time: float = 0.0
        self.last_non_tty_time: float = 0.0
        self.last_non_tty_pct: int = -1
        self.spinner_idx: int = 0
        self.is_active: bool = False
        self._rendered_in_tty: bool = False

        if stage:
            self.start_stage(stage, total=total)

    def start_stage(self, title: str, total: Optional[int] = None, unit: str = "items") -> None:
        """Starts a new progress stage."""
        if self.is_active:
            self.finish_stage()

        self.stage_title = title
        self.total = total
        self.current = 0
        self.unit = unit
        self.metrics = {}
        self.start_time = time.time()
        self.last_render_time = 0.0
        self.last_non_tty_time = 0.0
        self.last_non_tty_pct = -1
        self.spinner_idx = 0
        self.is_active = True
        self._rendered_in_tty = False

        if self.event_sink is not None:
            try:
                from ..tui import StageStartedEvent
                self.event_sink.emit(StageStartedEvent(stage_name=title, total=total, unit=unit))
            except Exception:
                pass

        if not self.quiet and self.event_sink is None:
            if not self.is_tty:
                # In non-TTY, log that stage started
                self.stream.write(f"--> {title}\n")
                self.stream.flush()
            else:
                self._render(force=True)

    def update(
        self,
        current: Optional[int] = None,
        advance: int = 0,
        total: Optional[int] = None,
        metrics: Optional[Dict[str, Any]] = None,
        message: Optional[str] = None,
    ) -> None:
        """Updates progress counters and renders if throttled interval elapsed."""
        if not self.is_active or self.quiet:
            return

        if total is not None:
            self.total = total
        if current is not None:
            self.current = current
        else:
            self.current += advance

        if metrics:
            self.metrics.update(metrics)
        if message:
            self.metrics["status"] = message

        if self.event_sink is not None:
            try:
                from ..tui import StageProgressEvent
                self.event_sink.emit(
                    StageProgressEvent(
                        stage_name=self.stage_title,
                        current=self.current,
                        total=self.total,
                        metrics=dict(self.metrics),
                        message=message,
                    )
                )
            except Exception:
                pass
            return

        now = time.time()
        if self.is_tty:
            if (now - self.last_render_time) >= self.update_interval:
                self._render()
        else:
            # In non-TTY mode, log only at intervals (e.g. every 10% or every non_tty_interval seconds)
            should_log = False
            if (now - self.last_non_tty_time) >= self.non_tty_interval:
                should_log = True
            elif self.total and self.total > 0:
                pct = int((self.current / self.total) * 10) * 10
                if pct > self.last_non_tty_pct and pct % 20 == 0:
                    should_log = True
                    self.last_non_tty_pct = pct

            if should_log:
                self._render_non_tty()
                self.last_non_tty_time = now

    def _format_metrics(self) -> str:
        if not self.metrics:
            return ""
        parts = []
        for k, v in self.metrics.items():
            if isinstance(v, float):
                parts.append(f"{k}: {v:.3f}")
            elif isinstance(v, int):
                parts.append(f"{k}: {v:,}")
            else:
                parts.append(f"{k}: {v}")
        return " | ".join(parts)

    def _render(self, force: bool = False) -> None:
        now = time.time()
        elapsed = now - self.start_time
        time_str = format_time(elapsed)

        metrics_str = self._format_metrics()
        metrics_suffix = f" | {metrics_str}" if metrics_str else ""

        if self.total and self.total > 0:
            pct = min(1.0, max(0.0, self.current / self.total))
            bar_len = 20
            filled = int(bar_len * pct)
            bar = "=" * filled + (">" if filled < bar_len else "")
            bar = bar.ljust(bar_len, " ")

            line = f"{self.stage_title} [{bar}] {pct*100:5.1f}% ({self.current:,}/{self.total:,}){metrics_suffix} | elapsed: {time_str}"
        else:
            spinner = self.SPINNER_FRAMES[self.spinner_idx % len(self.SPINNER_FRAMES)]
            self.spinner_idx += 1
            line = f"{spinner} {self.stage_title} | {self.current:,} {self.unit}{metrics_suffix} | elapsed: {time_str}"

        # Clean carriage return + clear line
        self.stream.write(f"\r\033[K{line}")
        self.stream.flush()
        self.last_render_time = now
        self._rendered_in_tty = True

    def _render_non_tty(self) -> None:
        now = time.time()
        elapsed = now - self.start_time
        time_str = format_time(elapsed)
        metrics_str = self._format_metrics()
        metrics_suffix = f" | {metrics_str}" if metrics_str else ""

        if self.total and self.total > 0:
            pct = (self.current / self.total) * 100
            line = f"  {self.stage_title}: {self.current:,}/{self.total:,} ({pct:.1f}%){metrics_suffix} [elapsed: {time_str}]"
        else:
            line = f"  {self.stage_title}: {self.current:,} {self.unit}{metrics_suffix} [elapsed: {time_str}]"

        self.stream.write(f"{line}\n")
        self.stream.flush()

    def finish_stage(self, summary: Optional[str] = None) -> None:
        """Finishes the current stage and prints final line."""
        if not self.is_active:
            return

        if self.event_sink is not None:
            try:
                from ..tui import StageCompletedEvent
                self.event_sink.emit(StageCompletedEvent(stage_name=self.stage_title, summary=summary))
            except Exception:
                pass
            self.is_active = False
            return

        if not self.quiet:
            elapsed = time.time() - self.start_time
            time_str = format_time(elapsed)

            if summary:
                line = summary
            else:
                metrics_str = self._format_metrics()
                metrics_suffix = f" | {metrics_str}" if metrics_str else ""
                if self.total is not None and self.total > 0:
                    line = f"{self.stage_title}: {self.current:,}/{self.total:,} completed in {time_str}{metrics_suffix}"
                else:
                    line = f"{self.stage_title}: {self.current:,} {self.unit} in {time_str}{metrics_suffix}"

            if self.is_tty:
                if self._rendered_in_tty:
                    self.stream.write(f"\r\033[K{line}\n")
                else:
                    self.stream.write(f"{line}\n")
            else:
                self.stream.write(f"✓ {line}\n")
            self.stream.flush()

        self.is_active = False

    def log(self, message: str, level: str = "info") -> None:
        """Prints a log message without disturbing the active progress bar."""
        if self.event_sink is not None:
            try:
                from ..tui import LogEvent
                self.event_sink.emit(LogEvent(level=level.upper(), logger_name="ananya.ml.progress", message=message))
            except Exception:
                pass
            return

        if self.quiet and level != "error":
            return
        if self.is_tty and self._rendered_in_tty:
            # Clear line, print log, and re-render progress
            self.stream.write(f"\r\033[K{message}\n")
            self._render(force=True)
        else:
            self.stream.write(f"{message}\n")
        self.stream.flush()

    def iter_progress(
        self,
        iterable: Iterable[Any],
        title: str,
        total: Optional[int] = None,
        unit: str = "items",
    ) -> Iterator[Any]:
        """Convenience generator wrapping any iterable with live progress."""
        if total is None and hasattr(iterable, "__len__"):
            total = len(iterable)  # type: ignore

        self.start_stage(title, total=total, unit=unit)
        try:
            for item in iterable:
                yield item
                self.update(advance=1)
        finally:
            self.finish_stage()

    def __enter__(self) -> "LiveProgress":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type is not None:
            # Preserve exception while finishing stage cleanly
            if not self.quiet and self.is_tty and self._rendered_in_tty and self.event_sink is None:
                self.stream.write("\n")
                self.stream.flush()
        else:
            self.finish_stage()
