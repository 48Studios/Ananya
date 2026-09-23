"""
Production Rich Panels and Layout Builders for Ananya ML Trainer.

Provides renderers for:
- Header (Job, dataset, model, status, elapsed)
- Dataset Summary (counters grid)
- Pipeline Progress (stages, status glyphs, progress bars)
- Sources Table (compact main view + expanded detail view)
- Current Activity (rolling timestamped events)
- Metrics (throughput, network, CPU, RAM, errors)
- Failures View (normalized failure aggregation + recent failure log)
- Logs View (in-memory activity buffer)
- Training / Evaluation View (candidate models, quality gates, metrics)
"""

from typing import Optional, List, Dict, Any
from rich import box
from rich.align import Align
from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .theme import (
    COLOR_BRAND_PRIMARY,
    COLOR_SUCCESS,
    COLOR_WARNING,
    COLOR_ERROR,
    COLOR_INFO,
    COLOR_MUTED,
    COLOR_TEXT,
    SYM_PENDING,
    SYM_RUNNING,
    SYM_COMPLETED,
    SYM_WARNING,
    SYM_FAILED,
    SYM_BULLET,
    PANEL_BOX,
    TABLE_BOX,
)
from .formatters import (
    format_number,
    format_bytes,
    format_rate,
    format_percentage,
    format_duration,
    format_eta,
    render_progress_bar,
    PLACEHOLDER,
)
from .state import TUIState, SourceState, StageState


def render_header(state: TUIState) -> Panel:
    """Renders the top branding and job status header."""
    header_table = Table.grid(expand=True)
    header_table.add_column(ratio=1)
    header_table.add_column(ratio=1)

    ds_str = state.dataset_name or PLACEHOLDER
    mod_str = state.model_name or PLACEHOLDER
    elapsed_str = format_duration(state.elapsed_seconds)

    # Status formatting
    stat = state.overall_status.upper()
    if stat in ("RUNNING", "TRAINING"):
        status_text = Text.from_markup(f"[{COLOR_SUCCESS}]{SYM_BULLET} {stat}[/]")
    elif stat in ("COMPLETED", "SUCCESS"):
        status_text = Text.from_markup(f"[{COLOR_SUCCESS}]{SYM_COMPLETED} COMPLETED[/]")
    elif stat == "PAUSED":
        status_text = Text.from_markup(f"[{COLOR_WARNING}]{SYM_BULLET} PAUSED[/]")
    elif stat in ("FAILED", "ERROR"):
        status_text = Text.from_markup(f"[{COLOR_ERROR}]{SYM_FAILED} FAILED[/]")
    elif stat == "INTERRUPTED":
        status_text = Text.from_markup(f"[{COLOR_WARNING}]{SYM_WARNING} INTERRUPTED[/]")
    else:
        status_text = Text.from_markup(f"[{COLOR_INFO}]{SYM_BULLET} {stat}[/]")

    row1 = Text.assemble(
        ("Dataset: ", f"bold {COLOR_MUTED}"),
        (ds_str, "bold white"),
    )
    row1_right = Text.assemble(
        ("Model: ", f"bold {COLOR_MUTED}"),
        (mod_str, "bold white"),
    )

    row2 = Text.assemble(
        ("Status: ", f"bold {COLOR_MUTED}"),
        status_text,
    )
    row2_right = Text.assemble(
        ("Elapsed: ", f"bold {COLOR_MUTED}"),
        (elapsed_str, "bold white"),
    )

    header_table.add_row(row1, row1_right)
    header_table.add_row(row2, row2_right)

    # Extra line if continuous mode or resume is active
    if state.is_continuous or state.is_resumed:
        row3 = Text()
        if state.is_continuous:
            next_run_str = (
                format_duration(max(0, state.continuous_next_run_ts - state.elapsed_seconds))
                if state.continuous_next_run_ts
                else PLACEHOLDER
            )
            row3.append(f"Cycle #{state.continuous_cycle} | Interval: {format_duration(state.continuous_interval)} | Next: {next_run_str}", style=COLOR_INFO)
        if state.is_resumed:
            if len(row3) > 0:
                row3.append("  •  ", style="dim")
            row3.append(f"Resumed: {format_number(state.cached_records_recovered)} cached records recovered", style=COLOR_SUCCESS)
        header_table.add_row(row3, Text())

    title = Text.assemble(
        (" ANANYA ML TRAINER ", f"bold {COLOR_TEXT}"),
        (f"• {state.job_type.upper()} ", f"bold {COLOR_BRAND_PRIMARY}"),
    )
    return Panel(
        header_table,
        title=title,
        title_align="center",
        border_style=COLOR_BRAND_PRIMARY,
        box=PANEL_BOX,
        padding=(0, 1),
    )


