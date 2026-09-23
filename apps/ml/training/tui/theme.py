"""
Ananya ML Trainer — Visual Theme & Design Tokens.

Adheres strictly to DESIGN.md:
- Primary Brand Accent: Dodger Blue (`#1E90FF`)
- Semantic Status Colors: Emerald (success), Amber (warning/paused), Red (error), Dodger Blue (info), Slate (muted/neutral)
- Calm, minimal, high-information-density visual presentation with zero garish decoration
- Modern rounded box geometry (box.ROUNDED)
"""

from rich import box
from rich.style import Style
from rich.theme import Theme

# Primary Brand Colors
COLOR_BRAND_PRIMARY = "#1E90FF"  # Dodger Blue
COLOR_BRAND_PRIMARY_MUTED = "#0F4C81"

# Semantic Status Colors
COLOR_SUCCESS = "#10B981"  # Emerald
COLOR_WARNING = "#F59E0B"  # Amber
COLOR_ERROR = "#EF4444"    # Red / Destructive
COLOR_INFO = "#1E90FF"     # Dodger Blue
COLOR_MUTED = "#94A3B8"    # Slate / Dim
COLOR_DIM = "#64748B"
COLOR_TEXT = "#F8FAFC"
COLOR_BG_CARD = "#1E293B"

# Semantic Status Symbols
SYM_PENDING = "○"
SYM_RUNNING = "▶"
SYM_COMPLETED = "✔"
SYM_WARNING = "⚠"
SYM_FAILED = "✖"
SYM_BULLET = "●"
SYM_BAR_FILLED = "█"
SYM_BAR_EMPTY = "░"

# Standard Box Style
PANEL_BOX = box.ROUNDED
TABLE_BOX = box.ROUNDED
SIMPLE_BOX = box.SIMPLE

# Rich Theme Definition
TUI_THEME = Theme({
    "brand": COLOR_BRAND_PRIMARY,
    "brand.bold": f"bold {COLOR_BRAND_PRIMARY}",
    "status.success": COLOR_SUCCESS,
    "status.warning": COLOR_WARNING,
    "status.error": COLOR_ERROR,
    "status.info": COLOR_INFO,
    "status.muted": COLOR_MUTED,
    "panel.border": COLOR_BRAND_PRIMARY,
    "table.header": f"bold {COLOR_BRAND_PRIMARY}",
    "key": f"bold {COLOR_BRAND_PRIMARY}",
    "val": COLOR_TEXT,
    "dim": COLOR_DIM,
})

