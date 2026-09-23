"""
Production Rich Live Dashboard Application for Ananya ML Trainer.

Provides:
- Thread-safe EventQueue and EventSink architecture
- Main-thread Rich Live rendering loop (~4 Hz)
- Decoupled worker execution (TUI failure never fails the job)
- In-memory logging redirection (TUILogHandler)
- Graceful non-blocking keyboard controls (P, R, M, S, F, L, T, Q)
"""

import sys
import os
import time
import queue
import logging
import threading
import traceback
from typing import Optional, Callable, Any, Dict, List

from rich.console import Console
from rich.live import Live

from .events import TUIEvent, LogEvent, UserCommandEvent, JobCompletedEvent, JobFailedEvent, MetricUpdateEvent
from .state import TUIState
from .panels import render_dashboard
from .theme import TUI_THEME

logger = logging.getLogger("ananya.ml.tui")

# Global Active Event Sink
_ACTIVE_EVENT_SINK: Optional["EventSink"] = None
_SINK_LOCK = threading.Lock()


class EventSink:
    """Thread-safe interface for worker threads to push events to the TUI."""

    def __init__(self, event_queue: "queue.Queue[TUIEvent]"):
        self._queue = event_queue

    def emit(self, event: TUIEvent) -> None:
        """Pushes an event into the queue without blocking."""
        try:
            self._queue.put_nowait(event)
        except Exception:
            pass


def get_event_sink() -> Optional[EventSink]:
    """Returns the currently active TUI event sink, if any."""
    with _SINK_LOCK:
        return _ACTIVE_EVENT_SINK


def emit_event(event: TUIEvent) -> None:
    """Convenience helper to emit an event to the active sink if present."""
    sink = get_event_sink()
    if sink is not None:
        sink.emit(event)


class TUILogHandler(logging.Handler):
    """Routes standard Python logging messages into the TUI event stream."""

    def __init__(self, event_sink: EventSink):
        super().__init__()
        self.event_sink = event_sink

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            self.event_sink.emit(
                LogEvent(
                    level=record.levelname,
                    logger_name=record.name,
                    message=msg,
                    timestamp=record.created,
                )
            )
        except Exception:
            self.handleError(record)


def collect_system_metrics() -> Dict[str, Any]:
    """Collects CPU, memory, and disk metrics safely without hard dependencies."""
    metrics: Dict[str, Any] = {}
    try:
        import psutil  # type: ignore
        metrics["cpu"] = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        metrics["memory"] = mem.used / (1024 * 1024)
        disk = psutil.disk_usage(os.getcwd())
        metrics["disk_free"] = disk.free / (1024 * 1024 * 1024)
        return metrics
    except Exception:
        pass

    # Standard library fallback
    try:
        import resource
        usage = resource.getrusage(resource.RUSAGE_SELF)
        # ru_maxrss is KB on Linux, Bytes on macOS
        rss = usage.ru_maxrss
        if sys.platform == "darwin":
            metrics["memory"] = rss / (1024 * 1024)
        else:
            metrics["memory"] = rss / 1024
    except Exception:
        pass

    try:
        st = os.statvfs(os.getcwd())
        free_bytes = st.f_bavail * st.f_frsize
        metrics["disk_free"] = free_bytes / (1024 * 1024 * 1024)
    except Exception:
        pass

    return metrics


class KeyboardListener(threading.Thread):
    """
    Background non-blocking stdin reader for hotkeys.
    Gracefully disabled if terminal is non-interactive or termios is unavailable.
    """

    def __init__(self, event_sink: EventSink):
        super().__init__(daemon=True, name="tui-keyboard-listener")
        self.event_sink = event_sink
        self._stop_event = threading.Event()
        self._orig_termios = None

    def run(self) -> None:
        if not sys.stdin.isatty():
            return

        try:
            import termios
            import tty
            import select
        except ImportError:
            return

        fd = sys.stdin.fileno()
        try:
            self._orig_termios = termios.tcgetattr(fd)
            tty.setcbreak(fd)

            key_map = {
                "p": "pause",
                "P": "pause",
                "r": "resume",
                "R": "resume",
                "m": "view_main",
                "M": "view_main",
                "s": "view_sources",
                "S": "view_sources",
                "f": "view_failures",
                "F": "view_failures",
                "l": "view_logs",
                "L": "view_logs",
                "t": "view_training",
                "T": "view_training",
                "d": "view_sources",
                "D": "view_sources",
                "q": "quit",
                "Q": "quit",
            }

            while not self._stop_event.is_set():
                r, _, _ = select.select([sys.stdin], [], [], 0.2)
                if r:
                    ch = sys.stdin.read(1)
                    if ch in key_map:
                        self.event_sink.emit(UserCommandEvent(command=key_map[ch]))
        except Exception:
            pass
        finally:
            self._restore_terminal()

    def stop(self) -> None:
        self._stop_event.set()
        self._restore_terminal()

    def _restore_terminal(self) -> None:
        if self._orig_termios is not None and sys.stdin.isatty():
            try:
                import termios
                termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, self._orig_termios)
                self._orig_termios = None
            except Exception:
                pass