def render_dataset_summary(state: TUIState) -> Panel:
    """Renders the DATASET key metrics grid."""
    grid = Table.grid(expand=True)
    grid.add_column(ratio=1)
    grid.add_column(ratio=1)
    grid.add_column(ratio=1)
    grid.add_column(ratio=1)

    t = Table(expand=True, box=TABLE_BOX, border_style=COLOR_BRAND_PRIMARY)
    t.add_column("Products", justify="center", style="bold white")
    t.add_column("Valid", justify="center", style=f"bold {COLOR_SUCCESS}")
    t.add_column("Quarantined", justify="center", style=f"bold {COLOR_WARNING}")
    t.add_column("Task Examples", justify="center", style=f"bold {COLOR_INFO}")

    prod_str = format_number(state.products)
    valid_str = format_number(state.valid) if state.valid > 0 else (prod_str if state.products > 0 else PLACEHOLDER)
    quar_str = format_number(state.quarantined) if state.quarantined > 0 else "0"
    examples_str = format_number(state.task_examples) if state.task_examples > 0 else PLACEHOLDER

    t.add_row(prod_str, valid_str, quar_str, examples_str)

    # Secondary row for collection/discovery if applicable
    if state.discovered > 0 or state.downloaded > 0 or state.cached > 0 or state.pdfs > 0:
        sub_t = Table(expand=True, box=box.SIMPLE, show_header=False)
        sub_t.add_column(justify="center", style=COLOR_MUTED)
        sub_t.add_column(justify="center", style=COLOR_MUTED)
        sub_t.add_column(justify="center", style=COLOR_MUTED)
        sub_t.add_column(justify="center", style=COLOR_MUTED)
        sub_t.add_row(
            f"Discovered: {format_number(state.discovered)}",
            f"Downloaded: {format_number(state.downloaded)}",
            f"Cached: {format_number(state.cached)}",
            f"PDFs: {format_number(state.pdfs)}",
        )
        body = Table.grid(expand=True)
        body.add_row(t)
        body.add_row(sub_t)
        content = body
    else:
        content = t

    return Panel(
        content,
        title=f"[bold {COLOR_BRAND_PRIMARY}]DATASET[/]",
        border_style=COLOR_BRAND_PRIMARY,
        box=PANEL_BOX,
        padding=(0, 1),
    )


