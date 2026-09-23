"""
Tests for Ananya ML Trainer Rich TUI.

Covers:
1. State: initial state, stage transitions, source transitions, failure aggregation, metrics updates, resume hydration, continuous mode
2. Events: event ordering, missing/partial values, concurrent thread emission
3. Formatting: numbers, durations, bytes, rates, percentages, ETA, null/NaN/infinity guards
4. Rendering: empty state, collection state, training state, failures view, logs view, many sources
5. CLI & Fallback: --tui, --no-tui, non-TTY fallback, quiet/verbose suppression
6. Safety: worker decoupling, TUI error tolerance
"""

import io
import math
import time
import threading
from unittest.mock import MagicMock, patch
import pytest

from rich.console import Console

from apps.ml.training.tui.theme import (
    COLOR_BRAND_PRIMARY,
    COLOR_SUCCESS,
    COLOR_WARNING,
    COLOR_ERROR,
)
from apps.ml.training.tui.formatters import (
    format_number,
    format_bytes,
    format_rate,
    format_percentage,
    format_duration,
    format_eta,
    render_progress_bar,
    PLACEHOLDER,
)
from apps.ml.training.tui.events import (
    TUIEvent,
    JobStartedEvent,
    JobCompletedEvent,
    JobFailedEvent,
    StageStartedEvent,
    StageProgressEvent,
    StageCompletedEvent,
    SourceStartedEvent,
    SourceProgressEvent,
    SourceCompletedEvent,
    ItemProcessedEvent,
    FailureEvent,
    MetricUpdateEvent,
    TrainingUpdateEvent,
    EvaluationUpdateEvent,
    ResumeHydratedEvent,
    ContinuousCycleEvent,
    LogEvent,
    UserCommandEvent,
)
from apps.ml.training.tui.state import TUIState, SourceState, StageState, normalize_failure_type
from apps.ml.training.tui.panels import (
    render_header,
    render_dataset_summary,
    render_pipeline,
    render_sources_summary,
    render_activity,
    render_metrics,
    render_footer,
    render_sources_view,
    render_failures_view,
    render_logs_view,
    render_training_view,
    render_dashboard,
)
from apps.ml.training.tui.app import TrainerTUI, EventSink, collect_system_metrics
from apps.ml.training.cli import build_parser, should_use_tui


# ==========================================
# 1. Formatters Tests
# ==========================================

def test_format_number():
    assert format_number(0) == "0"
    assert format_number(12345) == "12,345"
    assert format_number(12482.0) == "12,482"
    assert format_number(-100) == "-100"
    # Never render NaN, inf, None, undefined
    assert format_number(None) == PLACEHOLDER
    assert format_number(float("nan")) == PLACEHOLDER
    assert format_number(float("inf")) == PLACEHOLDER
    assert format_number("not a number") == PLACEHOLDER


def test_format_bytes():
    assert format_bytes(0) == "0 B"
    assert format_bytes(512) == "512 B"
    assert format_bytes(1024) == "1.0 KB"
    assert format_bytes(1024 * 1024 * 5.5) == "5.5 MB"
    assert format_bytes(1024 * 1024 * 1024 * 1.4) == "1.40 GB"
    assert format_bytes(-50) == PLACEHOLDER
    assert format_bytes(None) == PLACEHOLDER
    assert format_bytes(float("nan")) == PLACEHOLDER
    assert format_bytes(float("inf")) == PLACEHOLDER


def test_format_rate():
    assert format_rate(63.5, "docs/min") == "63.5 docs/min"
    assert format_rate(150.0, "docs/min") == "150 docs/min"
    assert format_rate(0, "MB/min") == "0.0 MB/min"
    assert format_rate(None) == PLACEHOLDER
    assert format_rate(float("nan")) == PLACEHOLDER
    assert format_rate(float("inf")) == PLACEHOLDER


def test_format_percentage():
    assert format_percentage(82.4) == "82.4%"
    assert format_percentage(0.9472, multiply=True) == "94.7%"
    assert format_percentage(0.0) == "0.0%"
    assert format_percentage(100.0) == "100.0%"
    assert format_percentage(150.0) == "100.0%"  # bounded
    assert format_percentage(-10.0) == "0.0%"    # bounded
    assert format_percentage(None) == PLACEHOLDER
    assert format_percentage(float("nan")) == PLACEHOLDER
    assert format_percentage(float("inf")) == PLACEHOLDER


def test_format_duration():
    assert format_duration(0) == "0s"
    assert format_duration(45) == "45s"
    assert format_duration(65) == "1m 05s"
    assert format_duration(1122) == "18m 42s"
    assert format_duration(3665) == "1h 01m"
    assert format_duration(None) == PLACEHOLDER
    assert format_duration(float("nan")) == PLACEHOLDER
    assert format_duration(float("inf")) == PLACEHOLDER


