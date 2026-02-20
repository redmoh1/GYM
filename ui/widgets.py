"""Reusable professional UI widgets for Gym Management System."""

from __future__ import annotations

from dataclasses import dataclass

from PySide6.QtCore import QEasingCurve, Property, QPropertyAnimation, Qt, Signal
from PySide6.QtGui import QColor, QIcon
from PySide6.QtWidgets import (
    QButtonGroup,
    QFrame,
    QGraphicsDropShadowEffect,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSizePolicy,
    QStyle,
    QVBoxLayout,
    QWidget,
)


class AnimatedButton(QPushButton):
    """Primary button with smooth hover color animation."""

    def __init__(self, text: str, parent: QWidget | None = None) -> None:
        super().__init__(text, parent)
        self._normal = QColor("#2F6BFF")
        self._hover = QColor("#1F5BF0")
        self._current = QColor(self._normal)

        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(40)
        self._apply_color()

        self._anim = QPropertyAnimation(self, b"bgColor", self)
        self._anim.setDuration(160)
        self._anim.setEasingCurve(QEasingCurve.OutCubic)

    def _apply_color(self) -> None:
        self.setStyleSheet(
            f"""
            AnimatedButton {{
                background-color: {self._current.name()};
                color: #ffffff;
                border: none;
                border-radius: 12px;
                font-weight: 700;
                padding: 10px 16px;
            }}
            """
        )

    def get_bg_color(self) -> QColor:
        return self._current

    def set_bg_color(self, color: QColor) -> None:
        self._current = color
        self._apply_color()

    bgColor = Property(QColor, get_bg_color, set_bg_color)

    def enterEvent(self, event) -> None:  # noqa: N802
        self._anim.stop()
        self._anim.setStartValue(self._current)
        self._anim.setEndValue(self._hover)
        self._anim.start()
        super().enterEvent(event)

    def leaveEvent(self, event) -> None:  # noqa: N802
        self._anim.stop()
        self._anim.setStartValue(self._current)
        self._anim.setEndValue(self._normal)
        self._anim.start()
        super().leaveEvent(event)


class CardWidget(QFrame):
    """Dashboard statistics card with soft shadow."""

    def __init__(self, title: str, value: str = "0", accent: str = "primary", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("card")
        self.setProperty("accent", accent)

        self.title_label = QLabel(title)
        self.title_label.setObjectName("cardTitle")

        self.value_label = QLabel(value)
        self.value_label.setObjectName("cardValue")
        self.value_label.setAlignment(Qt.AlignRight | Qt.AlignVCenter)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(8)
        layout.addWidget(self.title_label)
        layout.addWidget(self.value_label)

        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(28)
        shadow.setOffset(0, 10)
        shadow.setColor(QColor(15, 23, 42, 35))
        self.setGraphicsEffect(shadow)

    def set_value(self, value: int | str) -> None:
        self.value_label.setText(str(value))


@dataclass
class SidebarItem:
    key: str
    label: str
    icon: QStyle.StandardPixmap


class Sidebar(QWidget):
    """Modern sidebar with icons and page-switch signal."""

    page_changed = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("sidebar")
        self.setFixedWidth(248)

        self._buttons: dict[str, QPushButton] = {}

        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(8)

        brand = QLabel("GYM MANAGER")
        brand.setObjectName("brandTitle")
        layout.addWidget(brand)
        layout.addSpacing(8)

        items = [
            SidebarItem("dashboard", "لوحة التحكم", QStyle.SP_ComputerIcon),
            SidebarItem("all", "جميع اللاعبين", QStyle.SP_FileDialogListView),
            SidebarItem("soon", "قريب ينتهي", QStyle.SP_BrowserReload),
            SidebarItem("expired", "المنتهين", QStyle.SP_MessageBoxWarning),
            SidebarItem("renew", "التجديد", QStyle.SP_DialogApplyButton),
            SidebarItem("settings", "الإعدادات", QStyle.SP_FileDialogDetailedView),
        ]

        group = QButtonGroup(self)
        group.setExclusive(True)

        style = self.style()
        for item in items:
            btn = QPushButton(item.label)
            btn.setProperty("class", "navBtn")
            btn.setCheckable(True)
            btn.setCursor(Qt.PointingHandCursor)
            btn.setIcon(QIcon(style.standardIcon(item.icon)))
            btn.setIconSize(btn.iconSize())
            btn.setLayoutDirection(Qt.RightToLeft)
            btn.setMinimumHeight(42)
            btn.clicked.connect(lambda _=False, k=item.key: self.page_changed.emit(k))

            group.addButton(btn)
            self._buttons[item.key] = btn
            layout.addWidget(btn)

        layout.addStretch()

        self._buttons["dashboard"].setChecked(True)
        footer = QLabel("v1.0")
        footer.setObjectName("mutedText")
        footer.setAlignment(Qt.AlignCenter)
        footer.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        layout.addWidget(footer)

    def set_active(self, key: str) -> None:
        if key in self._buttons:
            self._buttons[key].setChecked(True)