def render_pipeline(state: TUIState) -> Panel:
    """Renders the PIPELINE stage progress panel."""
    t = Table(expand=True, box=box.SIMPLE, show_header=False, pad_edge=False)
    t.add_column(width=3, justify="center")
    t.add_column(ratio=4, justify="left")
    t.add_column(ratio=4, justify="right")
    t.add_column(ratio=5, justify="right")

    for name in state.CANONICAL_STAGES:
        st = state.stages.get(name) or StageState(name=name)

        if st.status == "completed":
            glyph = f"[{COLOR_SUCCESS}]{SYM_COMPLETED}[/]"
            name_text = f"[{COLOR_SUCCESS}]{name}[/]"
            progress_str = st.summary or (
                f"{format_number(st.current)}/{format_number(st.total)}" if st.total else "done"
            )
            bar_text = ""
        elif st.status == "running":
            glyph = f"[{COLOR_INFO}]{SYM_RUNNING}[/]"
            name_text = f"[bold white]{name}[/]"
            if st.total and st.total > 0:
                cur = st.current or 0
                pct = st.progress_pct or 0.0
                progress_str = f"{format_number(cur)}/{format_number(st.total)}"
                bar = render_progress_bar(cur, st.total, width=12)
                bar_text = f"[{COLOR_BRAND_PRIMARY}]{bar}[/] {pct:.0f}%"
            else:
                progress_str = f"{format_number(st.current)} {st.unit}" if st.current else "running..."
                bar_text = f"[{COLOR_INFO}]...[/]"
        elif st.status == "warning":
            glyph = f"[{COLOR_WARNING}]{SYM_WARNING}[/]"
            name_text = f"[{COLOR_WARNING}]{name}[/]"
            progress_str = st.summary or "completed with warnings"
            bar_text = ""
        elif st.status == "failed":
            glyph = f"[{COLOR_ERROR}]{SYM_FAILED}[/]"
            name_text = f"[{COLOR_ERROR}]{name}[/]"
            progress_str = st.summary or "failed"
            bar_text = ""
        else:
            glyph = f"[dim]{SYM_PENDING}[/]"
            name_text = f"[dim]{name}[/]"
            progress_str = ""
            bar_text = ""

        t.add_row(glyph, name_text, progress_str, bar_text)

    return Panel(
        t,
        title=f"[bold {COLOR_BRAND_PRIMARY}]PIPELINE[/]",
        border_style=COLOR_BRAND_PRIMARY,
        box=PANEL_BOX,
        padding=(0, 1),
    )


def render_sources_summary(state: TUIState, max_rows: int = 5) -> Panel:
    """Renders the SOURCES table in the main dashboard view."""
    t = Table(expand=True, box=TABLE_BOX, border_style=COLOR_BRAND_PRIMARY)
    t.add_column("Source", ratio=3, style="bold white")
    t.add_column("Products", justify="right", ratio=2)
    t.add_column("Failed", justify="right", ratio=1, style=f"bold {COLOR_ERROR}")
    t.add_column("Status", justify="left", ratio=2)

    sources_list = list(state.sources.values())
    if not sources_list:
        t.add_row("No active sources configured", "—", "—", "[dim]pending[/]")
        return Panel(t, title=f"[bold {COLOR_BRAND_PRIMARY}]SOURCES[/]", border_style=COLOR_BRAND_PRIMARY, box=PANEL_BOX)

    # Sort sources: active/running first, then completed, then failed, then pending
    def sort_key(s: SourceState):
        if "run" in s.status or "discov" in s.status or "down" in s.status:
            return 0
        if "fail" in s.status:
            return 1
        if "comp" in s.status:
            return 2
        return 3

    sorted_sources = sorted(sources_list, key=sort_key)
    displayed = sorted_sources[:max_rows]

    for s in displayed:
        status_low = s.status.lower()
        if "comp" in status_low:
            status_text = f"[{COLOR_SUCCESS}]{SYM_BULLET} done[/]"
        elif "fail" in status_low:
            status_text = f"[{COLOR_ERROR}]{SYM_FAILED} failed[/]"
        elif "block" in status_low:
            status_text = f"[{COLOR_WARNING}]{SYM_WARNING} blocked[/]"
        elif "discov" in status_low:
            status_text = f"[{COLOR_INFO}]{SYM_RUNNING} discover[/]"
        elif "down" in status_low:
            status_text = f"[{COLOR_INFO}]{SYM_RUNNING} download[/]"
        elif "run" in status_low:
            status_text = f"[{COLOR_INFO}]{SYM_RUNNING} running[/]"
        else:
            status_text = f"[dim]{SYM_PENDING} {s.status}[/]"

        t.add_row(
            s.id,
            format_number(s.products),
            format_number(s.failed) if s.failed > 0 else "0",
            status_text,
        )

    rem = len(sorted_sources) - len(displayed)
    if rem > 0:
        t.add_row(f"... and {rem} more sources (press [S] for full list)", "", "", "")

    return Panel(
        t,
        title=f"[bold {COLOR_BRAND_PRIMARY}]SOURCES ({len(state.sources)})[/]",
        border_style=COLOR_BRAND_PRIMARY,
        box=PANEL_BOX,
        padding=(0, 1),
    )