def test_format_eta():
    assert format_eta(120) == "2m 00s"
    assert format_eta(0) == PLACEHOLDER
    assert format_eta(-5) == PLACEHOLDER
    assert format_eta(None) == PLACEHOLDER
    assert format_eta(float("nan")) == PLACEHOLDER


def test_render_progress_bar():
    # 50%
    bar = render_progress_bar(50, 100, width=10)
    assert bar == "█████░░░░░"
    # 100%
    bar_full = render_progress_bar(100, 100, width=10)
    assert bar_full == "██████████"
    # 0%
    bar_empty = render_progress_bar(0, 100, width=10)
    assert bar_empty == "░░░░░░░░░░"
    # invalid / zero total
    bar_inv = render_progress_bar(None, 0, width=10)
    assert bar_inv == "░░░░░░░░░░"


# ==========================================
# 2. State & Transitions Tests
# ==========================================

def test_state_initialization():
    state = TUIState()
    assert state.overall_status == "STARTING"
    assert state.job_type == "COLLECTION"
    assert state.active_view == "MAIN"
    assert len(state.stages) == len(TUIState.CANONICAL_STAGES)
    assert state.failures == 0
    assert state.products == 0
    assert state.is_paused is False
    assert state.should_quit_tui is False


def test_state_stage_transitions():
    state = TUIState()
    # Stage started
    state.apply_event(StageStartedEvent(stage_name="Validation", total=1000, unit="records"))
    assert state.active_stage_name == "Validation"
    assert state.stages["Validation"].status == "running"
    assert state.stages["Validation"].total == 1000
    assert state.stages["Validation"].current == 0

    # Stage progress
    state.apply_event(StageProgressEvent(stage_name="Validation", current=500, metrics={"valid": 480}))
    assert state.stages["Validation"].current == 500
    assert state.stages["Validation"].progress_pct == 50.0
    assert state.valid == 480

    # Stage completed
    state.apply_event(StageCompletedEvent(stage_name="Validation", summary="1,000/1,000 verified"))
    assert state.stages["Validation"].status == "completed"
    assert state.stages["Validation"].summary == "1,000/1,000 verified"
    assert state.stages["Validation"].current == 1000


def test_state_source_transitions():
    state = TUIState()
    # Source started
    state.apply_event(SourceStartedEvent(source_id="wuerth", source_name="Wuerth Elektronik", source_index=1, total_sources=3))
    assert state.active_source_id == "wuerth"
    assert "wuerth" in state.sources
    assert state.sources["wuerth"].status == "discovering"

    # Source progress
    state.apply_event(
        SourceProgressEvent(
            source_id="wuerth",
            status="downloading",
            products=150,
            documents=25,
            failed=2,
            rate=45.2,
            eta_seconds=180.0,
        )
    )
    src = state.sources["wuerth"]
    assert src.status == "downloading"
    assert src.products == 150
    assert src.documents == 25
    assert src.failed == 2
    assert src.rate == 45.2
    assert src.eta_seconds == 180.0

    # Source completed
    state.apply_event(
        SourceCompletedEvent(
            source_id="wuerth",
            status="completed",
            products=200,
            documents=30,
            failures=2,
            reason="Finished all pages",
        )
    )
    assert src.status == "completed"
    assert src.products == 200
    assert src.reason == "Finished all pages"


def test_state_failure_normalization_and_aggregation():
    state = TUIState()

    # Normalize various raw errors
    assert normalize_failure_type("HTTP_ERROR", status_code=404) == "HTTP 404"
    assert normalize_failure_type("HTTP_ERROR", status_code=500) == "HTTP 500"
    assert normalize_failure_type("WAF_BLOCKED", error="Blocked by Cloudflare 307") == "WAF / 307"
    assert normalize_failure_type("ROBOTS", error="Disallowed by robots.txt") == "ROBOTS_BLOCKED"
    assert normalize_failure_type("NETWORK", error="Connection timeout", status_code=599) == "NETWORK_ERROR"
    assert normalize_failure_type("PARSER", error="PDF corrupt parse error") == "PARSE_ERROR"

    # Apply failure events
    state.sources["mfg1"] = MagicMock(failed=0)
    state.apply_event(FailureEvent(source_id="mfg1", failure_type="HTTP_ERROR", status_code=404, error="Not found"))
    state.apply_event(FailureEvent(source_id="mfg1", failure_type="HTTP_ERROR", status_code=404, error="Not found"))
    state.apply_event(FailureEvent(source_id="mfg1", failure_type="NETWORK", status_code=599, error="Timeout"))

    assert state.failures == 3
    assert state.failures_by_type["HTTP 404"] == 2
    assert state.failures_by_type["NETWORK_ERROR"] == 1
    assert len(state.recent_failures) == 3


