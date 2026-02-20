"""Modern commercial-grade main window (UI/UX layer only)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from openpyxl import Workbook
from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QInputDialog,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSizePolicy,
    QStackedWidget,
    QStyle,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from database import GymDatabase, Member
from ui.member_dialog import MemberDialog
from ui.widgets import AnimatedButton, CardWidget, Sidebar


class MainWindow(QMainWindow):
    """Main shell with Sidebar, TopBar, Dashboard and operational pages."""

    HEADERS = [
        "ID",
        "الاسم",
        "الهاتف",
        "بداية الاشتراك",
        "المدة (شهر)",
        "نهاية الاشتراك",
        "الحالة",
        "المتبقي",
        "ملاحظات",
        "تعديل",
        "حذف",
    ]

    STATUS_COLORS = {
        "ساري": QColor("#16a34a"),
        "قريب ينتهي": QColor("#f59e0b"),
        "منتهي": QColor("#dc2626"),
    }

    STATUS_BG = {
        "ساري": QColor("#f0fdf4"),
        "قريب ينتهي": QColor("#fff7ed"),
        "منتهي": QColor("#fef2f2"),
    }

    def __init__(self) -> None:
        super().__init__()
        self.db = GymDatabase("gym.db")

        self.setWindowTitle("Gym Management System - إدارة اشتراكات الجيم")
        self.resize(1460, 900)
        self.setMinimumSize(1180, 720)
        self.setLayoutDirection(Qt.RightToLeft)

        self.search_edit = QLineEdit(objectName="searchInput")
        self.search_edit.setPlaceholderText("ابحث بالاسم أو رقم الهاتف...")

        self.add_member_btn = AnimatedButton("+ إضافة لاعب")

        self.status_filter_combo = QComboBox()
        self.status_filter_combo.addItems(["الكل", "ساري", "قريب ينتهي", "منتهي"])

        self.all_table = self._build_table(show_actions=True)
        self.soon_table = self._build_table(show_actions=True)
        self.expired_table = self._build_table(show_actions=True)
        self.renew_table = self._build_table(show_actions=True)
        self.dashboard_soon_table = self._build_table(show_actions=False)

        self.card_active = CardWidget("المشتركين النشطين", "0", "primary")
        self.card_soon = CardWidget("القريبين من الانتهاء", "0", "warning")
        self.card_expired = CardWidget("المنتهين", "0", "danger")

        self.sidebar = Sidebar()
        self.pages = QStackedWidget()

        self._build_ui()
        self._connect_signals()

        self.refresh_all_data()
        self.show_alerts()

    def _build_ui(self) -> None:
        root = QWidget(objectName="appRoot")
        self.setCentralWidget(root)

        root_layout = QHBoxLayout(root)
        root_layout.setContentsMargins(16, 16, 16, 16)
        root_layout.setSpacing(14)

        content = QWidget()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(14)
        content_layout.addWidget(self._build_topbar())
        content_layout.addWidget(self._build_pages(), 1)

        root_layout.addWidget(self.sidebar)
        root_layout.addWidget(content, 1)

    def _build_topbar(self) -> QWidget:
        topbar = QFrame(objectName="topBar")
        layout = QHBoxLayout(topbar)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(10)

        title = QLabel("نظام إدارة اشتراكات الجيم", objectName="systemName")
        title.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)

        layout.addWidget(title)
        layout.addWidget(self.search_edit, 1)
        layout.addWidget(self.add_member_btn)
        return topbar

    def _build_pages(self) -> QWidget:
        self.pages.addWidget(self._dashboard_page())
        self.pages.addWidget(self._all_page())
        self.pages.addWidget(self._soon_page())
        self.pages.addWidget(self._expired_page())
        self.pages.addWidget(self._renew_page())
        self.pages.addWidget(self._settings_page())
        return self.pages

    def _dashboard_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(14)

        cards = QHBoxLayout()
        cards.setSpacing(14)
        cards.addWidget(self.card_active, 1)
        cards.addWidget(self.card_soon, 1)
        cards.addWidget(self.card_expired, 1)

        panel = QFrame(objectName="sectionPanel")
        panel_layout = QVBoxLayout(panel)
        panel_layout.setContentsMargins(14, 14, 14, 14)
        panel_layout.setSpacing(10)
        panel_layout.addWidget(QLabel("أقرب 10 اشتراكات تنتهي", objectName="sectionTitle"))
        panel_layout.addWidget(self.dashboard_soon_table)

        layout.addLayout(cards)
        layout.addWidget(panel, 1)
        layout.setStretch(0, 0)
        layout.setStretch(1, 1)
        return page

    def _all_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        toolbar = QHBoxLayout()
        toolbar.addWidget(QLabel("فلترة حسب الحالة:", objectName="mutedText"))
        toolbar.addWidget(self.status_filter_combo)

        self.export_btn = QPushButton("تصدير Excel")
        self.export_btn.setObjectName("btnGhost")

        self.backup_btn = QPushButton("نسخ احتياطي")
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
        layout.setSpacing(10)
        layout.addWidget(QLabel("الاشتراكات القريبة من الانتهاء", objectName="sectionTitle"))
        layout.addWidget(self.soon_table, 1)
        return page

    def _expired_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)
        layout.addWidget(QLabel("الاشتراكات المنتهية", objectName="sectionTitle"))
        layout.addWidget(self.expired_table, 1)
        return page

    def _renew_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        top = QHBoxLayout()
        top.addWidget(QLabel("اختر لاعبًا من الجدول ثم اضغط تجديد الاشتراك.", objectName="mutedText"))
        top.addStretch()

        self.renew_btn = QPushButton("تجديد الاشتراك")
        self.renew_btn.setObjectName("btnGhost")
        top.addWidget(self.renew_btn)

        layout.addLayout(top)
        layout.addWidget(self.renew_table, 1)
        return page

    def _settings_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)

        panel = QFrame(objectName="sectionPanel")
        panel_layout = QVBoxLayout(panel)
        panel_layout.setContentsMargins(18, 18, 18, 18)
        panel_layout.setSpacing(12)

        panel_layout.addWidget(QLabel("الإعدادات", objectName="sectionTitle"))
        panel_layout.addWidget(QLabel("يمكنك إدارة النسخ الاحتياطي والتصدير من هذه الصفحة.", objectName="mutedText"))

        row = QHBoxLayout()
        self.settings_export_btn = QPushButton("تصدير البيانات")
        self.settings_export_btn.setObjectName("btnGhost")
        self.settings_backup_btn = QPushButton("نسخة احتياطية")
        self.settings_backup_btn.setObjectName("btnGhost")

        row.addWidget(self.settings_export_btn)
        row.addWidget(self.settings_backup_btn)
        row.addStretch()
        panel_layout.addLayout(row)

        layout.addWidget(panel)
        layout.addStretch()
        return page

    def _build_table(self, show_actions: bool) -> QTableWidget:
        table = QTableWidget()
        headers = self.HEADERS if show_actions else self.HEADERS[:-2]

        table.setColumnCount(len(headers))
        table.setHorizontalHeaderLabels(headers)
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
        return table

    def _connect_signals(self) -> None:
        self.sidebar.page_changed.connect(self.switch_page)

        self.search_edit.textChanged.connect(self.refresh_all_data)
        self.status_filter_combo.currentTextChanged.connect(self.refresh_all_data)

        self.add_member_btn.clicked.connect(self.add_member)
        self.renew_btn.clicked.connect(self.renew_member)

        self.export_btn.clicked.connect(self.export_excel)
        self.backup_btn.clicked.connect(self.backup_database)
        self.settings_export_btn.clicked.connect(self.export_excel)
        self.settings_backup_btn.clicked.connect(self.backup_database)

    def switch_page(self, key: str) -> None:
        page_map = {
            "dashboard": 0,
            "all": 1,
            "soon": 2,
            "expired": 3,
            "renew": 4,
            "settings": 5,
        }
        self.pages.setCurrentIndex(page_map.get(key, 0))
        self.sidebar.set_active(key)

    def _status_color(self, status: str) -> QColor:
        return self.STATUS_COLORS.get(status, QColor("#334155"))

    def _status_bg(self, status: str) -> QColor:
        return self.STATUS_BG.get(status, QColor("#ffffff"))

    def _add_action_buttons(self, table: QTableWidget, row: int, member_id: int) -> None:
        style = QApplication.style()

        edit_btn = QPushButton()
        edit_btn.setObjectName("tableIconBtn")
        edit_btn.setIcon(style.standardIcon(QStyle.SP_FileDialogDetailedView))
        edit_btn.setToolTip("تعديل")
        edit_btn.clicked.connect(lambda: self.edit_member_by_id(member_id))

        delete_btn = QPushButton()
        delete_btn.setObjectName("tableDeleteBtn")
        delete_btn.setIcon(style.standardIcon(QStyle.SP_TrashIcon))
        delete_btn.setToolTip("حذف")
        delete_btn.clicked.connect(lambda: self.delete_member_by_id(member_id))

        edit_cell = QWidget()
        edit_l = QHBoxLayout(edit_cell)
        edit_l.setContentsMargins(0, 0, 0, 0)
        edit_l.setAlignment(Qt.AlignCenter)
        edit_l.addWidget(edit_btn)

        delete_cell = QWidget()
        delete_l = QHBoxLayout(delete_cell)
        delete_l.setContentsMargins(0, 0, 0, 0)
        delete_l.setAlignment(Qt.AlignCenter)
        delete_l.addWidget(delete_btn)

        table.setCellWidget(row, 9, edit_cell)
        table.setCellWidget(row, 10, delete_cell)

    def _populate_table(self, table: QTableWidget, members: list[Member], show_actions: bool) -> None:
        table.setRowCount(len(members))

        for row, member in enumerate(members):
            values = [
                str(member.id),
                member.full_name,
                member.phone,
                member.start_date,
                str(member.duration_months),
                member.end_date,
                member.status,
                str(member.days_left),
                member.notes,
            ]

            # Example of dynamic status coloring on each row.
            row_bg = self._status_bg(member.status)
            status_fg = self._status_color(member.status)

            for col, value in enumerate(values):
                item = QTableWidgetItem(value)
                item.setTextAlignment(Qt.AlignCenter)

                if col in (1, 8):
                    item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)

                if col == 6:
                    item.setForeground(status_fg)

                item.setBackground(row_bg)
                table.setItem(row, col, item)

            if show_actions:
                self._add_action_buttons(table, row, member.id)

        table.resizeColumnsToContents()

    def _filtered_members(self) -> list[Member]:
        members = self.db.search_members(self.search_edit.text().strip())
        selected = self.status_filter_combo.currentText()

        if selected == "الكل":
            return members
        return [m for m in members if m.status == selected]

    def refresh_all_data(self) -> None:
        search_members = self.db.search_members(self.search_edit.text().strip())
        all_members = self._filtered_members()
        soon = self.db.get_ending_soon_members()
        expired = self.db.get_expired_members()

        self._populate_table(self.all_table, all_members, show_actions=True)
        self._populate_table(self.soon_table, soon, show_actions=True)
        self._populate_table(self.expired_table, expired, show_actions=True)
        self._populate_table(self.renew_table, search_members, show_actions=True)
        self._populate_table(self.dashboard_soon_table, soon[:10], show_actions=False)

        self._refresh_cards()

    def _refresh_cards(self) -> None:
        counters = self.db.get_counters()
        self.card_active.set_value(counters["active"])
        self.card_soon.set_value(counters["ending_soon"])
        self.card_expired.set_value(counters["expired"])

    def _selected_member_id(self) -> int | None:
        table_by_page = {
            1: self.all_table,
            2: self.soon_table,
            3: self.expired_table,
            4: self.renew_table,
        }

        active_table = table_by_page.get(self.pages.currentIndex())
        if active_table is None:
            return None

        row = active_table.currentRow()
        if row < 0 or active_table.item(row, 0) is None:
            return None

        return int(active_table.item(row, 0).text())

    def add_member(self) -> None:
        dialog = MemberDialog(self.db, parent=self)
        if dialog.exec():
            self.refresh_all_data()

    def edit_member_by_id(self, member_id: int) -> None:
        member = self.db.get_member(member_id)
        if member is None:
            QMessageBox.warning(self, "خطأ", "تعذر العثور على بيانات اللاعب.")
            return

        dialog = MemberDialog(self.db, member=member, parent=self)
        if dialog.exec():
            self.refresh_all_data()

    def delete_member_by_id(self, member_id: int) -> None:
        confirm = QMessageBox.question(
            self,
            "تأكيد الحذف",
            "هل أنت متأكد من حذف اللاعب؟",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )
        if confirm == QMessageBox.Yes:
            self.db.delete_member(member_id)
            self.refresh_all_data()

    def renew_member(self) -> None:
        member_id = self._selected_member_id()
        if member_id is None:
            QMessageBox.information(self, "تنبيه", "اختر لاعبًا أولًا.")
            return

        months, ok = QInputDialog.getInt(
            self,
            "تجديد الاشتراك",
            "عدد الأشهر للتجديد:",
            1,
            1,
            24,
            1,
        )
        if not ok:
            return

        self.db.renew_subscription(member_id, months)
        self.refresh_all_data()
        QMessageBox.information(self, "تم", "تم تجديد الاشتراك بنجاح.")

    def export_excel(self) -> None:
        rows = self.db.export_rows()
        if not rows:
            QMessageBox.information(self, "تنبيه", "لا توجد بيانات للتصدير.")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "حفظ ملف Excel",
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
        QMessageBox.information(self, "تم", "تم تصدير البيانات إلى Excel بنجاح.")

    def backup_database(self) -> None:
        backup_path, _ = QFileDialog.getSaveFileName(
            self,
            "حفظ النسخة الاحتياطية",
            str(Path(f"gym_backup_{date.today().isoformat()}.db").resolve()),
            "Database Files (*.db)",
        )
        if not backup_path:
            return

        self.db.backup_database(backup_path)
        QMessageBox.information(self, "تم", "تم إنشاء النسخة الاحتياطية بنجاح.")

    def show_alerts(self) -> None:
        expired = self.db.get_expired_members()
        soon = self.db.get_ending_soon_members()

        messages = []
        if expired:
            messages.append(f"عدد الاشتراكات المنتهية: {len(expired)}")
        if soon:
            messages.append(f"عدد الاشتراكات القريبة من الانتهاء: {len(soon)}")

        if messages:
            QMessageBox.warning(self, "تنبيه الاشتراكات", "\n".join(messages))

    def closeEvent(self, event) -> None:  # noqa: N802
        self.db.close()
        super().closeEvent(event)