def render_activity(state: TUIState, max_items: int = 8) -> Panel:
    """Renders the rolling CURRENT ACTIVITY feed."""
    t = Table(expand=True, box=box.SIMPLE, show_header=False, pad_edge=False)
    t.add_column(width=10, style=COLOR_MUTED)
    t.add_column(ratio=1)

    items = list(state.activity_feed)[:max_items]
    if not items:
        t.add_row("00:00:00", "[dim]Initializing workspace...[/]")
    else:
        for it in items:
            style = "white"
            if it.level == "ERROR":
                style = COLOR_ERROR
            elif it.level == "WARNING":
                style = COLOR_WARNING
            elif it.level == "SUCCESS":
                style = COLOR_SUCCESS
            t.add_row(it.time_str, Text(it.message, style=style))

    return Panel(
        t,
        title=f"[bold {COLOR_BRAND_PRIMARY}]CURRENT ACTIVITY[/]",
        border_style=COLOR_BRAND_PRIMARY,
        box=PANEL_BOX,
        padding=(0, 1),
    )


def render_metrics(state: TUIState) -> Panel:
    """Renders operational and system METRICS."""
    t = Table(expand=True, box=box.SIMPLE, show_header=False, pad_edge=False)
    t.add_column(ratio=3, style=COLOR_MUTED)
    t.add_column(ratio=3, justify="right", style="bold white")

    t.add_row("Throughput", format_rate(state.docs_per_min, "docs/min"))
    t.add_row("Network", format_rate(state.mb_per_min, "MB/min") if state.mb_per_min else PLACEHOLDER)
    t.add_row(
        "CPU",
        format_percentage(state.system_cpu_percent) if state.system_cpu_percent is not None else PLACEHOLDER,
    )
    t.add_row(
        "Memory",
        format_bytes(state.system_memory_mb * 1024 * 1024) if state.system_memory_mb is not None else PLACEHOLDER,
    )
    if state.system_disk_free_gb is not None:
        t.add_row("Disk Free", f"{state.system_disk_free_gb:.1f} GB")
    t.add_row("Errors", str(state.failures))
    t.add_row("Retries", str(state.retries))
    if state.overall_eta_seconds:
        t.add_row("ETA", format_eta(state.overall_eta_seconds))

    return Panel(
        t,
        title=f"[bold {COLOR_BRAND_PRIMARY}]METRICS[/]",
        border_style=COLOR_BRAND_PRIMARY,
        box=PANEL_BOX,
        padding=(0, 1),
    )


def render_footer(state: TUIState) -> Text:
    """Renders the bottom navigation bar and hotkey legend."""
    cur = state.active_view.upper()

    def key(k: str, name: str, active: bool = False) -> Text:
        bg = "on #1E293B" if active else ""
        fg = f"bold {COLOR_BRAND_PRIMARY}"
        return Text.assemble(
            ("[", "dim"),
            (k, fg),
            ("] ", "dim"),
            (name, "bold white" if active else COLOR_MUTED),
            style=bg,
        )

    t = Text(" ")
    t.append_text(key("M", "Main", cur == "MAIN"))
    t.append("   ")
    t.append_text(key("S", "Sources", cur == "SOURCES"))
    t.append("   ")
    t.append_text(key("F", "Failures", cur == "FAILURES"))
    t.append("   ")
    t.append_text(key("L", "Logs", cur == "LOGS"))
    t.append("   ")
    t.append_text(key("T", "Training", cur == "TRAINING"))
    t.append("   |   ")
    if state.is_paused:
        t.append_text(key("R", "Resume"))
    else:
        t.append_text(key("P", "Pause"))
    t.append("   ")
    t.append_text(key("Q", "Quit TUI"))
    return t