def test_state_resume_hydration():
    state = TUIState()
    state.apply_event(
        ResumeHydratedEvent(
            cached_records=3580,
            previously_fetched=3796,
            completed_sources=16,
            pending_sources=14,
        )
    )
    assert state.is_resumed is True
    assert state.cached_records_recovered == 3580
    assert state.previously_fetched_recovered == 3796
    assert state.completed_sources_recovered == 16
    assert state.pending_sources_recovered == 14
    assert state.cached == 3580


def test_state_continuous_cycle():
    state = TUIState()
    next_ts = time.time() + 3600
    state.apply_event(
        ContinuousCycleEvent(
            cycle_number=4,
            interval_seconds=3600,
            next_run_ts=next_ts,
            last_run_status="completed",
        )
    )
    assert state.is_continuous is True
    assert state.continuous_cycle == 4
    assert state.continuous_interval == 3600
    assert state.continuous_next_run_ts == next_ts


def test_state_training_and_evaluation_updates():
    state = TUIState()

    # Training update
    state.apply_event(
        TrainingUpdateEvent(
            candidate_name="char_ngram_model",
            accuracy=0.92,
            val_accuracy=0.91,
            epoch=1,
            total_epochs=5,
            loss=0.25,
            metrics={"training_time_ms": 120.5},
        )
    )
    assert "char_ngram_model" in state.training_candidates
    assert state.training_candidates["char_ngram_model"]["val_accuracy"] == 0.91
    assert state.training_epoch == 1
    assert state.training_loss == 0.25

    # Champion update
    state.apply_event(
        TrainingUpdateEvent(
            candidate_name="hybrid_union_model",
            val_accuracy=0.95,
            is_champion=True,
        )
    )
    assert state.champion_model == "hybrid_union_model"

    # Evaluation update
    state.apply_event(
        EvaluationUpdateEvent(
            candidate_version="1.4.0",
            metrics={"candidate_top1_accuracy": 0.95, "weighted_f1": 0.94},
            quality_gates={"accuracy_gate": True, "latency_gate": True},
            promotion_eligible=True,
        )
    )
    assert state.evaluation_metrics["candidate_top1_accuracy"] == 0.95
    assert state.quality_gates["accuracy_gate"] is True
    assert state.promotion_eligible is True


def test_state_user_command_events():
    state = TUIState()

    state.apply_event(UserCommandEvent(command="pause"))
    assert state.is_paused is True
    assert state.overall_status == "PAUSED"

    state.apply_event(UserCommandEvent(command="resume"))
    assert state.is_paused is False
    assert state.overall_status == "RUNNING"

    state.apply_event(UserCommandEvent(command="view_sources"))
    assert state.active_view == "SOURCES"

    state.apply_event(UserCommandEvent(command="view_failures"))
    assert state.active_view == "FAILURES"

    state.apply_event(UserCommandEvent(command="view_logs"))
    assert state.active_view == "LOGS"

    state.apply_event(UserCommandEvent(command="view_training"))
    assert state.active_view == "TRAINING"

    state.apply_event(UserCommandEvent(command="view_main"))
    assert state.active_view == "MAIN"

    state.apply_event(UserCommandEvent(command="quit"))
    assert state.should_quit_tui is True


# ==========================================
# 3. Events & Concurrency Tests
# ==========================================

def test_event_ordering_in_tui():
    tui = TrainerTUI()
    tui.sink.emit(JobStartedEvent(job_type="COLLECTION"))
    tui.sink.emit(StageStartedEvent(stage_name="Collection", total=50))
    tui.sink.emit(StageProgressEvent(stage_name="Collection", current=25))
    tui.sink.emit(StageCompletedEvent(stage_name="Collection", summary="50/50 completed"))
    tui.sink.emit(JobCompletedEvent(success=True))

    drained = tui.drain_events()
    assert drained == 5
    assert tui.state.job_type == "COLLECTION"
    assert tui.state.stages["Collection"].status == "completed"
    assert tui.state.overall_status == "COMPLETED"


