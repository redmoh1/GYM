"""Modern professional main window (UI-only redesign)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from openpyxl import Workbook
from PySide6.QtCore import Qt
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
from ui.widgets import CardWidget


class MainWindow(QMainWindow):
    """Main shell with Sidebar + TopBar + Dashboard + Data Pages."""

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

    def __init__(self) -> None:
        super().__init__()
        self.db = GymDatabase("gym.db")

        self.setWindowTitle("Gym Management System - إدارة اشتراكات الجيم")
        self.resize(1400, 860)
        self.setLayoutDirection(Qt.RightToLeft)

        self.search_edit = QLineEdit()
        self.search_edit.setObjectName("searchInput")
        self.search_edit.setPlaceholderText("ابحث بالاسم أو رقم الهاتف...")

        self.add_member_btn = QPushButton("+ إضافة لاعب")

        self.status_filter_combo = QComboBox()
        self.status_filter_combo.addItems(["الكل", "ساري", "قريب ينتهي", "منتهي"])

        self.all_table = self._build_table()
        self.expired_table = self._build_table()
        self.soon_table = self._build_table()
        self.renew_table = self._build_table()
        self.dashboard_soon_table = self._build_table(show_actions=False)

        self.card_active = CardWidget("المشتركون النشطون", "0", "primary")
        self.card_soon = CardWidget("قريب ينتهي", "0", "warning")
        self.card_expired = CardWidget("المنتهون", "0", "danger")

        self.sidebar_buttons: dict[str, QPushButton] = {}
        self.pages = QStackedWidget()

        self._build_ui()
        self._connect_signals()

        self.refresh_all_data()
        self.show_alerts()

    def _build_ui(self) -> None:
        root = QWidget(objectName="appRoot")
        self.setCentralWidget(root)

        root_layout = QHBoxLayout(root)
        root_layout.setContentsMargins(14, 14, 14, 14)
        root_layout.setSpacing(14)

        sidebar = self._create_sidebar()

        main_container = QWidget()
        main_layout = QVBoxLayout(main_container)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(14)
        main_layout.addWidget(self._create_topbar())
        main_layout.addWidget(self._create_pages(), 1)

        root_layout.addWidget(sidebar)
        root_layout.addWidget(main_container, 1)

    def _create_sidebar(self) -> QWidget:
        sidebar = QFrame(objectName="sidebar")
        sidebar.setFixedWidth(235)
        layout = QVBoxLayout(sidebar)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(8)

        brand = QLabel("GYM MANAGER", objectName="brandTitle")
        layout.addWidget(brand)
        layout.addSpacing(10)

        items = [
            ("dashboard", "لوحة التحكم"),
            ("all", "جميع اللاعبين"),
            ("soon", "قريب ينتهي"),
            ("expired", "المنتهين"),
            ("renew", "التجديد"),
            ("settings", "الإعدادات"),
        ]

        for key, text in items:
            btn = QPushButton(text)
            btn.setCheckable(True)
            btn.setProperty("class", "navBtn")
            btn.setCursor(Qt.PointingHandCursor)
            btn.clicked.connect(lambda _=False, page_key=key: self.switch_page(page_key))
            self.sidebar_buttons[key] = btn
            layout.addWidget(btn)

        layout.addStretch()
        self.sidebar_buttons["dashboard"].setChecked(True)
        return sidebar

    def _create_topbar(self) -> QWidget:
        frame = QFrame(objectName="topBar")
        layout = QHBoxLayout(frame)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(10)

        system_name = QLabel("نظام إدارة اشتراكات الجيم", objectName="systemName")
        system_name.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)

        layout.addWidget(system_name)
        layout.addWidget(self.search_edit, 1)
        layout.addWidget(self.add_member_btn)
        return frame

    def _create_pages(self) -> QWidget:
        self.pages.addWidget(self._build_dashboard_page())
        self.pages.addWidget(self._build_all_players_page())
        self.pages.addWidget(self._build_soon_page())
        self.pages.addWidget(self._build_expired_page())
        self.pages.addWidget(self._build_renew_page())
        self.pages.addWidget(self._build_settings_page())
        return self.pages

    def _build_dashboard_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(14)

        cards_row = QHBoxLayout()
        cards_row.setSpacing(14)
        cards_row.addWidget(self.card_active)
        cards_row.addWidget(self.card_soon)
        cards_row.addWidget(self.card_expired)
        layout.addLayout(cards_row)

        panel = QFrame(objectName="sectionPanel")
        panel_layout = QVBoxLayout(panel)
        panel_layout.setContentsMargins(14, 14, 14, 14)
        panel_layout.setSpacing(10)

        title = QLabel("أقرب 10 اشتراكات تنتهي", objectName="sectionTitle")
        panel_layout.addWidget(title)
        panel_layout.addWidget(self.dashboard_soon_table)

        layout.addWidget(panel, 1)
        return page

    def _build_all_players_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        actions = QHBoxLayout()
        actions.addWidget(QLabel("فلترة حسب الحالة:", objectName="mutedText"))
        actions.addWidget(self.status_filter_combo)

        self.export_btn = QPushButton("تصدير Excel")
        self.export_btn.setObjectName("btnGhost")
        self.backup_btn = QPushButton("نسخ احتياطي")
        self.backup_btn.setObjectName("btnGhost")

        actions.addStretch()
        actions.addWidget(self.export_btn)
        actions.addWidget(self.backup_btn)

        layout.addLayout(actions)
        layout.addWidget(self.all_table, 1)
        return page

    def _build_soon_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)
        layout.addWidget(QLabel("اللاعبون القريبون من انتهاء الاشتراك", objectName="sectionTitle"))
        layout.addWidget(self.soon_table, 1)
        return page

    def _build_expired_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)
        layout.addWidget(QLabel("الاشتراكات المنتهية", objectName="sectionTitle"))
        layout.addWidget(self.expired_table, 1)
        return page

    def _build_renew_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        note = QLabel("اختر لاعبًا من الجدول ثم اضغط تجديد الاشتراك.", objectName="mutedText")
        self.renew_btn = QPushButton("تجديد الاشتراك")
        top = QHBoxLayout()
        top.addWidget(note)
        top.addStretch()
        top.addWidget(self.renew_btn)

        layout.addLayout(top)
        layout.addWidget(self.renew_table, 1)
        return page

    def _build_settings_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        panel = QFrame(objectName="sectionPanel")
        p_layout = QVBoxLayout(panel)
        p_layout.setContentsMargins(16, 16, 16, 16)
        p_layout.setSpacing(10)

        p_layout.addWidget(QLabel("إعدادات النظام", objectName="sectionTitle"))
        p_layout.addWidget(QLabel("يمكنك تنفيذ العمليات الإدارية من هنا.", objectName="mutedText"))

        row = QHBoxLayout()
        self.settings_export_btn = QPushButton("تصدير البيانات")
        self.settings_export_btn.setObjectName("btnGhost")
        self.settings_backup_btn = QPushButton("نسخة احتياطية")
        self.settings_backup_btn.setObjectName("btnGhost")
        row.addWidget(self.settings_export_btn)
        row.addWidget(self.settings_backup_btn)
        row.addStretch()

        p_layout.addLayout(row)
        layout.addWidget(panel)
        layout.addStretch()
        return page

    def _build_table(self, show_actions: bool = True) -> QTableWidget:
        table = QTableWidget()
        headers = self.HEADERS if show_actions else self.HEADERS[:-2]
        table.setColumnCount(len(headers))
        table.setHorizontalHeaderLabels(headers)
        table.setAlternatingRowColors(True)
        table.setSelectionBehavior(QTableWidget.SelectRows)
        table.setSelectionMode(QTableWidget.SingleSelection)
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.setShowGrid(False)
        table.verticalHeader().setVisible(False)
        table.verticalHeader().setDefaultSectionSize(46)
        table.setWordWrap(False)
        table.setSortingEnabled(False)

        header = table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.Stretch)
        return table

    def _connect_signals(self) -> None:
        self.search_edit.textChanged.connect(self.refresh_all_data)
        self.status_filter_combo.currentTextChanged.connect(self.refresh_all_data)

        self.add_member_btn.clicked.connect(self.add_member)
        self.renew_btn.clicked.connect(self.renew_member)

        self.export_btn.clicked.connect(self.export_excel)
        self.backup_btn.clicked.connect(self.backup_database)
        self.settings_export_btn.clicked.connect(self.export_excel)
        self.settings_backup_btn.clicked.connect(self.backup_database)

    def switch_page(self, key: str) -> None:
        order = {
            "dashboard": 0,
            "all": 1,
            "soon": 2,
            "expired": 3,
            "renew": 4,
            "settings": 5,
        }
        self.pages.setCurrentIndex(order.get(key, 0))

        for btn_key, btn in self.sidebar_buttons.items():
            btn.setChecked(btn_key == key)

    def _status_color(self, status: str) -> Qt.GlobalColor:
        if status == "منتهي":
            return Qt.red
        if status == "قريب ينتهي":
            return Qt.darkYellow
        return Qt.darkGreen

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
        edit_layout = QHBoxLayout(edit_cell)
        edit_layout.setContentsMargins(0, 0, 0, 0)
        edit_layout.setAlignment(Qt.AlignCenter)
        edit_layout.addWidget(edit_btn)

        delete_cell = QWidget()
        delete_layout = QHBoxLayout(delete_cell)
        delete_layout.setContentsMargins(0, 0, 0, 0)
        delete_layout.setAlignment(Qt.AlignCenter)
        delete_layout.addWidget(delete_btn)

        table.setCellWidget(row, 9, edit_cell)
        table.setCellWidget(row, 10, delete_cell)

    def _populate_table(self, table: QTableWidget, members: list[Member], show_actions: bool = True) -> None:
        table.setRowCount(len(members))

        for row_index, member in enumerate(members):
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

            for col_index, value in enumerate(values):
                item = QTableWidgetItem(value)
                item.setTextAlignment(Qt.AlignCenter)

                if col_index in (1, 8):
                    item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)

                if col_index == 6:
                    item.setForeground(self._status_color(member.status))

                table.setItem(row_index, col_index, item)

            if show_actions:
                self._add_action_buttons(table, row_index, member.id)

        table.resizeColumnsToContents()

    def _filtered_members(self) -> list[Member]:
        members = self.db.search_members(self.search_edit.text().strip())
        selected = self.status_filter_combo.currentText()

        if selected == "الكل":
            return members
        return [member for member in members if member.status == selected]

    def refresh_all_data(self) -> None:
        all_members = self._filtered_members()
        soon = self.db.get_ending_soon_members()
        expired = self.db.get_expired_members()

        self._populate_table(self.all_table, all_members, show_actions=True)
        self._populate_table(self.soon_table, soon, show_actions=True)
        self._populate_table(self.expired_table, expired, show_actions=True)
        self._populate_table(self.renew_table, self.db.search_members(self.search_edit.text().strip()), show_actions=True)
        self._populate_table(self.dashboard_soon_table, soon[:10], show_actions=False)

        self._refresh_cards()

    def _refresh_cards(self) -> None:
        counters = self.db.get_counters()
        self.card_active.set_value(counters["active"])
        self.card_soon.set_value(counters["ending_soon"])
        self.card_expired.set_value(counters["expired"])

    def _selected_member_id(self) -> int | None:
        focus_widget = QApplication.focusWidget()

        for table in [self.all_table, self.soon_table, self.expired_table, self.renew_table]:
            if table is focus_widget or table.isAncestorOf(focus_widget):
                row = table.currentRow()
                if row >= 0 and table.item(row, 0):
                    return int(table.item(row, 0).text())

        page_idx = self.pages.currentIndex()
        table_map = {1: self.all_table, 2: self.soon_table, 3: self.expired_table, 4: self.renew_table}
        active = table_map.get(page_idx)
        if active is not None:
            row = active.currentRow()
            if row >= 0 and active.item(row, 0):
                return int(active.item(row, 0).text())

        return None

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