def render_sources_view(state: TUIState) -> Panel:
    """Renders the full-screen SOURCES detail view."""
    t = Table(expand=True, box=TABLE_BOX, border_style=COLOR_BRAND_PRIMARY)
    t.add_column("Source ID", ratio=3, style="bold white")
    t.add_column("Status", ratio=2)
    t.add_column("Products", justify="right", ratio=2)
    t.add_column("Documents", justify="right", ratio=2)
    t.add_column("Failed", justify="right", ratio=1, style=f"bold {COLOR_ERROR}")
    t.add_column("Rate", justify="right", ratio=2)
    t.add_column("ETA", justify="right", ratio=2)
    t.add_column("Details", ratio=4, style=COLOR_MUTED)

    for s in state.sources.values():
        status_low = s.status.lower()
        if "comp" in status_low:
            status_text = f"[{COLOR_SUCCESS}]{SYM_BULLET} done[/]"
        elif "fail" in status_low:
            status_text = f"[{COLOR_ERROR}]{SYM_FAILED} failed[/]"
        elif "block" in status_low:
            status_text = f"[{COLOR_WARNING}]{SYM_WARNING} blocked[/]"
        else:
            status_text = f"[{COLOR_INFO}]{SYM_RUNNING} {s.status}[/]"

        t.add_row(
            s.id,
            status_text,
            format_number(s.products),
            format_number(s.documents),
            format_number(s.failed) if s.failed > 0 else "0",
            format_rate(s.rate) if s.rate else PLACEHOLDER,
            format_eta(s.eta_seconds) if s.eta_seconds else PLACEHOLDER,
            s.reason or "",
        )

    return Panel(
        t,
        title=f"[bold {COLOR_BRAND_PRIMARY}]ALL REGISTERED SOURCES ({len(state.sources)})[/]",
        border_style=COLOR_BRAND_PRIMARY,
        box=PANEL_BOX,
    )


def render_failures_view(state: TUIState) -> Layout:
    """Renders the full-screen FAILURES analysis view."""
    layout = Layout()
    layout.split_column(
        Layout(name="summary", size=10),
        Layout(name="log", ratio=1),
    )

    # Failures by type table
    types_table = Table(expand=True, box=TABLE_BOX, border_style=COLOR_BRAND_PRIMARY)
    types_table.add_column("Normalized Failure Type", ratio=3, style="bold white")
    types_table.add_column("Count", justify="right", ratio=1, style=f"bold {COLOR_ERROR}")

    if not state.failures_by_type:
        types_table.add_row("No failures recorded", "0")
    else:
        for ftype, count in sorted(state.failures_by_type.items(), key=lambda x: -x[1]):
            types_table.add_row(ftype, format_number(count))

    stat_grid = Table.grid(expand=True)
    stat_grid.add_column(ratio=2)
    stat_grid.add_column(ratio=1)

    info_text = Text()
    info_text.append(f"Total Failures: {format_number(state.failures)}\n", style=f"bold {COLOR_ERROR}")
    info_text.append(f"Recent Failures (Buffer): {len(state.recent_failures)}\n", style="white")
    if state.active_source_id:
        active_f = state.sources.get(state.active_source_id)
        if active_f:
            info_text.append(f"Current Source Failures ({state.active_source_id}): {active_f.failed}\n", style=COLOR_WARNING)

    stat_grid.add_row(types_table, Panel(info_text, title="Failure Diagnostics", box=PANEL_BOX, border_style=COLOR_BRAND_PRIMARY))

    layout["summary"].update(Panel(stat_grid, title=f"[bold {COLOR_BRAND_PRIMARY}]FAILURE BREAKDOWN[/]", border_style=COLOR_BRAND_PRIMARY, box=PANEL_BOX))

    # Recent failure events table
    recent_table = Table(expand=True, box=TABLE_BOX, border_style=COLOR_BRAND_PRIMARY)
    recent_table.add_column("Time", width=10, style=COLOR_MUTED)
    recent_table.add_column("Source", ratio=2, style="bold white")
    recent_table.add_column("Type", ratio=2, style=f"bold {COLOR_ERROR}")
    recent_table.add_column("Code", width=6, justify="center")
    recent_table.add_column("Error Message", ratio=5, style=COLOR_MUTED)

    for item in list(state.recent_failures)[:20]:
        recent_table.add_row(
            item.time_str,
            item.source_id,
            item.failure_type,
            str(item.status_code or "—"),
            item.error[:80] if item.error else "—",
        )

    layout["log"].update(Panel(recent_table, title=f"[bold {COLOR_BRAND_PRIMARY}]RECENT FAILURE LOG[/]", border_style=COLOR_BRAND_PRIMARY, box=PANEL_BOX))
    return layout