def test_concurrent_event_submission():
    tui = TrainerTUI()
    sink = tui.sink

    def worker(worker_id: int):
        for i in range(50):
            sink.emit(ItemProcessedEvent(source_id=f"src-{worker_id}", item_type="product", count=1))
            if i % 10 == 0:
                sink.emit(FailureEvent(source_id=f"src-{worker_id}", failure_type="NETWORK_ERROR", error="Timeout"))

    threads = [threading.Thread(target=worker, args=(wid,)) for wid in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    tui.drain_events(max_count=1000)
    assert tui.state.products == 200
    assert tui.state.failures == 20


def test_missing_values_in_events():
    state = TUIState()
    # Emitting events with minimal / missing fields must never crash
    state.apply_event(JobStartedEvent())
    state.apply_event(StageStartedEvent())
    state.apply_event(StageProgressEvent())
    state.apply_event(StageCompletedEvent())
    state.apply_event(SourceStartedEvent())
    state.apply_event(SourceProgressEvent())
    state.apply_event(SourceCompletedEvent())
    state.apply_event(FailureEvent())
    state.apply_event(MetricUpdateEvent())
    state.apply_event(TrainingUpdateEvent())
    state.apply_event(EvaluationUpdateEvent())
    state.apply_event(LogEvent())
    assert state.overall_status == "RUNNING"


# ==========================================
# 4. Rendering Tests
# ==========================================

def test_rendering_empty_state():
    state = TUIState()
    console = Console(file=io.StringIO(), width=100, height=35)
    layout = render_dashboard(state, width=100, height=35)
    console.print(layout)
    output = console.file.getvalue()
    assert "ANANYA ML TRAINER" in output
    assert "DATASET" in output
    assert "PIPELINE" in output
    assert "SOURCES" in output
    assert "METRICS" in output


def test_rendering_collection_state():
    state = TUIState()
    state.dataset_name = "dataset-crawl-1790168426"
    state.model_name = "category-v3"
    state.products = 12482
    state.valid = 12103
    state.quarantined = 379
    state.task_examples = 108421
    state.discovered = 15000
    state.downloaded = 8000
    state.cached = 5000
    state.pdfs = 1200
    state.docs_per_min = 63.5
    state.mb_per_min = 194.0

    state.stages["Collection"].status = "completed"
    state.stages["Collection"].summary = "30/30 sources"
    state.stages["Normalization"].status = "completed"
    state.stages["Normalization"].summary = "12,482/12,482"
    state.stages["Deduplication"].status = "running"
    state.stages["Deduplication"].current = 11931
    state.stages["Deduplication"].total = 12103

    state.sources["wuerth"] = SourceState(id="wuerth", status="completed", products=2373, failed=104)
    state.sources["adafruit"] = SourceState(id="adafruit", status="completed", products=1241, failed=113)
    state.sources["microchip"] = SourceState(id="microchip", status="running", products=1820, failed=12)

    console = Console(file=io.StringIO(), width=120, height=40)
    console.print(render_dashboard(state))
    output = console.file.getvalue()

    assert "dataset-crawl-1790168426" in output
    assert "12,482" in output
    assert "12,103" in output
    assert "379" in output
    assert "wuerth" in output
    assert "adafruit" in output
    assert "microchip" in output


def test_rendering_many_sources_overflow():
    state = TUIState()
    # Add 50 sources
    for i in range(50):
        state.sources[f"source-{i:02d}"] = SourceState(
            id=f"source-{i:02d}",
            status="completed" if i < 30 else "running",
            products=i * 10,
            failed=i,
        )

    # In main dashboard, only a subset should be rendered with indicator
    panel = render_sources_summary(state, max_rows=5)
    console = Console(file=io.StringIO(), width=100)
    console.print(panel)
    output = console.file.getvalue()
    assert "more sources" in output

    # In full sources view, all are listed
    full_panel = render_sources_view(state)
    console2 = Console(file=io.StringIO(), width=120)
    console2.print(full_panel)
    out2 = console2.file.getvalue()
    assert "source-49" in out2


def test_rendering_failures_view():
    state = TUIState()
    state.active_view = "FAILURES"
    state.failures = 125
    state.failures_by_type["HTTP 404"] = 56
    state.failures_by_type["DISALLOWED_CONTENT"] = 41
    state.failures_by_type["ROBOTS_BLOCKED"] = 12
    state.recent_failures.append(
        MagicMock(
            time_str="12:00:01",
            source_id="wuerth",
            failure_type="HTTP 404",
            status_code=404,
            error="Resource missing",
        )
    )

    console = Console(file=io.StringIO(), width=120, height=40)
    console.print(render_dashboard(state))
    output = console.file.getvalue()

    assert "FAILURE BREAKDOWN" in output
    assert "HTTP 404" in output
    assert "56" in output
    assert "DISALLOWED_CONTENT" in output
    assert "ROBOTS_BLOCKED" in output


def test_rendering_training_view():
    state = TUIState()
    state.active_view = "TRAINING"
    state.training_epoch = 14
    state.training_total_epochs = 50
    state.training_loss = 0.1832
    state.training_val_loss = 0.2214
    state.training_accuracy = 0.9472
    state.training_f1 = 0.9381
    state.training_lr = 0.0003
    state.champion_model = "hybrid_union_model"
    state.training_candidates["char_ngram_model"] = {"val_accuracy": 0.912, "training_time_ms": 150.2}
    state.training_candidates["hybrid_union_model"] = {"val_accuracy": 0.947, "training_time_ms": 320.1}

    state.evaluation_metrics = {"candidate_top1_accuracy": 0.947, "weighted_f1": 0.938}
    state.quality_gates = {"accuracy_gate": True, "duplicate_precision_gate": True, "latency_gate": False}

    console = Console(file=io.StringIO(), width=120, height=40)
    console.print(render_dashboard(state))
    output = console.file.getvalue()

    assert "TRAINING PROGRESS" in output
    assert "14 / 50" in output
    assert "0.1832" in output
    assert "94.7%" in output
    assert "hybrid_union_model" in output
    assert "EVALUATION & QUALITY GATES" in output
    assert "Accuracy Gate" in output
    assert "PASS" in output
    assert "FAIL" in output


def test_rendering_logs_view():
    state = TUIState()
    state.active_view = "LOGS"
    state.logs_buffer.append(
        MagicMock(time_str="10:15:30", level="INFO", logger_name="ananya.ml", message="Model checkpoint saved")
    )
    console = Console(file=io.StringIO(), width=100, height=30)
    console.print(render_dashboard(state))
    output = console.file.getvalue()
    assert "LOG STREAM" in output
    assert "Model checkpoint saved" in output


# ==========================================
# 5. CLI & Fallback Tests
# ==========================================

def test_cli_tui_flags_parsing():
    parser = build_parser()

    # Default None
    args1 = parser.parse_args(["collect", "--source", "test"])
    assert getattr(args1, "tui", None) is None

    # Explicit --tui
    args2 = parser.parse_args(["collect", "--tui"])
    assert args2.tui is True

    # Explicit --no-tui
    args3 = parser.parse_args(["collect", "--no-tui"])
    assert args3.tui is False

    # Subcommand flag propagation
    args4 = parser.parse_args(["train", "--tui"])
    assert args4.tui is True

    args5 = parser.parse_args(["train", "--no-tui"])
    assert args5.tui is False


def test_should_use_tui_conditions():
    # Explicit --no-tui overrides everything
    args_no = MagicMock(tui=False, quiet=False, verbose=False)
    assert should_use_tui(args_no) is False

    # Explicit --tui enables
    args_yes = MagicMock(tui=True, quiet=False, verbose=False)
    assert should_use_tui(args_yes) is True

    # In non-TTY mode without explicit flag -> False
    with patch("sys.stdout.isatty", return_value=False):
        args_default = MagicMock(tui=None, quiet=False, verbose=False)
        assert should_use_tui(args_default) is False

    # In TTY mode without flags -> True
    with patch("sys.stdout.isatty", return_value=True):
        args_default_tty = MagicMock(tui=None, quiet=False, verbose=False)
        assert should_use_tui(args_default_tty) is True

        # In TTY mode with --quiet -> False
        args_quiet = MagicMock(tui=None, quiet=True, verbose=False)
        assert should_use_tui(args_quiet) is False

        # In TTY mode with --verbose -> False
        args_verbose = MagicMock(tui=None, quiet=False, verbose=True)
        assert should_use_tui(args_verbose) is False


# ==========================================
# 6. Safety & Exception Handling Tests
# ==========================================

def test_tui_run_job_success():
    tui = TrainerTUI(console=Console(file=io.StringIO()))

    def mock_job(x: int) -> int:
        return x * 2

    # run_job executes worker and returns value
    result = tui.run_job(mock_job, 21, refresh_rate_hz=10.0)
    assert result == 42
    assert tui.state.overall_status == "COMPLETED"


def test_tui_run_job_propagates_worker_exception():
    tui = TrainerTUI(console=Console(file=io.StringIO()))

    def failing_job():
        raise RuntimeError("Worker simulated failure")

    with pytest.raises(RuntimeError, match="Worker simulated failure"):
        tui.run_job(failing_job, refresh_rate_hz=10.0)

    assert tui.state.overall_status == "FAILED"


def test_system_metrics_safe_fallback():
    # Calling collect_system_metrics must never raise an exception even if psutil is absent
    metrics = collect_system_metrics()
    assert isinstance(metrics, dict)
