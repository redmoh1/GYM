"""Dialog window for adding/editing members (keeps existing business logic)."""

from __future__ import annotations

from PySide6.QtCore import QDate, Qt
from PySide6.QtWidgets import (
    QDateEdit,
    QDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTextEdit,
    QVBoxLayout,
)

from database import GymDatabase


class MemberDialog(QDialog):
    """Reusable form dialog for add/edit member."""

    def __init__(self, db: GymDatabase, member=None, parent=None) -> None:
        super().__init__(parent)
        self.db = db
        self.member = member

        self.setWindowTitle("إضافة لاعب جديد" if member is None else "تعديل بيانات لاعب")
        self.setMinimumWidth(460)
        self.setLayoutDirection(Qt.RightToLeft)

        self.full_name_edit = QLineEdit()
        self.phone_edit = QLineEdit()

        self.start_date_edit = QDateEdit()
        self.start_date_edit.setCalendarPopup(True)
        self.start_date_edit.setDisplayFormat("yyyy-MM-dd")
        self.start_date_edit.setDate(QDate.currentDate())

        self.duration_spin = QSpinBox()
        self.duration_spin.setRange(1, 60)
        self.duration_spin.setValue(1)

        self.preview_end_label = QLabel("-")
        self.notes_edit = QTextEdit()
        self.notes_edit.setPlaceholderText("ملاحظات إضافية...")
        self.notes_edit.setFixedHeight(110)

        self.duration_spin.valueChanged.connect(self.update_end_preview)
        self.start_date_edit.dateChanged.connect(self.update_end_preview)

        form = QFormLayout()
        form.setLabelAlignment(Qt.AlignRight)
        form.setHorizontalSpacing(14)
        form.setVerticalSpacing(12)
        form.addRow("الاسم الكامل:", self.full_name_edit)
        form.addRow("رقم الهاتف:", self.phone_edit)
        form.addRow("تاريخ البداية:", self.start_date_edit)
        form.addRow("مدة الاشتراك (أشهر):", self.duration_spin)
        form.addRow("تاريخ النهاية (تلقائي):", self.preview_end_label)
        form.addRow("ملاحظات:", self.notes_edit)

        save_btn = QPushButton("حفظ")
        cancel_btn = QPushButton("إلغاء")
        cancel_btn.setObjectName("btnGhost")

        save_btn.clicked.connect(self.save_member)
        cancel_btn.clicked.connect(self.reject)

        buttons = QHBoxLayout()
        buttons.addStretch()
        buttons.addWidget(cancel_btn)
        buttons.addWidget(save_btn)

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 18, 18, 18)
        root.setSpacing(14)
        root.addLayout(form)
        root.addLayout(buttons)

        if self.member is not None:
            self._fill_data()

        self.update_end_preview()

    def _fill_data(self) -> None:
        self.full_name_edit.setText(self.member.full_name)
        self.phone_edit.setText(self.member.phone)
        self.start_date_edit.setDate(QDate.fromString(self.member.start_date, "yyyy-MM-dd"))
        self.duration_spin.setValue(self.member.duration_months)
        self.notes_edit.setPlainText(self.member.notes)

    def update_end_preview(self) -> None:
        start_date = self.start_date_edit.date().toString("yyyy-MM-dd")
        duration = self.duration_spin.value()
        self.preview_end_label.setText(self.db.calculate_end_date(start_date, duration))

    def _validate(self) -> bool:
        if not self.full_name_edit.text().strip():
            QMessageBox.warning(self, "تنبيه", "الرجاء إدخال الاسم الكامل.")
            return False
        if not self.phone_edit.text().strip():
            QMessageBox.warning(self, "تنبيه", "الرجاء إدخال رقم الهاتف.")
            return False
        return True

    def save_member(self) -> None:
        if not self._validate():
            return

        full_name = self.full_name_edit.text().strip()
        phone = self.phone_edit.text().strip()
        start_date = self.start_date_edit.date().toString("yyyy-MM-dd")
        duration = self.duration_spin.value()
        notes = self.notes_edit.toPlainText().strip()

        if self.member is None:
            self.db.add_member(full_name, phone, start_date, duration, notes)
        else:
            self.db.update_member(self.member.id, full_name, phone, start_date, duration, notes)

        self.accept()