def render_logs_view(state: TUIState) -> Panel:
    """Renders the full-screen LOGS viewer."""
    t = Table(expand=True, box=TABLE_BOX, border_style=COLOR_BRAND_PRIMARY)
    t.add_column("Time", width=10, style=COLOR_MUTED)
    t.add_column("Level", width=8)
    t.add_column("Logger", ratio=2, style="dim")
    t.add_column("Message", ratio=6)

    for log in list(state.logs_buffer)[:30]:
        lvl = log.level.upper()
        if lvl == "ERROR":
            lvl_text = f"[{COLOR_ERROR}]ERROR[/]"
        elif lvl == "WARNING":
            lvl_text = f"[{COLOR_WARNING}]WARN[/]"
        elif lvl == "DEBUG":
            lvl_text = "[dim]DEBUG[/]"
        else:
            lvl_text = f"[{COLOR_INFO}]INFO[/]"

        t.add_row(log.time_str, lvl_text, log.logger_name, log.message)

    return Panel(
        t,
        title=f"[bold {COLOR_BRAND_PRIMARY}]LOG STREAM ({len(state.logs_buffer)} entries)[/]",
        border_style=COLOR_BRAND_PRIMARY,
        box=PANEL_BOX,
    )


def render_training_view(state: TUIState) -> Layout:
    """Renders the TRAINING and EVALUATION metrics view."""
    layout = Layout()
    layout.split_row(
        Layout(name="training", ratio=1),
        Layout(name="evaluation", ratio=1),
    )

    # Left: Training Candidates and Live Epochs
    t_train = Table(expand=True, box=box.SIMPLE, show_header=False)
    t_train.add_column(ratio=3, style=COLOR_MUTED)
    t_train.add_column(ratio=3, justify="right", style="bold white")

    epoch_str = (
        f"{state.training_epoch} / {state.training_total_epochs}"
        if state.training_epoch and state.training_total_epochs
        else (str(state.training_epoch) if state.training_epoch else PLACEHOLDER)
    )
    t_train.add_row("Epoch", epoch_str)
    t_train.add_row("Loss", f"{state.training_loss:.4f}" if state.training_loss is not None else PLACEHOLDER)
    t_train.add_row("Val Loss", f"{state.training_val_loss:.4f}" if state.training_val_loss is not None else PLACEHOLDER)
    t_train.add_row(
        "Accuracy",
        format_percentage(state.training_accuracy, multiply=True) if state.training_accuracy is not None else PLACEHOLDER,
    )
    t_train.add_row("F1 Score", f"{state.training_f1:.4f}" if state.training_f1 is not None else PLACEHOLDER)
    t_train.add_row("Learning Rate", f"{state.training_lr:.6f}" if state.training_lr is not None else PLACEHOLDER)
    if state.champion_model:
        t_train.add_row("Champion", f"[{COLOR_SUCCESS}]{state.champion_model}[/]")

    # Candidates table
    cand_table = Table(expand=True, box=TABLE_BOX, border_style=COLOR_BRAND_PRIMARY)
    cand_table.add_column("Candidate Architecture", ratio=3, style="bold white")
    cand_table.add_column("Val Acc", justify="right", ratio=1)
    cand_table.add_column("Fit Time", justify="right", ratio=1, style=COLOR_MUTED)

    if not state.training_candidates:
        cand_table.add_row("No candidates evaluated yet", "—", "—")
    else:
        for cname, cdata in state.training_candidates.items():
            val_acc = cdata.get("val_accuracy") or cdata.get("accuracy")
            acc_str = format_percentage(val_acc, multiply=True) if val_acc is not None else PLACEHOLDER
            t_ms = cdata.get("training_time_ms")
            t_str = f"{t_ms:.1f}ms" if t_ms is not None else PLACEHOLDER
            prefix = f"[{COLOR_SUCCESS}]★ [/]" if cname == state.champion_model else ""
            cand_table.add_row(f"{prefix}{cname}", acc_str, t_str)

    left_grid = Table.grid(expand=True)
    left_grid.add_row(t_train)
    left_grid.add_row(cand_table)

    layout["training"].update(
        Panel(left_grid, title=f"[bold {COLOR_BRAND_PRIMARY}]TRAINING PROGRESS[/]", border_style=COLOR_BRAND_PRIMARY, box=PANEL_BOX)
    )

    # Right: Evaluation & Quality Gates
    eval_table = Table(expand=True, box=box.SIMPLE, show_header=False)
    eval_table.add_column(ratio=4, style=COLOR_MUTED)
    eval_table.add_column(ratio=2, justify="right", style="bold white")

    m = state.evaluation_metrics
    top1 = m.get("candidate_top1_accuracy")
    eval_table.add_row("Classification Top-1", format_percentage(top1, multiply=True) if top1 is not None else PLACEHOLDER)
    f1 = m.get("weighted_f1")
    eval_table.add_row("Weighted F1", f"{f1:.3f}" if f1 is not None else PLACEHOLDER)
    dup_p = m.get("duplicate_precision")
    eval_table.add_row("Duplicate Precision", format_percentage(dup_p, multiply=True) if dup_p is not None else PLACEHOLDER)
    dup_r = m.get("duplicate_recall")
    eval_table.add_row("Duplicate Recall", format_percentage(dup_r, multiply=True) if dup_r is not None else PLACEHOLDER)

    # Quality Gates checklist
    gates_table = Table(expand=True, box=TABLE_BOX, border_style=COLOR_BRAND_PRIMARY)
    gates_table.add_column("Quality Gate", ratio=4, style="bold white")
    gates_table.add_column("Result", justify="center", ratio=1)

    if not state.quality_gates:
        gates_table.add_row("Awaiting evaluation run...", "—")
    else:
        for gate_name, passed in state.quality_gates.items():
            g_clean = gate_name.replace("_", " ").title()
            g_glyph = f"[{COLOR_SUCCESS}]{SYM_COMPLETED} PASS[/]" if passed else f"[{COLOR_ERROR}]{SYM_FAILED} FAIL[/]"
            gates_table.add_row(g_clean, g_glyph)

    right_grid = Table.grid(expand=True)
    right_grid.add_row(eval_table)
    right_grid.add_row(gates_table)

    layout["evaluation"].update(
        Panel(right_grid, title=f"[bold {COLOR_BRAND_PRIMARY}]EVALUATION & QUALITY GATES[/]", border_style=COLOR_BRAND_PRIMARY, box=PANEL_BOX)
    )

    return layout


