"""Dialog window for adding/editing members."""

from __future__ import annotations

from collections.abc import Callable

from PySide6.QtCore import QDate, Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
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
    QWidget,
)

from database import GymDatabase


class MemberDialog(QDialog):
    """Reusable form dialog for add/edit member."""

    def __init__(
        self,
        db: GymDatabase,
        member=None,
        parent=None,
        on_bind_card: Callable[[int], str | None] | None = None,
    ) -> None:
        super().__init__(parent)
        self.db = db
        self.member = member
        self.on_bind_card = on_bind_card

        self.setWindowTitle("إضافة لاعب جديد" if member is None else "تعديل بيانات لاعب")
        self.setMinimumWidth(500)
        self.setLayoutDirection(Qt.RightToLeft)

        self.full_name_edit = QLineEdit()
        self.phone_edit = QLineEdit()

        self.subscription_type_combo = QComboBox()
        self.subscription_type_combo.addItem("اشتراك شهري", "MONTHLY")
        self.subscription_type_combo.addItem("اشتراك بالحصص", "SESSIONS")

        self.start_date_edit = QDateEdit()
        self.start_date_edit.setCalendarPopup(True)
        self.start_date_edit.setDisplayFormat("yyyy-MM-dd")
        self.start_date_edit.setDate(QDate.currentDate())

        self.duration_spin = QSpinBox()
        self.duration_spin.setRange(1, 60)
        self.duration_spin.setValue(1)

        self.preview_end_label = QLabel("-")

        self.monthly_widget = QWidget()
        monthly_form = QFormLayout(self.monthly_widget)
        monthly_form.setContentsMargins(0, 0, 0, 0)
        monthly_form.setLabelAlignment(Qt.AlignRight)
        monthly_form.setHorizontalSpacing(14)
        monthly_form.setVerticalSpacing(12)
        monthly_form.addRow("تاريخ البداية:", self.start_date_edit)
        monthly_form.addRow("مدة الاشتراك (أشهر):", self.duration_spin)
        monthly_form.addRow("تاريخ النهاية (تلقائي):", self.preview_end_label)

        self.sessions_total_spin = QSpinBox()
        self.sessions_total_spin.setRange(1, 10000)
        self.sessions_total_spin.setValue(10)

        self.sessions_remaining_spin = QSpinBox()
        self.sessions_remaining_spin.setRange(0, 10000)
        self.sessions_remaining_spin.setValue(10)
        self.sessions_remaining_spin.setEnabled(False)

        self.sessions_expiry_enabled = QCheckBox("تحديد تاريخ انتهاء للباقة")
        self.sessions_expiry_date_edit = QDateEdit()
        self.sessions_expiry_date_edit.setCalendarPopup(True)
        self.sessions_expiry_date_edit.setDisplayFormat("yyyy-MM-dd")
        self.sessions_expiry_date_edit.setDate(QDate.currentDate())
        self.sessions_expiry_date_edit.setEnabled(False)

        self.sessions_widget = QWidget()
        sessions_form = QFormLayout(self.sessions_widget)
        sessions_form.setContentsMargins(0, 0, 0, 0)
        sessions_form.setLabelAlignment(Qt.AlignRight)
        sessions_form.setHorizontalSpacing(14)
        sessions_form.setVerticalSpacing(12)
        sessions_form.addRow("إجمالي الحصص:", self.sessions_total_spin)
        sessions_form.addRow("الحصص المتبقية:", self.sessions_remaining_spin)
        sessions_form.addRow("", self.sessions_expiry_enabled)
        sessions_form.addRow("تاريخ انتهاء الباقة:", self.sessions_expiry_date_edit)

        self.card_id_label = QLabel("-")
        self.card_id_label.setObjectName("mutedText")

        self.bind_card_btn = QPushButton("ربط بطاقة")
        self.bind_card_btn.setObjectName("btnGhost")
        self.bind_card_btn.clicked.connect(self.bind_card)
        self.bind_card_btn.setEnabled(self.member is not None)

        self.notes_edit = QTextEdit()
        self.notes_edit.setPlaceholderText("ملاحظات إضافية...")
        self.notes_edit.setFixedHeight(110)

        self.duration_spin.valueChanged.connect(self.update_end_preview)
        self.start_date_edit.dateChanged.connect(self.update_end_preview)
        self.subscription_type_combo.currentIndexChanged.connect(self._toggle_subscription_mode)
        self.sessions_total_spin.valueChanged.connect(self._sync_sessions_remaining_on_create)
        self.sessions_expiry_enabled.toggled.connect(self.sessions_expiry_date_edit.setEnabled)

        form = QFormLayout()
        form.setLabelAlignment(Qt.AlignRight)
        form.setHorizontalSpacing(14)
        form.setVerticalSpacing(12)
        form.addRow("الاسم الكامل:", self.full_name_edit)
        form.addRow("رقم الهاتف:", self.phone_edit)
        form.addRow("نوع الاشتراك:", self.subscription_type_combo)
        form.addRow("", self.monthly_widget)
        form.addRow("", self.sessions_widget)
        form.addRow("رقم البطاقة:", self.card_id_label)
        form.addRow("", self.bind_card_btn)
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
        self._toggle_subscription_mode()

    def _fill_data(self) -> None:
        self.full_name_edit.setText(self.member.full_name)
        self.phone_edit.setText(self.member.phone)
        self.start_date_edit.setDate(QDate.fromString(self.member.start_date, "yyyy-MM-dd"))
        self.duration_spin.setValue(max(1, self.member.duration_months))
        self.card_id_label.setText(self.member.card_id or "-")
        self.notes_edit.setPlainText(self.member.notes)

        sub_type = self.member.subscription_type if self.member.subscription_type in {"MONTHLY", "SESSIONS"} else "MONTHLY"
        self.subscription_type_combo.setCurrentIndex(0 if sub_type == "MONTHLY" else 1)

        self.sessions_total_spin.setValue(max(1, int(self.member.sessions_total or 1)))
        self.sessions_remaining_spin.setValue(max(0, int(self.member.sessions_remaining or 0)))
        self.sessions_remaining_spin.setEnabled(True)

        if self.member.sessions_expiry_date:
            self.sessions_expiry_enabled.setChecked(True)
            self.sessions_expiry_date_edit.setDate(QDate.fromString(self.member.sessions_expiry_date, "yyyy-MM-dd"))
        else:
            self.sessions_expiry_enabled.setChecked(False)

    def _toggle_subscription_mode(self) -> None:
        is_monthly = self.subscription_type == "MONTHLY"
        self.monthly_widget.setVisible(is_monthly)
        self.sessions_widget.setVisible(not is_monthly)

    def _sync_sessions_remaining_on_create(self) -> None:
        if self.member is None and self.subscription_type == "SESSIONS":
            self.sessions_remaining_spin.setValue(self.sessions_total_spin.value())

    @property
    def subscription_type(self) -> str:
        return str(self.subscription_type_combo.currentData() or "MONTHLY")

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
        if self.subscription_type == "SESSIONS" and self.sessions_total_spin.value() <= 0:
            QMessageBox.warning(self, "تنبيه", "إجمالي الحصص يجب أن يكون أكبر من صفر.")
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

        if self.subscription_type == "MONTHLY":
            if self.member is None:
                self.db.add_member(
                    full_name,
                    phone,
                    start_date,
                    duration,
                    notes,
                    subscription_type="MONTHLY",
                )
            else:
                self.db.update_member(
                    self.member.id,
                    full_name,
                    phone,
                    start_date,
                    duration,
                    notes,
                    subscription_type="MONTHLY",
                )
        else:
            sessions_total = self.sessions_total_spin.value()
            sessions_remaining = sessions_total if self.member is None else self.sessions_remaining_spin.value()
            sessions_expiry = (
                self.sessions_expiry_date_edit.date().toString("yyyy-MM-dd") if self.sessions_expiry_enabled.isChecked() else None
            )

            if self.member is None:
                self.db.add_member(
                    full_name,
                    phone,
                    date.today().strftime("%Y-%m-%d"),
                    0,
                    notes,
                    subscription_type="SESSIONS",
                    sessions_total=sessions_total,
                    sessions_remaining=sessions_remaining,
                    sessions_expiry_date=sessions_expiry,
                )
            else:
                self.db.update_member(
                    self.member.id,
                    full_name,
                    phone,
                    self.member.start_date,
                    0,
                    notes,
                    subscription_type="SESSIONS",
                    sessions_total=sessions_total,
                    sessions_remaining=sessions_remaining,
                    sessions_expiry_date=sessions_expiry,
                )

        self.accept()

    def bind_card(self) -> None:
        if self.member is None:
            QMessageBox.warning(self, "تنبيه", "احفظ اللاعب أولاً ثم أعد فتحه لربط البطاقة.")
            return

        if self.on_bind_card is None:
            QMessageBox.warning(self, "تعذر الربط", "خدمة ربط البطاقة غير متاحة حالياً.")
            return

        card_id = self.on_bind_card(self.member.id)
        if not card_id:
            return

        self.member.card_id = card_id
        self.card_id_label.setText(card_id)
        QMessageBox.information(self, "نجاح", "تم ربط البطاقة باللاعب بنجاح.")
