"""QSS and font loading helpers for the UI layer."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtGui import QFont, QFontDatabase
from PySide6.QtWidgets import QApplication


def load_app_style(app: QApplication) -> None:
    """Load stylesheet from style.qss file."""
    style_path = Path(__file__).resolve().parent / "style.qss"
    if style_path.exists():
        app.setStyleSheet(style_path.read_text(encoding="utf-8"))


def setup_arabic_font(app: QApplication) -> None:
    """Load best available Arabic UI font for clear rendering."""
    fonts_dir = Path(__file__).resolve().parent / "fonts"

    if fonts_dir.exists():
        for font_file in fonts_dir.glob("*.ttf"):
            QFontDatabase.addApplicationFont(str(font_file))

    preferred_order = [
        "Cairo",
        "Tajawal",
        "Noto Naskh Arabic",
        "Noto Sans Arabic",
        "IBM Plex Sans Arabic",
        "Segoe UI",
        "Arial",
    ]

    db = QFontDatabase()
    chosen_family = None
    for family in preferred_order:
        if family in db.families():
            chosen_family = family
            break

    if chosen_family is None:
        return

    font = QFont(chosen_family, 11)
    font.setStyleStrategy(QFont.PreferAntialias)
    app.setFont(font)