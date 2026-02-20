"""Modern main window for Gym Management System (Python/PySide6)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from openpyxl import Workbook
from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QApplication,
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

from database import GymDatabase, Member
from ui.dashboard_page import DashboardWidget
from ui.member_dialog import MemberDialog
from ui.services.dashboard_service import DashboardService
from ui.widgets import AnimatedButton, Sidebar


class RenewalDialog(QDialog):
    """Small dialog to select renewal months."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("تجديد الاشتراك")
        self.setLayoutDirection(Qt.RightToLeft)
        self.setMinimumWidth(300)

        self.months_spin = QSpinBox()
        self.months_spin.setRange(1, 12)
        self.months_spin.setValue(1)

        form = QFormLayout()
        form.addRow("عدد الأشهر:", self.months_spin)

        ok_btn = QPushButton("تأكيد")
        cancel_btn = QPushButton("إلغاء")
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


class MainWindow(QMainWindow):
    """Main shell with sidebar, dashboard and members pages."""

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
        "إجراءات",
    ]

    def __init__(self) -> None:
        super().__init__()
        self.db = GymDatabase("gym.db")
        self.dashboard_service = DashboardService(self.db)

        self.setWindowTitle("Gym Manager")
        self.resize(1460, 900)
        self.setMinimumSize(1180, 720)
        self.setLayoutDirection(Qt.RightToLeft)

        self.sidebar = Sidebar()
        self.pages = QStackedWidget()

        self.search_edit = QLineEdit(objectName="searchInput")
        self.search_edit.setPlaceholderText("ابحث بالاسم أو الهاتف...")
        self.search_edit.addAction(self.style().standardIcon(QStyle.SP_FileDialogContentsView), QLineEdit.LeadingPosition)

        self.add_member_btn = AnimatedButton("+ إضافة لاعب")
        self.status_filter_combo = QComboBox()
        self.status_filter_combo.addItems(["الكل", "ساري", "قريب ينتهي", "منتهي"])

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

        self._build_ui()
        self._connect_signals()
        self.refresh_all_data()

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

        title = QLabel("نظام إدارة اشتراكات الجيم", objectName="systemName")
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
        self.pages.addWidget(self._settings_page())
        return self.pages

    def _all_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        toolbar = QHBoxLayout()
        toolbar.setSpacing(8)
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
        layout.setSpacing(8)
        layout.addWidget(QLabel("الاشتراكات القريبة من الانتهاء", objectName="sectionTitle"))
        layout.addWidget(self.soon_table, 1)
        return page

    def _expired_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        layout.addWidget(QLabel("الاشتراكات المنتهية", objectName="sectionTitle"))
        layout.addWidget(self.expired_table, 1)
        return page

    def _settings_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)

        panel = QFrame(objectName="sectionPanel")
        panel_layout = QVBoxLayout(panel)
        panel_layout.setContentsMargins(16, 16, 16, 16)
        panel_layout.setSpacing(10)

        panel_layout.addWidget(QLabel("الإعدادات", objectName="sectionTitle"))
        panel_layout.addWidget(QLabel("إدارة التصدير والنسخ الاحتياطي.", objectName="mutedText"))

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

    @staticmethod
    def _status_from_days(days_left: int) -> str:
        if days_left < 0:
            return "منتهي"
        if days_left <= 7:
            return "قريب ينتهي"
        return "ساري"

    @staticmethod
    def _status_color(status: str) -> QColor:
        if status == "منتهي":
            return QColor("#dc2626")
        if status == "قريب ينتهي":
            return QColor("#f59e0b")
        return QColor("#16a34a")

    @staticmethod
    def _status_bg(status: str) -> QColor:
        if status == "منتهي":
            return QColor("#fef2f2")
        if status == "قريب ينتهي":
            return QColor("#fff7ed")
        return QColor("#f0fdf4")

    def _build_actions_cell(self, member_id: int, member_name: str) -> QWidget:
        style = QApplication.style()

        renew_btn = QPushButton("تجديد")
        renew_btn.setObjectName("btnGhost")
        renew_btn.setIcon(style.standardIcon(QStyle.SP_BrowserReload))
        renew_btn.clicked.connect(lambda: self.renew_member_by_id(member_id, member_name, renew_btn))

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
                member.notes,
            ]

            for col, value in enumerate(values):
                item = QTableWidgetItem(value)
                item.setTextAlignment(Qt.AlignCenter)
                if col in (1, 8):
                    item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
                if col == 6:
                    item.setForeground(status_fg)
                if col == 7:
                    item.setForeground(self.dashboard._days_color(member.days_left))
                item.setBackground(row_bg)
                table.setItem(row, col, item)

            table.setCellWidget(row, 9, self._build_actions_cell(member.id, member.full_name))

        table.resizeColumnsToContents()

    def _filtered_members(self, members: list[Member]) -> list[Member]:
        selected = self.status_filter_combo.currentText()
        if selected == "الكل":
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
            "settings": 4,
        }
        self.pages.setCurrentIndex(page_map.get(key, 0))
        self.sidebar.set_active(key)

    def _show_toast(self, message: str) -> None:
        self.statusBar().showMessage(message, 3000)

    def add_member(self) -> None:
        dialog = MemberDialog(self.db, parent=self)
        if dialog.exec():
            self.refresh_all_data()
            self._show_toast("تمت إضافة اللاعب بنجاح")

    def edit_member_by_id(self, member_id: int) -> None:
        member = self.db.get_member(member_id)
        if member is None:
            QMessageBox.warning(self, "خطأ", "تعذر العثور على بيانات اللاعب.")
            return

        dialog = MemberDialog(self.db, member=member, parent=self)
        if dialog.exec():
            self.refresh_all_data()
            self._show_toast("تم تعديل بيانات اللاعب")

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
            self._show_toast("تم حذف اللاعب")

    def renew_member_by_id(self, member_id: int, member_name: str | None = None, trigger_btn: QPushButton | None = None) -> None:
        member = self.db.get_member(member_id)
        if member is None:
            QMessageBox.warning(self, "خطأ", "تعذر العثور على بيانات اللاعب.")
            return

        name = member_name or member.full_name
        dialog = RenewalDialog(self)
        if not dialog.exec():
            return

        months = dialog.months
        confirm = QMessageBox.question(
            self,
            "تأكيد التجديد",
            f"هل تريد تجديد اشتراك {name} لمدة {months} شهر؟",
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
            self._show_toast(f"تم تجديد اشتراك اللاعب بنجاح حتى: {new_end}")
        finally:
            if trigger_btn is not None:
                trigger_btn.setEnabled(True)

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
        self._show_toast("تم تصدير البيانات إلى Excel")

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
        self._show_toast("تم إنشاء النسخة الاحتياطية")

    def closeEvent(self, event) -> None:  # noqa: N802
        self.db.close()
        super().closeEvent(event)