"""Dashboard widget: cards + smart alert + interactive nearest-expiry table."""

from __future__ import annotations

from collections.abc import Callable

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from database import Member
from ui.services.dashboard_service import DashboardData


class _StatCard(QPushButton):
    """Clickable statistic card."""

    def __init__(self, title: str, icon: str, accent: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("statCard")
        self.setProperty("accent", accent)
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(132)

        self.title_label = QLabel(f"{icon}  {title}")
        self.title_label.setObjectName("statTitle")
        self.value_label = QLabel("0")
        self.value_label.setObjectName("statValue")
        self.value_label.setAlignment(Qt.AlignRight | Qt.AlignVCenter)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(8)
        layout.addWidget(self.title_label)
        layout.addWidget(self.value_label)

    def set_value(self, value: int) -> None:
        self.value_label.setText(str(value))


class DashboardWidget(QWidget):
    """Main dashboard area with cards, smart alert and nearest-expiry table."""

    def __init__(
        self,
        on_open_soon: Callable[[], None],
        on_renew: Callable[[int], None],
        on_edit: Callable[[int], None],
        on_open_active: Callable[[], None],
        on_open_expired: Callable[[], None],
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.setLayoutDirection(Qt.RightToLeft)
        self._on_renew = on_renew
        self._on_edit = on_edit

        self.active_card = _StatCard("نشط", "✓", "success")
        self.soon_card = _StatCard("قريب ينتهي", "⌛", "warning")
        self.expired_card = _StatCard("منتهي", "!", "danger")
        self.active_card.clicked.connect(on_open_active)
        self.soon_card.clicked.connect(on_open_soon)
        self.expired_card.clicked.connect(on_open_expired)

        cards_layout = QHBoxLayout()
        cards_layout.setSpacing(12)
        cards_layout.addWidget(self.active_card, 1)
        cards_layout.addWidget(self.soon_card, 1)
        cards_layout.addWidget(self.expired_card, 1)

        self.alert_frame = QFrame()
        self.alert_frame.setObjectName("dashboardAlert")
        alert_layout = QHBoxLayout(self.alert_frame)
        alert_layout.setContentsMargins(12, 8, 12, 8)
        alert_layout.setSpacing(8)
        self.alert_label = QLabel("")
        self.alert_button = QPushButton("عرض التفاصيل")
        self.alert_button.setObjectName("btnGhost")
        self.alert_button.clicked.connect(on_open_soon)
        alert_layout.addWidget(self.alert_label, 1)
        alert_layout.addWidget(self.alert_button)

        table_panel = QFrame()
        table_panel.setObjectName("sectionPanel")
        panel_layout = QVBoxLayout(table_panel)
        panel_layout.setContentsMargins(12, 12, 12, 12)
        panel_layout.setSpacing(8)
        panel_layout.addWidget(QLabel("أقرب 10 اشتراكات تنتهي", objectName="sectionTitle"))

        self.nearest_table = QTableWidget()
        self.nearest_table.setColumnCount(6)
        self.nearest_table.setHorizontalHeaderLabels(["الاسم", "النوع", "تفاصيل الاشتراك", "الحالة", "الإجراء", "تعديل"])
        self.nearest_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.nearest_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.nearest_table.setWordWrap(False)
        self.nearest_table.setShowGrid(False)
        self.nearest_table.setAlternatingRowColors(True)
        self.nearest_table.verticalHeader().setVisible(False)
        self.nearest_table.verticalHeader().setDefaultSectionSize(44)
        self.nearest_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.nearest_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.nearest_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        self.nearest_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self.nearest_table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeToContents)
        self.nearest_table.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeToContents)

        panel_layout.addWidget(self.nearest_table, 1)

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(10)
        root.addLayout(cards_layout)
        root.addWidget(self.alert_frame)
        root.addWidget(table_panel, 1)

    @staticmethod
    def _days_color(days_left: int) -> QColor:
        if days_left <= 3:
            return QColor("#dc2626")
        if days_left <= 7:
            return QColor("#f59e0b")
        return QColor("#16a34a")

    @staticmethod
    def _status_color_for_member(member: Member) -> QColor:
        if member.subscription_type == "SESSIONS":
            remaining = max(0, int(member.sessions_remaining or 0))
            if remaining == 0:
                return QColor("#dc2626")
            if remaining <= 3:
                return QColor("#f59e0b")
            return QColor("#16a34a")
        return DashboardWidget._days_color(member.days_left)

    @staticmethod
    def _subscription_detail(member: Member) -> str:
        if member.subscription_type == "SESSIONS":
            total = int(member.sessions_total or 0)
            remaining = int(member.sessions_remaining or 0)
            detail = f"المتبقي {remaining} / الإجمالي {total}"
            if member.sessions_expiry_date:
                detail += f" | ينتهي: {member.sessions_expiry_date}"
            return detail
        return f"ينتهي: {member.end_date}"

    def _fill_table(self, members: list[Member]) -> None:
        members = sorted(members, key=lambda m: m.days_left)
        self.nearest_table.setRowCount(len(members))

        for row, member in enumerate(members):
            color = self._status_color_for_member(member)
            type_text = "حصص" if member.subscription_type == "SESSIONS" else "شهري"
            action_text = "إضافة حصص" if member.subscription_type == "SESSIONS" else "تجديد شهري"

            name_item = QTableWidgetItem(member.full_name)
            type_item = QTableWidgetItem(type_text)
            detail_item = QTableWidgetItem(self._subscription_detail(member))
            status_item = QTableWidgetItem(member.status)

            for item in (name_item, type_item, detail_item, status_item):
                item.setTextAlignment(Qt.AlignCenter)

            detail_item.setForeground(color)
            status_item.setForeground(color)

            self.nearest_table.setItem(row, 0, name_item)
            self.nearest_table.setItem(row, 1, type_item)
            self.nearest_table.setItem(row, 2, detail_item)
            self.nearest_table.setItem(row, 3, status_item)

            renew_btn = QPushButton(action_text)
            renew_btn.setObjectName("btnGhost")
            renew_btn.clicked.connect(lambda _=False, m_id=member.id: self._on_renew(m_id))

            edit_btn = QPushButton("تعديل")
            edit_btn.setObjectName("btnGhost")
            edit_btn.clicked.connect(lambda _=False, m_id=member.id: self._on_edit(m_id))

            self.nearest_table.setCellWidget(row, 4, renew_btn)
            self.nearest_table.setCellWidget(row, 5, edit_btn)

    def update_data(self, data: DashboardData) -> None:
        self.active_card.set_value(data.active)
        self.soon_card.set_value(data.ending_soon)
        self.expired_card.set_value(data.expired)
        self._fill_table(data.nearest_members)

        if data.alert_count > 0:
            self.alert_label.setText(f"يوجد {data.alert_count} اشتراكات ستنتهي خلال 7 أيام")
            self.alert_frame.show()
        else:
            self.alert_frame.hide()
