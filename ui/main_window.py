"""Modern main window for Gym Management System (Python/PySide6)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from openpyxl import Workbook
from PySide6.QtCore import QTimer, Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QDialog,
    QFileDialog,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSizePolicy,
    QSpinBox,
    QStackedWidget,
    QStyle,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from database import GymDatabase, Member, STATUS_ACTIVE, STATUS_EXPIRED, STATUS_EXPIRING
from services.device_settings import DeviceSettings, DeviceSettingsStore
from services.k40_access_service import CheckinEvent, K40AccessService
from services.zk_k40_listener import K40LogEvent
from ui.dashboard_page import DashboardWidget
from ui.gate_kiosk_page import GateKioskWidget
from ui.member_dialog import MemberDialog
from ui.services.dashboard_service import DashboardService
from ui.widgets import AnimatedButton, Sidebar


class RenewalDialog(QDialog):
    """Small dialog to select renewal months."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Ã˜ÂªÃ˜Â¬Ã˜Â¯Ã™Å Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜Â§Ã˜Â´Ã˜ÂªÃ˜Â±Ã˜Â§Ã™Æ’")
        self.setLayoutDirection(Qt.RightToLeft)
        self.setMinimumWidth(300)

        self.months_spin = QSpinBox()
        self.months_spin.setRange(1, 12)
        self.months_spin.setValue(1)

        form = QFormLayout()
        form.addRow("Ã˜Â¹Ã˜Â¯Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜Â£Ã˜Â´Ã™â€¡Ã˜Â±:", self.months_spin)

        ok_btn = QPushButton("Ã˜ÂªÃ˜Â£Ã™Æ’Ã™Å Ã˜Â¯")
        cancel_btn = QPushButton("Ã˜Â¥Ã™â€žÃ˜ÂºÃ˜Â§Ã˜Â¡")
        cancel_btn.setObjectName("btnGhost")
        ok_btn.clicked.connect(self.accept)
        cancel_btn.clicked.connect(self.reject)

        actions = QHBoxLayout()
        actions.addStretch()
        actions.addWidget(cancel_btn)
        actions.addWidget(ok_btn)

        root = QVBoxLayout(self)
        root.setContentsMargins(14, 14, 14, 14)
        root.setSpacing(10)
        root.addLayout(form)
        root.addLayout(actions)

    @property
    def months(self) -> int:
        return self.months_spin.value()


