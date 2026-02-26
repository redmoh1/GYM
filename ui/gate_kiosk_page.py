"""Gate/Kiosk page for realtime card check-ins."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor, QPixmap
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget

from database import CheckinRecord
from services.k40_access_service import CheckinEvent


class GateKioskWidget(QWidget):
    """Shows the latest card validation in large format + recent history."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setLayoutDirection(Qt.RightToLeft)

        self._reset_timer = QTimer(self)
        self._reset_timer.setSingleShot(True)
        self._reset_timer.timeout.connect(self._show_waiting_state)

        self.avatar_label = QLabel("لا توجد صورة")
        self.avatar_label.setAlignment(Qt.AlignCenter)
        self.avatar_label.setFixedSize(168, 168)
        self.avatar_label.setObjectName("gateAvatar")

        self.status_label = QLabel("UNKNOWN")
        self.status_label.setAlignment(Qt.AlignCenter)
        self.status_label.setObjectName("gateStatus")

        self.name_label = QLabel("-")
        self.phone_label = QLabel("-")
        self.card_label = QLabel("-")
        self.subscription_type_label = QLabel("-")
        self.subscription_details_label = QLabel("-")
        self.remaining_or_expiry_label = QLabel("-")
        self.reason_label = QLabel("-")
        self.last_seen_label = QLabel("بانتظار تمرير بطاقة...")
        self.last_seen_label.setObjectName("mutedText")

        profile_panel = QFrame()
        profile_panel.setObjectName("sectionPanel")
        profile_layout = QHBoxLayout(profile_panel)
        profile_layout.setContentsMargins(16, 16, 16, 16)
        profile_layout.setSpacing(16)
        profile_layout.addWidget(self.avatar_label, 0, Qt.AlignTop)

        info_col = QVBoxLayout()
        info_col.setSpacing(8)
        info_col.addWidget(QLabel("Gate / Kiosk Mode", objectName="sectionTitle"))
        info_col.addWidget(self.status_label)
        info_col.addWidget(self._row("الاسم", self.name_label))
        info_col.addWidget(self._row("الهاتف", self.phone_label))
        info_col.addWidget(self._row("رقم البطاقة", self.card_label))
        info_col.addWidget(self._row("نوع الاشتراك", self.subscription_type_label))
        info_col.addWidget(self._row("تفاصيل الاشتراك", self.subscription_details_label))
        info_col.addWidget(self._row("المتبقي/انتهاء الباقة", self.remaining_or_expiry_label))
        info_col.addWidget(self._row("السبب", self.reason_label))
        info_col.addWidget(self.last_seen_label)
        info_col.addStretch()
        profile_layout.addLayout(info_col, 1)

        history_panel = QFrame()
        history_panel.setObjectName("sectionPanel")
        history_layout = QVBoxLayout(history_panel)
        history_layout.setContentsMargins(12, 12, 12, 12)
        history_layout.setSpacing(8)
        history_layout.addWidget(QLabel("آخر 10 عمليات مرور", objectName="sectionTitle"))

        self.history_table = QTableWidget()
        self.history_table.setColumnCount(5)
        self.history_table.setHorizontalHeaderLabels(["الوقت", "الاسم", "البطاقة", "الحالة", "السبب"])
        self.history_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.history_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.history_table.setWordWrap(False)
        self.history_table.setShowGrid(False)
        self.history_table.verticalHeader().setVisible(False)
        self.history_table.horizontalHeader().setStretchLastSection(True)
        history_layout.addWidget(self.history_table, 1)

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(10)
        root.addWidget(profile_panel)
        root.addWidget(history_panel, 1)

        self._show_waiting_state()

    def _row(self, title: str, value: QLabel) -> QWidget:
        row = QWidget()
        row_layout = QHBoxLayout(row)
        row_layout.setContentsMargins(0, 0, 0, 0)
        row_layout.setSpacing(6)

        title_label = QLabel(f"{title}:")
        title_label.setObjectName("mutedText")
        row_layout.addWidget(value, 1)
        row_layout.addWidget(title_label, 0, Qt.AlignRight)
        return row

    def show_checkin(self, event: CheckinEvent) -> None:
        self.status_label.setText(event.result)
        self._apply_status_style(event.result)

        self.name_label.setText(event.member_name or "غير معروف")
        self.phone_label.setText(event.member_phone or "-")
        self.card_label.setText(event.card_id or "-")
        self.reason_label.setText(event.reason or "-")

        if event.subscription_type == "SESSIONS":
            total = int(event.sessions_total or 0)
            remaining = int(event.sessions_remaining or 0)
            self.subscription_type_label.setText("حصص")
            self.subscription_details_label.setText(f"المتبقي {remaining} / الإجمالي {total}")
            self.remaining_or_expiry_label.setText(event.sessions_expiry_date or "-")
        else:
            self.subscription_type_label.setText("شهري")
            self.subscription_details_label.setText(f"ينتهي: {event.member_end_date or '-'}")
            self.remaining_or_expiry_label.setText("-" if event.days_left is None else str(event.days_left))

        self.last_seen_label.setText(f"آخر تمرير: {event.checked_at}")
        self._set_avatar(event.photo_path)

        self._reset_timer.start(3000)

    def update_recent_checkins(self, checkins: list[CheckinRecord]) -> None:
        self.history_table.setRowCount(len(checkins))

        for row, record in enumerate(checkins):
            values = [
                record.checked_at,
                record.member_name or "غير معروف",
                record.card_id or "-",
                record.result,
                record.reason,
            ]
            for col, value in enumerate(values):
                item = QTableWidgetItem(value)
                item.setTextAlignment(Qt.AlignCenter)
                if col in (1, 4):
                    item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
                if col == 3:
                    item.setForeground(self._status_color(record.result))
                self.history_table.setItem(row, col, item)

        self.history_table.resizeColumnsToContents()

    def _set_avatar(self, image_path: str) -> None:
        if image_path and Path(image_path).exists():
            pixmap = QPixmap(image_path)
            if not pixmap.isNull():
                scaled = pixmap.scaled(168, 168, Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation)
                self.avatar_label.setPixmap(scaled)
                self.avatar_label.setText("")
                return

        self.avatar_label.setPixmap(QPixmap())
        self.avatar_label.setText("لا توجد صورة")

    def _show_waiting_state(self) -> None:
        self.status_label.setText("WAITING")
        self._apply_status_style("WAITING")
        self.reason_label.setText("بانتظار تمرير بطاقة...")

    def _apply_status_style(self, status: str) -> None:
        color = self._status_color(status)
        text = color.name()
        bg = QColor(color)
        bg.setAlpha(35)
        self.status_label.setStyleSheet(
            f"""
            QLabel#gateStatus {{
                border: 1px solid {text};
                background: {bg.name(QColor.HexArgb)};
                color: {text};
                border-radius: 12px;
                font-size: 24px;
                font-weight: 800;
                padding: 10px;
            }}
            """
        )

    @staticmethod
    def _status_color(status: str) -> QColor:
        normalized = status.upper().strip()
        if normalized == "ALLOW":
            return QColor("#16a34a")
        if normalized == "DENY":
            return QColor("#dc2626")
        return QColor("#6b7280")