class TrainerTUI:
    """
    Main orchestration class for the Ananya Rich TUI.
    """

    def __init__(self, console: Optional[Console] = None):
        self.console = console or Console(theme=TUI_THEME)
        self.queue: "queue.Queue[TUIEvent]" = queue.Queue()
        self.state = TUIState()
        self.sink = EventSink(self.queue)
        self.keyboard_thread: Optional[KeyboardListener] = None
        self._log_handler: Optional[TUILogHandler] = None
        self._muted_handlers: List[logging.Handler] = []

    def start(self) -> None:
        """Sets up event sink and logging redirection."""
        global _ACTIVE_EVENT_SINK
        with _SINK_LOCK:
            _ACTIVE_EVENT_SINK = self.sink

        # Setup in-memory logging redirection
        root_logger = logging.getLogger()
        self._log_handler = TUILogHandler(self.sink)
        self._log_handler.setLevel(logging.INFO)
        root_logger.addHandler(self._log_handler)

        # Mute console stream handlers so raw text does not disrupt Live rendering
        self._muted_handlers = []
        for h in list(root_logger.handlers):
            if h is not self._log_handler and isinstance(h, logging.StreamHandler):
                self._muted_handlers.append(h)
                try:
                    root_logger.removeHandler(h)
                except Exception:
                    pass

        # Start keyboard reader if interactive
        if sys.stdin.isatty():
            try:
                self.keyboard_thread = KeyboardListener(self.sink)
                self.keyboard_thread.start()
            except Exception:
                self.keyboard_thread = None

    def stop(self) -> None:
        """Restores logging and keyboard state."""
        global _ACTIVE_EVENT_SINK
        with _SINK_LOCK:
            if _ACTIVE_EVENT_SINK is self.sink:
                _ACTIVE_EVENT_SINK = None

        if self.keyboard_thread:
            self.keyboard_thread.stop()
            self.keyboard_thread = None

        root_logger = logging.getLogger()
        if self._log_handler:
            try:
                root_logger.removeHandler(self._log_handler)
            except Exception:
                pass
            self._log_handler = None

        # Restore console handlers
        for h in self._muted_handlers:
            try:
                root_logger.addHandler(h)
            except Exception:
                pass
        self._muted_handlers = []

    def drain_events(self, max_count: int = 500) -> int:
        """Drains pending events from the queue and applies them to state."""
        count = 0
        while count < max_count:
            try:
                event = self.queue.get_nowait()
                self.state.apply_event(event)
                count += 1
            except queue.Empty:
                break
        return count

    def run_job(
        self,
        job_fn: Callable[..., Any],
        *args: Any,
        refresh_rate_hz: float = 4.0,
        **kwargs: Any,
    ) -> Any:
        """
        Executes a job function while presenting the Rich Live dashboard.
        TUI failure NEVER fails the job.
        If user quits (Q), TUI detaches and job continues.
        """
        self.start()

        job_result: Dict[str, Any] = {"return_value": None, "exception": None, "done": False}

        def worker_target():
            try:
                job_result["return_value"] = job_fn(*args, **kwargs)
                self.sink.emit(JobCompletedEvent(success=True, summary="Job finished successfully"))
            except Exception as e:
                job_result["exception"] = e
                self.sink.emit(JobFailedEvent(error=str(e), traceback_str=traceback.format_exc()))
            finally:
                job_result["done"] = True

        worker_thread = threading.Thread(target=worker_target, daemon=True, name="ml-job-worker")
        worker_thread.start()

        refresh_interval = 1.0 / max(1.0, min(20.0, refresh_rate_hz))
        last_metrics_sample = 0.0

        try:
            with Live(
                render_dashboard(self.state, width=self.console.width, height=self.console.height),
                console=self.console,
                screen=True,
                refresh_per_second=int(refresh_rate_hz),
                auto_refresh=False,
            ) as live:
                while not job_result["done"]:
                    now = time.time()

                    # Sample system metrics every ~2 seconds
                    if now - last_metrics_sample >= 2.0:
                        sys_metrics = collect_system_metrics()
                        if sys_metrics:
                            self.sink.emit(MetricUpdateEvent(metrics=sys_metrics))
                        last_metrics_sample = now

                    # Drain events
                    self.drain_events()

                    # Check user quit (Q)
                    if self.state.should_quit_tui:
                        break

                    # Render update
                    try:
                        live.update(
                            render_dashboard(self.state, width=self.console.width, height=self.console.height),
                            refresh=True,
                        )
                    except Exception:
                        # Rich rendering failure must never break the job
                        break

                    time.sleep(refresh_interval)

                # Final drain after job finishes
                self.drain_events()
                try:
                    live.update(
                        render_dashboard(self.state, width=self.console.width, height=self.console.height),
                        refresh=True,
                    )
                except Exception:
                    pass

        except Exception as e:
            logger.warning(f"TUI rendering encountered an issue: {e}; falling back to standard terminal output.")
        finally:
            self.stop()

        # If user detached with Q or TUI stopped while job is still running, wait for worker
        if not job_result["done"]:
            self.console.print("\n[dim]TUI detached. Job continuing in background...[/dim]\n")
            worker_thread.join()

        if job_result["exception"] is not None:
            raise job_result["exception"]

        return job_result["return_value"]