class TopUpSessionsDialog(QDialog):
    """Small dialog to select top-up sessions amount."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Ã˜Â¥Ã˜Â¶Ã˜Â§Ã™ÂÃ˜Â© Ã˜Â­Ã˜ÂµÃ˜Âµ")
        self.setLayoutDirection(Qt.RightToLeft)
        self.setMinimumWidth(300)

        self.sessions_spin = QSpinBox()
        self.sessions_spin.setRange(1, 5000)
        self.sessions_spin.setValue(10)

        form = QFormLayout()
        form.addRow("Ã˜Â¹Ã˜Â¯Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜Â­Ã˜ÂµÃ˜Âµ:", self.sessions_spin)

        ok_btn = QPushButton("Ã˜ÂªÃ˜Â£Ã™Æ’Ã™Å Ã˜Â¯")
        cancel_btn = QPushButton("Ã˜Â¥Ã™â€žÃ˜ÂºÃ˜Â§Ã˜Â¡")
        cancel_btn.setObjectName("btnGhost")
        ok_btn.clicked.connect(self.accept)
        cancel_btn.clicked.connect(self.reject)

        actions = QHBoxLayout()
        actions.addStretch()
        actions.addWidget(cancel_btn)
        actions.addWidget(ok_btn)

        root = QVBoxLayout(self)
        root.setContentsMargins(14, 14, 14, 14)
        root.setSpacing(10)
        root.addLayout(form)
        root.addLayout(actions)

    @property
    def sessions(self) -> int:
        return self.sessions_spin.value()


class MainWindow(QMainWindow):
    """Main shell with sidebar, dashboard and members pages."""

    HEADERS = [
        "ID",
        "الاسم",
        "الهاتف",
        "النوع",
        "تفاصيل الاشتراك",
        "الحالة",
        "المتبقي",
        "رقم البطاقة",
        "ملاحظات",
        "إجراءات",
    ]

    def __init__(self) -> None:
        super().__init__()
        self.db = GymDatabase("gym.db")
        self.dashboard_service = DashboardService(self.db)
        self.device_settings_store = DeviceSettingsStore("config/device_settings.json")
        self.k40_service = K40AccessService(self.db, self.device_settings_store, self)

        self.setWindowTitle("Gym Manager")
        self.resize(1460, 900)
        self.setMinimumSize(1180, 720)
        self.setLayoutDirection(Qt.RightToLeft)

        self.sidebar = Sidebar()
        self.pages = QStackedWidget()

        self.search_edit = QLineEdit(objectName="searchInput")
        self.search_edit.setPlaceholderText("Ã˜Â§Ã˜Â¨Ã˜Â­Ã˜Â« Ã˜Â¨Ã˜Â§Ã™â€žÃ˜Â§Ã˜Â³Ã™â€¦ Ã˜Â£Ã™Ë† Ã˜Â§Ã™â€žÃ™â€¡Ã˜Â§Ã˜ÂªÃ™Â Ã˜Â£Ã™Ë† Ã˜Â±Ã™â€šÃ™â€¦ Ã˜Â§Ã™â€žÃ˜Â¨Ã˜Â·Ã˜Â§Ã™â€šÃ˜Â©...")
        self.search_edit.addAction(self.style().standardIcon(QStyle.SP_FileDialogContentsView), QLineEdit.LeadingPosition)

        self.add_member_btn = AnimatedButton("+ Ã˜Â¥Ã˜Â¶Ã˜Â§Ã™ÂÃ˜Â© Ã™â€žÃ˜Â§Ã˜Â¹Ã˜Â¨")
        self.status_filter_combo = QComboBox()
        self.status_filter_combo.addItems(["Ã˜Â§Ã™â€žÃ™Æ’Ã™â€ž", STATUS_ACTIVE, STATUS_EXPIRING, STATUS_EXPIRED])

        self.all_table = self._build_member_table()
        self.soon_table = self._build_member_table()
        self.expired_table = self._build_member_table()

        self.dashboard = DashboardWidget(
            on_open_soon=lambda: self.switch_page("soon"),
            on_renew=lambda member_id: self.renew_member_by_id(member_id),
            on_edit=self.edit_member_by_id,
            on_open_active=lambda: self.switch_page("all"),
            on_open_expired=lambda: self.switch_page("expired"),
        )
        self.gate_widget = GateKioskWidget()

        self._build_ui()
        self._connect_signals()
        self._load_device_settings_to_form()
        self.refresh_all_data()
        self.gate_widget.update_recent_checkins(self.k40_service.get_recent_checkins(10))
        self.k40_service.start()

    def _build_ui(self) -> None:
        root = QWidget(objectName="appRoot")
        self.setCentralWidget(root)

        root_layout = QHBoxLayout(root)
        root_layout.setContentsMargins(14, 14, 14, 14)
        root_layout.setSpacing(12)

        content = QWidget()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(10)
        content_layout.addWidget(self._build_topbar())
        content_layout.addWidget(self._build_pages(), 1)

        root_layout.addWidget(self.sidebar)
        root_layout.addWidget(content, 1)

    def _build_topbar(self) -> QWidget:
        topbar = QFrame(objectName="topBar")
        layout = QHBoxLayout(topbar)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(10)

        title = QLabel("Ã™â€ Ã˜Â¸Ã˜Â§Ã™â€¦ Ã˜Â¥Ã˜Â¯Ã˜Â§Ã˜Â±Ã˜Â© Ã˜Â§Ã˜Â´Ã˜ÂªÃ˜Â±Ã˜Â§Ã™Æ’Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ˜Â¬Ã™Å Ã™â€¦", objectName="systemName")
        title.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)

        layout.addWidget(title)
        layout.addWidget(self.search_edit, 1)
        layout.addWidget(self.add_member_btn)
        return topbar

    def _build_pages(self) -> QWidget:
        self.pages.addWidget(self.dashboard)
        self.pages.addWidget(self._all_page())
        self.pages.addWidget(self._soon_page())
        self.pages.addWidget(self._expired_page())
        self.pages.addWidget(self.gate_widget)
        self.pages.addWidget(self._settings_page())
        return self.pages

    def _all_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        toolbar = QHBoxLayout()
        toolbar.setSpacing(8)
        toolbar.addWidget(QLabel("Ã™ÂÃ™â€žÃ˜ÂªÃ˜Â±Ã˜Â© Ã˜Â­Ã˜Â³Ã˜Â¨ Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â§Ã™â€žÃ˜Â©:", objectName="mutedText"))
        toolbar.addWidget(self.status_filter_combo)

        self.export_btn = QPushButton("Ã˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â± Excel")
        self.export_btn.setObjectName("btnGhost")

        self.backup_btn = QPushButton("Ã™â€ Ã˜Â³Ã˜Â® Ã˜Â§Ã˜Â­Ã˜ÂªÃ™Å Ã˜Â§Ã˜Â·Ã™Å ")
        self.backup_btn.setObjectName("btnGhost")

        toolbar.addStretch()
        toolbar.addWidget(self.export_btn)
        toolbar.addWidget(self.backup_btn)

        layout.addLayout(toolbar)
        layout.addWidget(self.all_table, 1)
        return page

    def _soon_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        layout.addWidget(QLabel("Ã˜Â§Ã™â€žÃ˜Â§Ã˜Â´Ã˜ÂªÃ˜Â±Ã˜Â§Ã™Æ’Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ™â€šÃ˜Â±Ã™Å Ã˜Â¨Ã˜Â© Ã™â€¦Ã™â€  Ã˜Â§Ã™â€žÃ˜Â§Ã™â€ Ã˜ÂªÃ™â€¡Ã˜Â§Ã˜Â¡", objectName="sectionTitle"))
        layout.addWidget(self.soon_table, 1)
        return page

    def _expired_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        layout.addWidget(QLabel("Ã˜Â§Ã™â€žÃ˜Â§Ã˜Â´Ã˜ÂªÃ˜Â±Ã˜Â§Ã™Æ’Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ™â€¦Ã™â€ Ã˜ÂªÃ™â€¡Ã™Å Ã˜Â©", objectName="sectionTitle"))
        layout.addWidget(self.expired_table, 1)
        return page

    def _settings_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        data_panel = QFrame(objectName="sectionPanel")
        data_layout = QVBoxLayout(data_panel)
        data_layout.setContentsMargins(16, 16, 16, 16)
        data_layout.setSpacing(10)
        data_layout.addWidget(QLabel("Ã˜Â§Ã™â€žÃ˜Â¥Ã˜Â¹Ã˜Â¯Ã˜Â§Ã˜Â¯Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ˜Â¹Ã˜Â§Ã™â€¦Ã˜Â©", objectName="sectionTitle"))
        data_layout.addWidget(QLabel("Ã˜Â¥Ã˜Â¯Ã˜Â§Ã˜Â±Ã˜Â© Ã˜Â§Ã™â€žÃ˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â± Ã™Ë†Ã˜Â§Ã™â€žÃ™â€ Ã˜Â³Ã˜Â® Ã˜Â§Ã™â€žÃ˜Â§Ã˜Â­Ã˜ÂªÃ™Å Ã˜Â§Ã˜Â·Ã™Å .", objectName="mutedText"))

        row = QHBoxLayout()
        self.settings_export_btn = QPushButton("Ã˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â± Ã˜Â§Ã™â€žÃ˜Â¨Ã™Å Ã˜Â§Ã™â€ Ã˜Â§Ã˜Âª")
        self.settings_export_btn.setObjectName("btnGhost")

        self.settings_backup_btn = QPushButton("Ã™â€ Ã˜Â³Ã˜Â®Ã˜Â© Ã˜Â§Ã˜Â­Ã˜ÂªÃ™Å Ã˜Â§Ã˜Â·Ã™Å Ã˜Â©")
        self.settings_backup_btn.setObjectName("btnGhost")

        row.addWidget(self.settings_export_btn)
        row.addWidget(self.settings_backup_btn)
        row.addStretch()
        data_layout.addLayout(row)

        device_panel = QFrame(objectName="sectionPanel")
        device_layout = QVBoxLayout(device_panel)
        device_layout.setContentsMargins(16, 16, 16, 16)
        device_layout.setSpacing(10)
        device_layout.addWidget(QLabel("Device Settings", objectName="sectionTitle"))
        device_layout.addWidget(QLabel("ZKTeco K40 (TCP/IP)", objectName="mutedText"))

        form = QFormLayout()
        form.setLabelAlignment(Qt.AlignRight)
        form.setHorizontalSpacing(14)
        form.setVerticalSpacing(10)

        self.device_ip_edit = QLineEdit()
        self.device_ip_edit.setPlaceholderText("Ã™â€¦Ã˜Â«Ã˜Â§Ã™â€ž: 192.168.1.201")

        self.device_port_spin = QSpinBox()
        self.device_port_spin.setRange(1, 65535)
        self.device_port_spin.setValue(4370)

        self.device_name_edit = QLineEdit("ZKTeco K40")
        self.enable_device_listener_checkbox = QCheckBox("Ã˜ÂªÃ™ÂÃ˜Â¹Ã™Å Ã™â€ž Ã˜Â§Ã™â€žÃ˜Â§Ã˜Â³Ã˜ÂªÃ™â€¦Ã˜Â§Ã˜Â¹ Ã™â€žÃ™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²")

        form.addRow("device_ip:", self.device_ip_edit)
        form.addRow("device_port:", self.device_port_spin)
        form.addRow("device_name:", self.device_name_edit)
        form.addRow("", self.enable_device_listener_checkbox)
        device_layout.addLayout(form)

        actions = QHBoxLayout()
        self.save_device_settings_btn = QPushButton("Ã˜Â­Ã™ÂÃ˜Â¸ Ã˜Â¥Ã˜Â¹Ã˜Â¯Ã˜Â§Ã˜Â¯Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²")
        self.save_device_settings_btn.setObjectName("btnGhost")
        self.listener_state_label = QLabel("-")
        self.listener_state_label.setObjectName("mutedText")
        actions.addWidget(self.save_device_settings_btn)
        actions.addStretch()
        actions.addWidget(self.listener_state_label)
        device_layout.addLayout(actions)

        layout.addWidget(data_panel)
        layout.addWidget(device_panel)
        layout.addStretch()
        return page

    def _build_member_table(self) -> QTableWidget:
        table = QTableWidget()
        table.setColumnCount(len(self.HEADERS))
        table.setHorizontalHeaderLabels(self.HEADERS)
        table.setAlternatingRowColors(True)
        table.setSelectionBehavior(QTableWidget.SelectRows)
        table.setSelectionMode(QTableWidget.SingleSelection)
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.setWordWrap(False)
        table.setShowGrid(False)

        table.verticalHeader().setVisible(False)
        table.verticalHeader().setDefaultSectionSize(46)

        header = table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.Stretch)
        header.setSectionResizeMode(9, QHeaderView.Stretch)
        return table

    def _connect_signals(self) -> None:
        self.sidebar.page_changed.connect(self.switch_page)

        self.search_edit.textChanged.connect(self.refresh_all_data)
        self.status_filter_combo.currentTextChanged.connect(self.refresh_all_data)

        self.add_member_btn.clicked.connect(self.add_member)

        self.export_btn.clicked.connect(self.export_excel)
        self.backup_btn.clicked.connect(self.backup_database)
        self.settings_export_btn.clicked.connect(self.export_excel)
        self.settings_backup_btn.clicked.connect(self.backup_database)
        self.save_device_settings_btn.clicked.connect(self.save_device_settings)

        self.k40_service.checkin_processed.connect(self._on_checkin_processed)
        self.k40_service.recent_checkins_changed.connect(self.gate_widget.update_recent_checkins)
        self.k40_service.listener_state_changed.connect(self._on_listener_state_changed)
        self.k40_service.listener_error.connect(self._on_listener_error)

    @staticmethod
    def _status_from_days(days_left: int) -> str:
        if days_left < 0:
            return STATUS_EXPIRED
        if days_left <= 7:
            return STATUS_EXPIRING
        return STATUS_ACTIVE

    @staticmethod
    def _status_color(status: str) -> QColor:
        if status == STATUS_EXPIRED:
            return QColor("#dc2626")
        if status == STATUS_EXPIRING:
            return QColor("#f59e0b")
        return QColor("#16a34a")

    @staticmethod
    def _status_bg(status: str) -> QColor:
        if status == STATUS_EXPIRED:
            return QColor("#fef2f2")
        if status == STATUS_EXPIRING:
            return QColor("#fff7ed")
        return QColor("#f0fdf4")

    def _build_actions_cell(self, member_id: int, member_name: str) -> QWidget:
        style = QApplication.style()

        renew_btn = QPushButton("Ã˜ÂªÃ˜Â¬Ã˜Â¯Ã™Å Ã˜Â¯")
        renew_btn.setObjectName("btnGhost")
        renew_btn.setIcon(style.standardIcon(QStyle.SP_BrowserReload))
        renew_btn.clicked.connect(lambda: self.renew_member_by_id(member_id, member_name, renew_btn))

        edit_btn = QPushButton()
        edit_btn.setObjectName("tableIconBtn")
        edit_btn.setIcon(style.standardIcon(QStyle.SP_FileDialogDetailedView))
        edit_btn.setToolTip("Ã˜ÂªÃ˜Â¹Ã˜Â¯Ã™Å Ã™â€ž")
        edit_btn.clicked.connect(lambda: self.edit_member_by_id(member_id))

        delete_btn = QPushButton()
        delete_btn.setObjectName("tableDeleteBtn")
        delete_btn.setIcon(style.standardIcon(QStyle.SP_TrashIcon))
        delete_btn.setToolTip("Ã˜Â­Ã˜Â°Ã™Â")
        delete_btn.clicked.connect(lambda: self.delete_member_by_id(member_id))

        cell = QWidget()
        layout = QHBoxLayout(cell)
        layout.setContentsMargins(4, 0, 4, 0)
        layout.setSpacing(6)
        layout.setAlignment(Qt.AlignCenter)
        layout.addWidget(renew_btn)
        layout.addWidget(edit_btn)
        layout.addWidget(delete_btn)
        return cell

    def _populate_member_table(self, table: QTableWidget, members: list[Member]) -> None:
        table.setRowCount(len(members))

        for row, member in enumerate(members):
            status = self._status_from_days(member.days_left)
            row_bg = self._status_bg(status)
            status_fg = self._status_color(status)

            values = [
                str(member.id),
                member.full_name,
                member.phone,
                member.start_date,
                str(member.duration_months),
                member.end_date,
                status,
                str(member.days_left),
                member.card_id or "-",
                member.notes,
            ]

            for col, value in enumerate(values):
                item = QTableWidgetItem(value)
                item.setTextAlignment(Qt.AlignCenter)
                if col in (1, 9):
                    item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
                if col == 6:
                    item.setForeground(status_fg)
                if col == 7:
                    item.setForeground(self.dashboard._days_color(member.days_left))
                item.setBackground(row_bg)
                table.setItem(row, col, item)

            table.setCellWidget(row, 10, self._build_actions_cell(member.id, member.full_name))

        table.resizeColumnsToContents()

    def _filtered_members(self, members: list[Member]) -> list[Member]:
        selected = self.status_filter_combo.currentText()
        if selected == "Ã˜Â§Ã™â€žÃ™Æ’Ã™â€ž":
            return members
        return [m for m in members if self._status_from_days(m.days_left) == selected]

    def refresh_all_data(self) -> None:
        search_members = self.db.search_members(self.search_edit.text().strip())
        all_members = self._filtered_members(search_members)

        soon = sorted([member for member in search_members if 0 <= member.days_left <= 7], key=lambda member: member.days_left)
        expired = sorted([member for member in search_members if member.days_left < 0], key=lambda member: member.days_left)

        self._populate_member_table(self.all_table, all_members)
        self._populate_member_table(self.soon_table, soon)
        self._populate_member_table(self.expired_table, expired)
        self.dashboard.update_data(self.dashboard_service.build())

    def switch_page(self, key: str) -> None:
        page_map = {
            "dashboard": 0,
            "all": 1,
            "soon": 2,
            "expired": 3,
            "gate": 4,
            "settings": 5,
        }
        self.pages.setCurrentIndex(page_map.get(key, 0))
        self.sidebar.set_active(key)

    def _show_toast(self, message: str) -> None:
        self.statusBar().showMessage(message, 3000)

    def add_member(self) -> None:
        dialog = MemberDialog(self.db, parent=self)
        if dialog.exec():
            self.refresh_all_data()
            self._show_toast("Ã˜ÂªÃ™â€¦Ã˜Âª Ã˜Â¥Ã˜Â¶Ã˜Â§Ã™ÂÃ˜Â© Ã˜Â§Ã™â€žÃ™â€žÃ˜Â§Ã˜Â¹Ã˜Â¨ Ã˜Â¨Ã™â€ Ã˜Â¬Ã˜Â§Ã˜Â­")

    def edit_member_by_id(self, member_id: int) -> None:
        member = self.db.get_member(member_id)
        if member is None:
            QMessageBox.warning(self, "Ã˜Â®Ã˜Â·Ã˜Â£", "Ã˜ÂªÃ˜Â¹Ã˜Â°Ã˜Â± Ã˜Â§Ã™â€žÃ˜Â¹Ã˜Â«Ã™Ë†Ã˜Â± Ã˜Â¹Ã™â€žÃ™â€° Ã˜Â¨Ã™Å Ã˜Â§Ã™â€ Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ™â€žÃ˜Â§Ã˜Â¹Ã˜Â¨.")
            return

        dialog = MemberDialog(
            self.db,
            member=member,
            parent=self,
            on_bind_card=self.enroll_member_card,
        )
        if dialog.exec():
            self.refresh_all_data()
            self._show_toast("Ã˜ÂªÃ™â€¦ Ã˜ÂªÃ˜Â¹Ã˜Â¯Ã™Å Ã™â€ž Ã˜Â¨Ã™Å Ã˜Â§Ã™â€ Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ™â€žÃ˜Â§Ã˜Â¹Ã˜Â¨")

    def delete_member_by_id(self, member_id: int) -> None:
        confirm = QMessageBox.question(
            self,
            "Ã˜ÂªÃ˜Â£Ã™Æ’Ã™Å Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜Â­Ã˜Â°Ã™Â",
            "Ã™â€¡Ã™â€ž Ã˜Â£Ã™â€ Ã˜Âª Ã™â€¦Ã˜ÂªÃ˜Â£Ã™Æ’Ã˜Â¯ Ã™â€¦Ã™â€  Ã˜Â­Ã˜Â°Ã™Â Ã˜Â§Ã™â€žÃ™â€žÃ˜Â§Ã˜Â¹Ã˜Â¨Ã˜Å¸",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )
        if confirm == QMessageBox.Yes:
            self.db.delete_member(member_id)
            self.refresh_all_data()
            self._show_toast("Ã˜ÂªÃ™â€¦ Ã˜Â­Ã˜Â°Ã™Â Ã˜Â§Ã™â€žÃ™â€žÃ˜Â§Ã˜Â¹Ã˜Â¨")

    def renew_member_by_id(self, member_id: int, member_name: str | None = None, trigger_btn: QPushButton | None = None) -> None:
        member = self.db.get_member(member_id)
        if member is None:
            QMessageBox.warning(self, "Ã˜Â®Ã˜Â·Ã˜Â£", "Ã˜ÂªÃ˜Â¹Ã˜Â°Ã˜Â± Ã˜Â§Ã™â€žÃ˜Â¹Ã˜Â«Ã™Ë†Ã˜Â± Ã˜Â¹Ã™â€žÃ™â€° Ã˜Â¨Ã™Å Ã˜Â§Ã™â€ Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ™â€žÃ˜Â§Ã˜Â¹Ã˜Â¨.")
            return

        name = member_name or member.full_name
        dialog = RenewalDialog(self)
        if not dialog.exec():
            return

        months = dialog.months
        confirm = QMessageBox.question(
            self,
            "Ã˜ÂªÃ˜Â£Ã™Æ’Ã™Å Ã˜Â¯ Ã˜Â§Ã™â€žÃ˜ÂªÃ˜Â¬Ã˜Â¯Ã™Å Ã˜Â¯",
            f"Ã™â€¡Ã™â€ž Ã˜ÂªÃ˜Â±Ã™Å Ã˜Â¯ Ã˜ÂªÃ˜Â¬Ã˜Â¯Ã™Å Ã˜Â¯ Ã˜Â§Ã˜Â´Ã˜ÂªÃ˜Â±Ã˜Â§Ã™Æ’ {name} Ã™â€žÃ™â€¦Ã˜Â¯Ã˜Â© {months} Ã˜Â´Ã™â€¡Ã˜Â±Ã˜Å¸",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.Yes,
        )
        if confirm != QMessageBox.Yes:
            return

        if trigger_btn is not None:
            trigger_btn.setEnabled(False)
        try:
            QApplication.processEvents()
            new_end = self.db.renew_subscription(member_id, months)
            self.refresh_all_data()
            self._show_toast(f"Ã˜ÂªÃ™â€¦ Ã˜ÂªÃ˜Â¬Ã˜Â¯Ã™Å Ã˜Â¯ Ã˜Â§Ã˜Â´Ã˜ÂªÃ˜Â±Ã˜Â§Ã™Æ’ Ã˜Â§Ã™â€žÃ™â€žÃ˜Â§Ã˜Â¹Ã˜Â¨ Ã˜Â¨Ã™â€ Ã˜Â¬Ã˜Â§Ã˜Â­ Ã˜Â­Ã˜ÂªÃ™â€°: {new_end}")
        finally:
            if trigger_btn is not None:
                trigger_btn.setEnabled(True)

    def _load_device_settings_to_form(self) -> None:
        settings = self.k40_service.get_settings()
        self.device_ip_edit.setText(settings.device_ip)
        self.device_port_spin.setValue(settings.device_port)
        self.device_name_edit.setText(settings.device_name)
        self.enable_device_listener_checkbox.setChecked(settings.enable_device_listener)
        self._render_listener_state(False, "not-started")

    def save_device_settings(self) -> None:
        next_settings = DeviceSettings(
            device_ip=self.device_ip_edit.text().strip(),
            device_port=int(self.device_port_spin.value()),
            device_name=self.device_name_edit.text().strip() or "ZKTeco K40",
            enable_device_listener=self.enable_device_listener_checkbox.isChecked(),
        )
        saved = self.k40_service.update_settings(next_settings)
        self.device_ip_edit.setText(saved.device_ip)
        self.device_port_spin.setValue(saved.device_port)
        self.device_name_edit.setText(saved.device_name)
        self.enable_device_listener_checkbox.setChecked(saved.enable_device_listener)
        self._show_toast("Ã˜ÂªÃ™â€¦ Ã˜Â­Ã™ÂÃ˜Â¸ Ã˜Â¥Ã˜Â¹Ã˜Â¯Ã˜Â§Ã˜Â¯Ã˜Â§Ã˜Âª Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²")

    def _on_listener_error(self, message: str) -> None:
        self._show_toast(message)

    def _on_listener_state_changed(self, connected: bool, state: str) -> None:
        self._render_listener_state(connected, state)

    def _render_listener_state(self, connected: bool, state: str) -> None:
        if connected:
            self.listener_state_label.setText(f"Ã˜Â­Ã˜Â§Ã™â€žÃ˜Â© Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²: Ã™â€¦Ã˜ÂªÃ˜ÂµÃ™â€ž ({state})")
            self.listener_state_label.setStyleSheet("color: #16a34a;")
            return

        if state == "disabled":
            text = "Ã˜Â­Ã˜Â§Ã™â€žÃ˜Â© Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²: Ã™â€¦Ã˜Â¹Ã˜Â·Ã™â€ž Ã™â€¦Ã™â€  Ã˜Â§Ã™â€žÃ˜Â¥Ã˜Â¹Ã˜Â¯Ã˜Â§Ã˜Â¯Ã˜Â§Ã˜Âª"
        elif state == "missing-ip":
            text = "Ã˜Â­Ã˜Â§Ã™â€žÃ˜Â© Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²: Ã˜Â£Ã˜Â¯Ã˜Â®Ã™â€ž device_ip Ã™â€žÃ™â€žÃ˜Â§Ã˜ÂªÃ˜ÂµÃ˜Â§Ã™â€ž"
        elif state == "reconnecting":
            text = "Ã˜Â­Ã˜Â§Ã™â€žÃ˜Â© Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²: Ã˜Â¥Ã˜Â¹Ã˜Â§Ã˜Â¯Ã˜Â© Ã™â€¦Ã˜Â­Ã˜Â§Ã™Ë†Ã™â€žÃ˜Â© Ã˜Â§Ã™â€žÃ˜Â§Ã˜ÂªÃ˜ÂµÃ˜Â§Ã™â€ž..."
        elif state == "stopped":
            text = "Ã˜Â­Ã˜Â§Ã™â€žÃ˜Â© Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²: Ã™â€¦Ã˜ÂªÃ™Ë†Ã™â€šÃ™Â"
        else:
            text = "Ã˜Â­Ã˜Â§Ã™â€žÃ˜Â© Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â²: Ã˜ÂºÃ™Å Ã˜Â± Ã™â€¦Ã˜ÂªÃ˜ÂµÃ™â€ž"

        self.listener_state_label.setText(text)
        self.listener_state_label.setStyleSheet("color: #b45309;")

    def _on_checkin_processed(self, event: CheckinEvent) -> None:
        self.gate_widget.show_checkin(event)
        self.switch_page("gate")

        if event.result == "ALLOW":
            QApplication.beep()
        elif event.result == "DENY":
            QApplication.beep()
            QTimer.singleShot(170, QApplication.beep)

        self._show_toast(f"{event.result} - {event.reason} - {event.card_id}")

    def enroll_member_card(self, member_id: int) -> str | None:
        settings = self.k40_service.get_settings()
        if not settings.enable_device_listener:
            QMessageBox.warning(self, "Ã˜ÂªÃ˜Â¹Ã˜Â°Ã˜Â± Ã˜Â§Ã™â€žÃ˜Â±Ã˜Â¨Ã˜Â·", "Ã™â€¦Ã™Å Ã˜Â²Ã˜Â© Ã˜Â§Ã™â€žÃ˜Â§Ã˜Â³Ã˜ÂªÃ™â€¦Ã˜Â§Ã˜Â¹ Ã™â€žÃ™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â² Ã™â€¦Ã˜Â¹Ã˜Â·Ã™â€žÃ˜Â© Ã™â€¦Ã™â€  Ã˜Â§Ã™â€žÃ˜Â¥Ã˜Â¹Ã˜Â¯Ã˜Â§Ã˜Â¯Ã˜Â§Ã˜Âª.")
            return None

        card_id = self._wait_for_next_card()
        if not card_id:
            QMessageBox.information(self, "Ã˜Â§Ã™â€ Ã˜ÂªÃ™â€¡Ã˜Âª Ã˜Â§Ã™â€žÃ™â€¦Ã™â€¡Ã™â€žÃ˜Â©", "Ã™â€žÃ™â€¦ Ã™Å Ã˜ÂªÃ™â€¦ Ã˜Â§Ã™â€žÃ˜ÂªÃ™â€šÃ˜Â§Ã˜Â· Ã˜Â¨Ã˜Â·Ã˜Â§Ã™â€šÃ˜Â© Ã˜Â®Ã™â€žÃ˜Â§Ã™â€ž 10 Ã˜Â«Ã™Ë†Ã˜Â§Ã™â€ Ã™Â.")
            return None

        self.db.link_card_to_member(member_id, card_id)
        self.refresh_all_data()
        self._show_toast(f"Ã˜ÂªÃ™â€¦ Ã˜Â±Ã˜Â¨Ã˜Â· Ã˜Â§Ã™â€žÃ˜Â¨Ã˜Â·Ã˜Â§Ã™â€šÃ˜Â©: {card_id}")
        return card_id

    def _wait_for_next_card(self) -> str | None:
        captured: dict[str, str] = {"card_id": ""}
        remaining = {"seconds": 10}

        dialog = QDialog(self)
        dialog.setWindowTitle("Ã˜Â±Ã˜Â¨Ã˜Â· Ã˜Â¨Ã˜Â·Ã˜Â§Ã™â€šÃ˜Â©")
        dialog.setLayoutDirection(Qt.RightToLeft)
        dialog.setMinimumWidth(420)

        message = QLabel("")
        message.setWordWrap(True)
        message.setAlignment(Qt.AlignRight)

        cancel_btn = QPushButton("Ã˜Â¥Ã™â€žÃ˜ÂºÃ˜Â§Ã˜Â¡")
        cancel_btn.setObjectName("btnGhost")
        cancel_btn.clicked.connect(dialog.reject)

        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)
        layout.addWidget(message)
        layout.addWidget(cancel_btn, 0, Qt.AlignLeft)

        def refresh_message() -> None:
            message.setText(f"Ã™â€¦Ã˜Â±Ã™â€˜Ã˜Â± Ã˜Â§Ã™â€žÃ˜Â¨Ã˜Â·Ã˜Â§Ã™â€šÃ˜Â© Ã˜Â¹Ã™â€žÃ™â€° Ã˜Â§Ã™â€žÃ˜Â¬Ã™â€¡Ã˜Â§Ã˜Â² Ã˜Â§Ã™â€žÃ˜Â¢Ã™â€  Ã˜Â®Ã™â€žÃ˜Â§Ã™â€ž {remaining['seconds']} Ã˜Â«Ã™Ë†Ã˜Â§Ã™â€ Ã™Â.")

        def on_tick() -> None:
            remaining["seconds"] -= 1
            if remaining["seconds"] <= 0:
                dialog.reject()
                return
            refresh_message()

        def on_raw_event(event: K40LogEvent) -> None:
            captured["card_id"] = event.card_id
            dialog.accept()

        timer = QTimer(dialog)
        timer.setInterval(1000)
        timer.timeout.connect(on_tick)

        refresh_message()
        self.k40_service.raw_event.connect(on_raw_event)
        timer.start()
        dialog.exec()
        timer.stop()

        try:
            self.k40_service.raw_event.disconnect(on_raw_event)
        except (RuntimeError, TypeError):
            pass

        return captured["card_id"] or None

    def export_excel(self) -> None:
        rows = self.db.export_rows()
        if not rows:
            QMessageBox.information(self, "Ã˜ÂªÃ™â€ Ã˜Â¨Ã™Å Ã™â€¡", "Ã™â€žÃ˜Â§ Ã˜ÂªÃ™Ë†Ã˜Â¬Ã˜Â¯ Ã˜Â¨Ã™Å Ã˜Â§Ã™â€ Ã˜Â§Ã˜Âª Ã™â€žÃ™â€žÃ˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â±.")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Ã˜Â­Ã™ÂÃ˜Â¸ Ã™â€¦Ã™â€žÃ™Â Excel",
            str(Path(f"gym_export_{date.today().isoformat()}.xlsx").resolve()),
            "Excel Files (*.xlsx)",
        )
        if not file_path:
            return

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Members"

        headers = list(rows[0].keys())
        sheet.append(headers)
        for row in rows:
            sheet.append([row[h] for h in headers])

        workbook.save(file_path)
        self._show_toast("Ã˜ÂªÃ™â€¦ Ã˜ÂªÃ˜ÂµÃ˜Â¯Ã™Å Ã˜Â± Ã˜Â§Ã™â€žÃ˜Â¨Ã™Å Ã˜Â§Ã™â€ Ã˜Â§Ã˜Âª Ã˜Â¥Ã™â€žÃ™â€° Excel")

    def backup_database(self) -> None:
        backup_path, _ = QFileDialog.getSaveFileName(
            self,
            "Ã˜Â­Ã™ÂÃ˜Â¸ Ã˜Â§Ã™â€žÃ™â€ Ã˜Â³Ã˜Â®Ã˜Â© Ã˜Â§Ã™â€žÃ˜Â§Ã˜Â­Ã˜ÂªÃ™Å Ã˜Â§Ã˜Â·Ã™Å Ã˜Â©",
            str(Path(f"gym_backup_{date.today().isoformat()}.db").resolve()),
            "Database Files (*.db)",
        )
        if not backup_path:
            return

        self.db.backup_database(backup_path)
        self._show_toast("Ã˜ÂªÃ™â€¦ Ã˜Â¥Ã™â€ Ã˜Â´Ã˜Â§Ã˜Â¡ Ã˜Â§Ã™â€žÃ™â€ Ã˜Â³Ã˜Â®Ã˜Â© Ã˜Â§Ã™â€žÃ˜Â§Ã˜Â­Ã˜ÂªÃ™Å Ã˜Â§Ã˜Â·Ã™Å Ã˜Â©")

    def closeEvent(self, event) -> None:  # noqa: N802
        self.k40_service.stop()
        self.db.close()
        super().closeEvent(event)
