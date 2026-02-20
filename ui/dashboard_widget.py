"""Monthly subscriptions dashboard widget."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QPainter
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QVBoxLayout, QWidget

from database import GymDatabase

try:
    from PySide6.QtCharts import (
        QBarCategoryAxis,
        QBarSeries,
        QBarSet,
        QChart,
        QChartView,
        QValueAxis,
    )

    HAS_CHARTS = True
except Exception:  # pragma: no cover
    HAS_CHARTS = False


class _MetricCard(QFrame):
    """Simple metric card for monthly stats."""

    def __init__(self, title: str, icon: str, accent: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("sectionPanel")
        self.setStyleSheet(f"QFrame#sectionPanel{{border-top:4px solid {accent};}}")

        self.title_label = QLabel(f"{icon}  {title}")
        self.title_label.setObjectName("cardTitle")
        self.value_label = QLabel("0")
        self.value_label.setObjectName("cardValue")
        self.value_label.setAlignment(Qt.AlignRight | Qt.AlignVCenter)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(8)
        layout.addWidget(self.title_label)
        layout.addWidget(self.value_label)

    def set_value(self, value: str) -> None:
        self.value_label.setText(value)


class DashboardWidget(QWidget):
    """Professional monthly subscription dashboard cards + chart."""

    def __init__(self, db: GymDatabase, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.db = db
        self.setLayoutDirection(Qt.RightToLeft)

        self.new_card = _MetricCard("اشتراكات جديدة هذا الشهر", "🆕", "#2F6BFF")
        self.renewals_card = _MetricCard("التجديدات هذا الشهر", "🔁", "#F59E0B")
        self.revenue_card = _MetricCard("إيرادات هذا الشهر", "💰", "#16A34A")

        cards_layout = QHBoxLayout()
        cards_layout.setSpacing(12)
        cards_layout.addWidget(self.new_card)
        cards_layout.addWidget(self.renewals_card)
        cards_layout.addWidget(self.revenue_card)

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(12)
        root.addLayout(cards_layout)

        if HAS_CHARTS:
            self.chart = QChart()
            self.chart.setTitle("عدد الاشتراكات لكل شهر - آخر 6 أشهر")
            self.chart.legend().setVisible(False)
            self.chart.setBackgroundVisible(False)

            self.chart_view = QChartView(self.chart)
            self.chart_view.setRenderHint(QPainter.Antialiasing)
            self.chart_view.setMinimumHeight(240)

            chart_panel = QFrame()
            chart_panel.setObjectName("sectionPanel")
            panel_layout = QVBoxLayout(chart_panel)
            panel_layout.setContentsMargins(12, 12, 12, 12)
            panel_layout.addWidget(self.chart_view)
            root.addWidget(chart_panel)
        else:
            fallback = QLabel("PySide6.QtCharts غير متوفر في البيئة الحالية.")
            fallback.setObjectName("mutedText")
            root.addWidget(fallback)

        self.refresh()

    def refresh(self) -> None:
        """Refresh monthly cards and chart directly from SQLite queries."""
        stats = self.db.get_current_month_subscription_stats()
        self.new_card.set_value(str(stats["count_new_subscriptions"]))
        self.renewals_card.set_value(str(stats["renewals_count"]))
        self.revenue_card.set_value(f"{stats['total_monthly_revenue']:.2f}")

        if not HAS_CHARTS:
            return

        chart_rows = self.db.get_last_6_months_stats()
        labels = [row["month_label"] for row in chart_rows]
        values = [row["subscriptions"] for row in chart_rows]

        bar_set = QBarSet("Subscriptions")
        for value in values:
            bar_set.append(float(value))

        series = QBarSeries()
        series.append(bar_set)
        bar_set.setColor("#2F6BFF")

        self.chart.removeAllSeries()
        for axis in self.chart.axes():
            self.chart.removeAxis(axis)

        self.chart.addSeries(series)

        axis_x = QBarCategoryAxis()
        axis_x.append(labels)
        self.chart.addAxis(axis_x, Qt.AlignBottom)
        series.attachAxis(axis_x)

        axis_y = QValueAxis()
        axis_y.setLabelFormat("%d")
        axis_y.setRange(0, max(values + [1]))
        self.chart.addAxis(axis_y, Qt.AlignLeft)
        series.attachAxis(axis_y)