def render_dashboard(state: TUIState, width: int = 120, height: int = 40) -> Layout:
    """Assembles the primary active view inside a full-screen Rich Layout."""
    root = Layout()

    # Split top header, center body, bottom footer
    root.split_column(
        Layout(name="header", size=5),
        Layout(name="body", ratio=1),
        Layout(name="footer", size=1),
    )

    root["header"].update(render_header(state))
    root["footer"].update(Align.center(render_footer(state)))

    view = state.active_view.upper()

    if view == "SOURCES":
        root["body"].update(render_sources_view(state))
    elif view == "FAILURES":
        root["body"].update(render_failures_view(state))
    elif view == "LOGS":
        root["body"].update(render_logs_view(state))
    elif view == "TRAINING":
        root["body"].update(render_training_view(state))
    else:
        # MAIN VIEW
        main_layout = Layout()
        main_layout.split_column(
            Layout(name="dataset_row", size=6),
            Layout(name="center_row", ratio=1),
        )

        main_layout["dataset_row"].update(render_dataset_summary(state))

        center = Layout()
        center.split_row(
            Layout(name="left_col", ratio=1),
            Layout(name="right_col", ratio=1),
        )

        center["left_col"].split_column(
            Layout(name="pipeline", ratio=3),
            Layout(name="activity", ratio=2),
        )
        center["right_col"].split_column(
            Layout(name="sources", ratio=3),
            Layout(name="metrics", ratio=2),
        )

        center["left_col"]["pipeline"].update(render_pipeline(state))
        center["left_col"]["activity"].update(render_activity(state))
        center["right_col"]["sources"].update(render_sources_summary(state))
        center["right_col"]["metrics"].update(render_metrics(state))

        main_layout["center_row"].update(center)
        root["body"].update(main_layout)

    return root
