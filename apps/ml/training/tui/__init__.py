"""
Ananya ML Trainer — Production Rich TUI Package.
"""

from .theme import TUI_THEME, COLOR_BRAND_PRIMARY
from .formatters import (
    format_number,
    format_bytes,
    format_rate,
    format_percentage,
    format_duration,
    format_eta,
    render_progress_bar,
)
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
from .state import TUIState, SourceState, StageState
from .panels import render_dashboard
from .app import TrainerTUI, EventSink, get_event_sink, emit_event

__all__ = [
    "TrainerTUI",
    "EventSink",
    "get_event_sink",
    "emit_event",
    "TUIState",
    "SourceState",
    "StageState",
    "TUI_THEME",
    "COLOR_BRAND_PRIMARY",
    "render_dashboard",
    "format_number",
    "format_bytes",
    "format_rate",
    "format_percentage",
    "format_duration",
    "format_eta",
    "render_progress_bar",
    "TUIEvent",
    "JobStartedEvent",
    "JobCompletedEvent",
    "JobFailedEvent",
    "StageStartedEvent",
    "StageProgressEvent",
    "StageCompletedEvent",
    "SourceStartedEvent",
    "SourceProgressEvent",
    "SourceCompletedEvent",
    "ItemProcessedEvent",
    "FailureEvent",
    "MetricUpdateEvent",
    "TrainingUpdateEvent",
    "EvaluationUpdateEvent",
    "ResumeHydratedEvent",
    "ContinuousCycleEvent",
    "LogEvent",
    "UserCommandEvent",
]

