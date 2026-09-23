"""
Structured, Thread-Safe Event Hierarchy for Ananya ML Trainer TUI.

Decouples pipeline execution and worker threads from Rich terminal rendering.
Worker threads construct lightweight dataclass events and submit them to an EventQueue.
"""

from dataclasses import dataclass, field
import time
from typing import Dict, Any, Optional, List


@dataclass
class TUIEvent:
    """Base class for all TUI events with a monotonic/epoch timestamp."""

    timestamp: float = field(default_factory=time.time)


@dataclass
class JobStartedEvent(TUIEvent):
    job_type: str = "COLLECTION"  # COLLECTION, DATASET BUILD, TRAINING, EVALUATION, FULL PIPELINE
    dataset_name: Optional[str] = None
    model_name: Optional[str] = None
    total_sources: int = 0
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class JobCompletedEvent(TUIEvent):
    success: bool = True
    summary: str = "Job completed successfully"
    duration_seconds: Optional[float] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class JobFailedEvent(TUIEvent):
    error: str = "Unhandled job error"
    traceback_str: Optional[str] = None


@dataclass
class StageStartedEvent(TUIEvent):
    stage_name: str = ""
    total: Optional[int] = None
    unit: str = "items"


@dataclass
class StageProgressEvent(TUIEvent):
    stage_name: str = ""
    current: Optional[int] = None
    advance: int = 0
    total: Optional[int] = None
    metrics: Dict[str, Any] = field(default_factory=dict)
    message: Optional[str] = None


@dataclass
class StageCompletedEvent(TUIEvent):
    stage_name: str = ""
    summary: Optional[str] = None
    status: str = "completed"  # completed, warning, failed


@dataclass
class SourceStartedEvent(TUIEvent):
    source_id: str = ""
    source_name: Optional[str] = None
    source_index: int = 1
    total_sources: int = 1


@dataclass
class SourceProgressEvent(TUIEvent):
    source_id: str = ""
    status: str = "running"  # discovering, downloading, processing, completed, blocked, failed
    discovered: Optional[int] = None
    processed: Optional[int] = None
    products: Optional[int] = None
    documents: Optional[int] = None
    failed: Optional[int] = None
    rate: Optional[float] = None  # docs/min or items/sec
    eta_seconds: Optional[float] = None
    message: Optional[str] = None


@dataclass
class SourceCompletedEvent(TUIEvent):
    source_id: str = ""
    status: str = "completed"  # completed, completed with failures, blocked, failed, no_data
    products: int = 0
    documents: int = 0
    failures: int = 0
    reason: Optional[str] = None


@dataclass
class ItemProcessedEvent(TUIEvent):
    source_id: str = ""
    item_type: str = "product"  # product, document, html, pdf
    count: int = 1
    details: Optional[str] = None


@dataclass
class FailureEvent(TUIEvent):
    source_id: str = ""
    failure_type: str = "NETWORK_ERROR"  # HTTP 404, HTTP 500, ROBOTS_BLOCKED, WAF / 307, PARSE_ERROR, etc.
    url: Optional[str] = None
    error: str = ""
    status_code: Optional[int] = None


@dataclass
class MetricUpdateEvent(TUIEvent):
    metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TrainingUpdateEvent(TUIEvent):
    candidate_name: Optional[str] = None
    epoch: Optional[int] = None
    total_epochs: Optional[int] = None
    batch: Optional[int] = None
    loss: Optional[float] = None
    val_loss: Optional[float] = None
    accuracy: Optional[float] = None
    val_accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None
    learning_rate: Optional[float] = None
    throughput: Optional[float] = None
    eta_seconds: Optional[float] = None
    is_champion: bool = False
    metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EvaluationUpdateEvent(TUIEvent):
    candidate_version: str = ""
    metrics: Dict[str, Any] = field(default_factory=dict)
    quality_gates: Dict[str, bool] = field(default_factory=dict)
    promotion_eligible: bool = False


@dataclass
class ResumeHydratedEvent(TUIEvent):
    cached_records: int = 0
    previously_fetched: int = 0
    completed_sources: int = 0
    pending_sources: int = 0


@dataclass
class ContinuousCycleEvent(TUIEvent):
    cycle_number: int = 1
    interval_seconds: int = 3600
    next_run_ts: Optional[float] = None
    last_run_status: str = "completed"


@dataclass
class LogEvent(TUIEvent):
    level: str = "INFO"
    logger_name: str = "ananya.ml"
    message: str = ""


@dataclass
class UserCommandEvent(TUIEvent):
    command: str = ""  # pause, resume, quit, view_main, view_sources, view_failures, view_logs, view_training

