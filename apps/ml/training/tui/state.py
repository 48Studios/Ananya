"""
Thread-Safe TUI State Machine for Ananya ML Trainer.

Maintains structured, observable state mutated strictly via event application.
Zero direct manipulation from external worker threads.
"""

from collections import deque
from dataclasses import dataclass, field
import re
import time
from typing import Dict, Any, Optional, List, Deque

from .events import (
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


@dataclass
class SourceState:
    id: str
    name: str = ""
    status: str = "pending"  # pending, discovering, downloading, processing, completed, completed with failures, blocked, failed, no_data
    discovered: int = 0
    processed: int = 0
    products: int = 0
    documents: int = 0
    failed: int = 0
    rate: Optional[float] = None
    eta_seconds: Optional[float] = None
    reason: Optional[str] = None


@dataclass
class StageState:
    name: str
    status: str = "pending"  # pending, running, completed, warning, failed
    current: Optional[int] = None
    total: Optional[int] = None
    unit: str = "items"
    summary: Optional[str] = None

    @property
    def progress_pct(self) -> Optional[float]:
        if self.total and self.total > 0 and self.current is not None:
            return max(0.0, min(100.0, (self.current / self.total) * 100.0))
        return None


@dataclass
class ActivityItem:
    timestamp: float
    message: str
    level: str = "INFO"

    @property
    def time_str(self) -> str:
        t = time.localtime(self.timestamp)
        return time.strftime("%H:%M:%S", t)


@dataclass
class FailureItem:
    timestamp: float
    source_id: str
    failure_type: str
    url: Optional[str]
    error: str
    status_code: Optional[int]

    @property
    def time_str(self) -> str:
        t = time.localtime(self.timestamp)
        return time.strftime("%H:%M:%S", t)


@dataclass
class LogItem:
    timestamp: float
    level: str
    logger_name: str
    message: str

    @property
    def time_str(self) -> str:
        t = time.localtime(self.timestamp)
        return time.strftime("%H:%M:%S", t)


def normalize_failure_type(raw_type: str, error: str = "", status_code: Optional[int] = None) -> str:
    """Normalizes raw error strings and status codes into canonical categories."""
    combined = f"{raw_type} {error} {status_code or ''}".lower()
    if status_code == 404 or "404" in combined:
        return "HTTP 404"
    if status_code == 500 or "500" in combined:
        return "HTTP 500"
    if "waf" in combined or "307" in combined or status_code == 307 or "cloudflare" in combined:
        return "WAF / 307"
    if "robot" in combined:
        return "ROBOTS_BLOCKED"
    if "disallowed" in combined or "content_type" in combined:
        return "DISALLOWED_CONTENT"
    if "file_size" in combined or "exceeds" in combined:
        return "FILE_SIZE_LIMIT"
    if "parse" in combined or "corrupt" in combined:
        return "PARSE_ERROR"
    if "network" in combined or "timeout" in combined or "connect" in combined or status_code == 599:
        return "NETWORK_ERROR"
    if raw_type:
        clean = re.sub(r"[^A-Za-z0-9_ /]", "", raw_type).strip().upper()
        if clean:
            return clean[:20]
    return "OTHER_ERROR"


class TUIState:
    """
    Central state container for the Rich terminal user interface.
    """

    CANONICAL_STAGES = [
        "Collection",
        "Normalization",
        "Validation",
        "Deduplication",
        "Cross-source matching",
        "Task generation",
        "Dataset split",
        "Training",
        "Evaluation",
        "Deployment",
    ]

    def __init__(self):
        # Header and Job
        self.job_type: str = "COLLECTION"
        self.dataset_name: Optional[str] = None
        self.model_name: Optional[str] = None
        self.overall_status: str = "STARTING"  # STARTING, RUNNING, PAUSED, COMPLETED, FAILED, INTERRUPTED
        self.start_time: float = time.time()
        self.end_time: Optional[float] = None
        self.active_view: str = "MAIN"  # MAIN, SOURCES, FAILURES, LOGS, TRAINING

        # Continuous mode
        self.is_continuous: bool = False
        self.continuous_cycle: int = 1
        self.continuous_interval: int = 3600
        self.continuous_next_run_ts: Optional[float] = None
        self.continuous_last_status: str = "none"

        # Resume state
        self.is_resumed: bool = False
        self.cached_records_recovered: int = 0
        self.previously_fetched_recovered: int = 0
        self.completed_sources_recovered: int = 0
        self.pending_sources_recovered: int = 0

        # Dataset Counters
        self.discovered: int = 0
        self.downloaded: int = 0
        self.cached: int = 0
        self.skipped: int = 0
        self.products: int = 0
        self.valid: int = 0
        self.quarantined: int = 0
        self.duplicates: int = 0
        self.task_examples: int = 0
        self.documents: int = 0
        self.pdfs: int = 0
        self.failures: int = 0

        # Stages
        self.stages: Dict[str, StageState] = {
            s: StageState(name=s, status="pending") for s in self.CANONICAL_STAGES
        }
        self.active_stage_name: Optional[str] = None

        # Sources
        self.sources: Dict[str, SourceState] = {}
        self.active_source_id: Optional[str] = None
        self.total_sources_configured: int = 0

        # Failures
        self.failures_by_type: Dict[str, int] = {}
        self.recent_failures: Deque[FailureItem] = deque(maxlen=50)

        # Activity Feed & Logs
        self.activity_feed: Deque[ActivityItem] = deque(maxlen=16)
        self.logs_buffer: Deque[LogItem] = deque(maxlen=250)

        # Metrics
        self.docs_per_min: Optional[float] = None
        self.mb_per_min: Optional[float] = None
        self.products_per_min: Optional[float] = None
        self.avg_pdf_parse_time_ms: Optional[float] = None
        self.avg_download_time_ms: Optional[float] = None
        self.retries: int = 0
        self.cache_hits: int = 0
        self.cache_misses: int = 0
        self.active_workers: int = 1
        self.system_cpu_percent: Optional[float] = None
        self.system_memory_mb: Optional[float] = None
        self.system_disk_free_gb: Optional[float] = None
        self.system_gpu_utilization: Optional[float] = None
        self.system_vram_mb: Optional[float] = None
        self.overall_eta_seconds: Optional[float] = None

        # Training
        self.training_epoch: Optional[int] = None
        self.training_total_epochs: Optional[int] = None
        self.training_batch: Optional[int] = None
        self.training_loss: Optional[float] = None
        self.training_val_loss: Optional[float] = None
        self.training_accuracy: Optional[float] = None
        self.training_f1: Optional[float] = None
        self.training_lr: Optional[float] = None
        self.training_throughput: Optional[float] = None
        self.training_candidates: Dict[str, Dict[str, Any]] = {}
        self.champion_model: Optional[str] = None

        # Evaluation
        self.evaluation_metrics: Dict[str, Any] = {}
        self.quality_gates: Dict[str, bool] = {}
        self.promotion_eligible: Optional[bool] = None

        # User interaction
        self.is_paused: bool = False
        self.should_quit_tui: bool = False

    @property
    def elapsed_seconds(self) -> float:
        end = self.end_time or time.time()
        return max(0.0, end - self.start_time)

    def add_activity(self, message: str, level: str = "INFO") -> None:
        """Pushes an event to the rolling activity feed."""
        if not message:
            return
        self.activity_feed.appendleft(ActivityItem(timestamp=time.time(), message=message, level=level))

    def apply_event(self, event: TUIEvent) -> None:
        """Applies an incoming TUI event to state."""
        if isinstance(event, JobStartedEvent):
            self.job_type = event.job_type
            if event.dataset_name:
                self.dataset_name = event.dataset_name
            if event.model_name:
                self.model_name = event.model_name
            if event.total_sources > 0:
                self.total_sources_configured = event.total_sources
            self.overall_status = "RUNNING"
            self.add_activity(f"Job started: {self.job_type}")

        elif isinstance(event, JobCompletedEvent):
            self.overall_status = "COMPLETED"
            self.end_time = time.time()
            self.add_activity(f"Job completed: {event.summary}", level="SUCCESS")

        elif isinstance(event, JobFailedEvent):
            self.overall_status = "FAILED"
            self.end_time = time.time()
            self.add_activity(f"Job failed: {event.error}", level="ERROR")

        elif isinstance(event, StageStartedEvent):
            canonical = self._match_stage_name(event.stage_name)
            self.active_stage_name = canonical
            stage = self.stages.get(canonical)
            if not stage:
                stage = StageState(name=canonical)
                self.stages[canonical] = stage
            stage.status = "running"
            stage.total = event.total
            stage.current = 0
            stage.unit = event.unit
            self.add_activity(f"Stage started: {canonical}")

        elif isinstance(event, StageProgressEvent):
            canonical = self._match_stage_name(event.stage_name)
            stage = self.stages.get(canonical)
            if stage:
                if event.total is not None:
                    stage.total = event.total
                if event.current is not None:
                    stage.current = event.current
                else:
                    stage.current = (stage.current or 0) + event.advance

            # Update metrics from stage progress
            if event.metrics:
                self._update_metrics(event.metrics)

        elif isinstance(event, StageCompletedEvent):
            canonical = self._match_stage_name(event.stage_name)
            stage = self.stages.get(canonical)
            if stage:
                stage.status = "completed" if event.status == "completed" else "warning"
                stage.summary = event.summary
                if stage.total and (stage.current is None or stage.current < stage.total):
                    stage.current = stage.total
            self.add_activity(f"Stage completed: {canonical} {f'({event.summary})' if event.summary else ''}")

        elif isinstance(event, SourceStartedEvent):
            self.active_source_id = event.source_id
            src = self.sources.get(event.source_id)
            if not src:
                src = SourceState(id=event.source_id, name=event.source_name or event.source_id)
                self.sources[event.source_id] = src
            src.status = "discovering"
            self.add_activity(f"Source started: {event.source_id} ({event.source_index}/{event.total_sources})")

        elif isinstance(event, SourceProgressEvent):
            src = self.sources.get(event.source_id)
            if not src:
                src = SourceState(id=event.source_id, name=event.source_id)
                self.sources[event.source_id] = src
            if event.status:
                src.status = event.status
            if event.discovered is not None:
                src.discovered = event.discovered
            if event.processed is not None:
                src.processed = event.processed
            if event.products is not None:
                src.products = event.products
            if event.documents is not None:
                src.documents = event.documents
            if event.failed is not None:
                src.failed = event.failed
            if event.rate is not None:
                src.rate = event.rate
            if event.eta_seconds is not None:
                src.eta_seconds = event.eta_seconds

        elif isinstance(event, SourceCompletedEvent):
            src = self.sources.get(event.source_id)
            if not src:
                src = SourceState(id=event.source_id, name=event.source_id)
                self.sources[event.source_id] = src
            src.status = event.status
            src.products = event.products
            src.documents = event.documents
            src.failed = event.failures
            src.reason = event.reason
            self.add_activity(f"Source completed: {event.source_id} ({event.status})")

        elif isinstance(event, ItemProcessedEvent):
            if event.item_type in ("product", "products"):
                self.products += event.count
            elif event.item_type in ("document", "documents", "pdf", "pdfs"):
                self.documents += event.count
                if "pdf" in event.item_type:
                    self.pdfs += event.count

        elif isinstance(event, FailureEvent):
            self.failures += 1
            norm_type = normalize_failure_type(event.failure_type, event.error, event.status_code)
            self.failures_by_type[norm_type] = self.failures_by_type.get(norm_type, 0) + 1
            item = FailureItem(
                timestamp=event.timestamp,
                source_id=event.source_id,
                failure_type=norm_type,
                url=event.url,
                error=event.error,
                status_code=event.status_code,
            )
            self.recent_failures.appendleft(item)
            if event.source_id and event.source_id in self.sources:
                self.sources[event.source_id].failed += 1

        elif isinstance(event, MetricUpdateEvent):
            self._update_metrics(event.metrics)

        elif isinstance(event, TrainingUpdateEvent):
            if event.candidate_name:
                cand_data = self.training_candidates.setdefault(event.candidate_name, {})
                if event.val_accuracy is not None:
                    cand_data["val_accuracy"] = event.val_accuracy
                if event.accuracy is not None:
                    cand_data["accuracy"] = event.accuracy
                if event.loss is not None:
                    cand_data["loss"] = event.loss
                if event.f1 is not None:
                    cand_data["f1"] = event.f1
                if event.metrics:
                    cand_data.update(event.metrics)
            if event.epoch is not None:
                self.training_epoch = event.epoch
            if event.total_epochs is not None:
                self.training_total_epochs = event.total_epochs
            if event.loss is not None:
                self.training_loss = event.loss
            if event.val_loss is not None:
                self.training_val_loss = event.val_loss
            if event.accuracy is not None:
                self.training_accuracy = event.accuracy
            if event.f1 is not None:
                self.training_f1 = event.f1
            if event.learning_rate is not None:
                self.training_lr = event.learning_rate
            if event.throughput is not None:
                self.training_throughput = event.throughput
            if event.is_champion and event.candidate_name:
                self.champion_model = event.candidate_name
                self.add_activity(f"Champion model selected: {event.candidate_name}")

        elif isinstance(event, EvaluationUpdateEvent):
            if event.metrics:
                self.evaluation_metrics.update(event.metrics)
            if event.quality_gates:
                self.quality_gates.update(event.quality_gates)
            if event.promotion_eligible is not None:
                self.promotion_eligible = event.promotion_eligible
            self.add_activity(f"Evaluation report generated: eligible={self.promotion_eligible}")

        elif isinstance(event, ResumeHydratedEvent):
            self.is_resumed = True
            self.cached_records_recovered = event.cached_records
            self.previously_fetched_recovered = event.previously_fetched
            self.completed_sources_recovered = event.completed_sources
            self.pending_sources_recovered = event.pending_sources
            self.cached = event.cached_records
            self.discovered = event.previously_fetched
            self.add_activity(
                f"Resumed crawl state: {event.cached_records:,} cached, {event.completed_sources} completed sources"
            )

        elif isinstance(event, ContinuousCycleEvent):
            self.is_continuous = True
            self.continuous_cycle = event.cycle_number
            self.continuous_interval = event.interval_seconds
            self.continuous_next_run_ts = event.next_run_ts
            self.continuous_last_status = event.last_run_status
            self.add_activity(f"Continuous cycle #{event.cycle_number} started (interval {event.interval_seconds}s)")

        elif isinstance(event, LogEvent):
            self.logs_buffer.appendleft(
                LogItem(
                    timestamp=event.timestamp,
                    level=event.level,
                    logger_name=event.logger_name,
                    message=event.message,
                )
            )

        elif isinstance(event, UserCommandEvent):
            cmd = event.command.lower().strip()
            if cmd == "pause":
                self.is_paused = True
                self.overall_status = "PAUSED"
                self.add_activity("User paused job")
            elif cmd == "resume":
                self.is_paused = False
                self.overall_status = "RUNNING"
                self.add_activity("User resumed job")
            elif cmd in ("quit", "q"):
                self.should_quit_tui = True
                self.add_activity("User requested TUI exit (job continues)")
            elif cmd in ("view_main", "m"):
                self.active_view = "MAIN"
            elif cmd in ("view_sources", "s"):
                self.active_view = "SOURCES"
            elif cmd in ("view_failures", "f"):
                self.active_view = "FAILURES"
            elif cmd in ("view_logs", "l"):
                self.active_view = "LOGS"
            elif cmd in ("view_training", "t"):
                self.active_view = "TRAINING"

    def _match_stage_name(self, raw_name: str) -> str:
        """Matches a freeform stage title to a canonical pipeline stage name."""
        low = raw_name.lower()
        if "normaliz" in low:
            return "Normalization"
        if "validat" in low or "quarantine" in low:
            return "Validation"
        if "dedupe" in low or "deduplicat" in low:
            return "Deduplication"
        if "cross" in low:
            return "Cross-source matching"
        if "task" in low or "generat" in low:
            return "Task generation"
        if "split" in low:
            return "Dataset split"
        if "train" in low or "candidate" in low:
            return "Training"
        if "evaluat" in low:
            return "Evaluation"
        if "deploy" in low:
            return "Deployment"
        if "discover" in low or "download" in low or "page" in low or "document" in low or "collect" in low:
            return "Collection"
        return raw_name.strip()

    def _update_metrics(self, m: Dict[str, Any]) -> None:
        """Updates internal live metrics from progress dictionaries."""
        if "products" in m:
            self.products = int(m["products"])
        if "valid" in m:
            self.valid = int(m["valid"])
        if "quarantined" in m:
            self.quarantined = int(m["quarantined"])
        if "duplicates" in m:
            self.duplicates = int(m["duplicates"])
        if "downloaded" in m:
            self.downloaded = int(m["downloaded"])
        if "cached" in m:
            self.cached = int(m["cached"])
        if "failed" in m:
            self.failures = int(m["failed"])
        if "skipped" in m:
            self.skipped = int(m["skipped"])
        if "pdfs" in m:
            self.pdfs = int(m["pdfs"])
        if "docs/min" in m:
            try:
                self.docs_per_min = float(m["docs/min"])
            except (ValueError, TypeError):
                pass
        if "workers" in m:
            try:
                self.active_workers = int(m["workers"])
            except (ValueError, TypeError):
                pass
        if "retries" in m:
            try:
                self.retries = int(m["retries"])
            except (ValueError, TypeError):
                pass
        if "cpu" in m:
            try:
                self.system_cpu_percent = float(m["cpu"])
            except (ValueError, TypeError):
                pass
        if "memory" in m:
            try:
                self.system_memory_mb = float(m["memory"])
            except (ValueError, TypeError):
                pass
        if "disk_free" in m:
            try:
                self.system_disk_free_gb = float(m["disk_free"])
            except (ValueError, TypeError):
                pass
        if "ETA" in m:
            # If formatted duration string, don't parse, or if float, store
            eta_val = m["ETA"]
            if isinstance(eta_val, (int, float)):
                self.overall_eta_seconds = float(eta_val)

