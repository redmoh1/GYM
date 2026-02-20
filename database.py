"""Database layer for the Gym Management System."""

from __future__ import annotations

import calendar
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any


DATE_FMT = "%Y-%m-%d"


@dataclass
class Member:
    """Represents one gym member row returned from the database."""

    id: int
    full_name: str
    phone: str
    start_date: str
    duration_months: int
    end_date: str
    notes: str
    status: str
    days_left: int


class GymDatabase:
    """Encapsulates all SQLite operations and subscription business logic."""

    def __init__(self, db_path: str = "gym.db") -> None:
        self.db_path = Path(db_path)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self) -> None:
        """Create required tables if they do not exist."""
        members_query = """
        CREATE TABLE IF NOT EXISTS members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            start_date TEXT NOT NULL,
            duration_months INTEGER NOT NULL DEFAULT 1,
            end_date TEXT NOT NULL,
            notes TEXT DEFAULT ''
        )
        """
        payments_query = """
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            paid_at TEXT NOT NULL,
            payment_type TEXT NOT NULL DEFAULT 'new',
            note TEXT DEFAULT '',
            FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
        )
        """
        renewals_query = """
        CREATE TABLE IF NOT EXISTS renewals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER NOT NULL,
            months INTEGER NOT NULL,
            renewed_at TEXT NOT NULL,
            FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
        )
        """

        self.conn.execute(members_query)
        self.conn.execute(payments_query)
        self.conn.execute(renewals_query)
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_members_start_date ON members(start_date)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_renewals_renewed_at ON renewals(renewed_at)")
        self.conn.commit()

    def _record_payment(
        self,
        member_id: int,
        amount: float,
        payment_type: str,
        paid_at: str | None = None,
        note: str = "",
    ) -> None:
        if amount <= 0:
            return

        paid_date = paid_at or date.today().strftime(DATE_FMT)
        self.conn.execute(
            """
            INSERT INTO payments (member_id, amount, paid_at, payment_type, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (member_id, float(amount), paid_date, payment_type, note.strip()),
        )

    def _record_renewal(self, member_id: int, months: int, renewed_at: str | None = None) -> None:
        renew_date = renewed_at or date.today().strftime(DATE_FMT)
        self.conn.execute(
            """
            INSERT INTO renewals (member_id, months, renewed_at)
            VALUES (?, ?, ?)
            """,
            (member_id, months, renew_date),
        )

    @staticmethod
    def _to_date(value: str) -> date:
        return datetime.strptime(value, DATE_FMT).date()

    @staticmethod
    def add_months(start: date, months: int) -> date:
        """Add months safely while handling month-end dates."""
        month_index = start.month - 1 + months
        year = start.year + month_index // 12
        month = month_index % 12 + 1
        day = min(start.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)

    @classmethod
    def calculate_end_date(cls, start_date: str, duration_months: int) -> str:
        """Calculate end date from start date and subscription months."""
        start = cls._to_date(start_date)
        end = cls.add_months(start, duration_months)
        return end.strftime(DATE_FMT)

    @staticmethod
    def get_status(end_date: str, today: date | None = None) -> tuple[str, int]:
        """Return status and remaining days based on today's date."""
        current = today or date.today()
        end = datetime.strptime(end_date, DATE_FMT).date()
        days_left = (end - current).days

        if days_left < 0:
            return "منتهي", days_left
        if days_left <= 7:
            return "قريب ينتهي", days_left
        return "ساري", days_left

    def _row_to_member(self, row: sqlite3.Row) -> Member:
        status, days_left = self.get_status(row["end_date"])
        return Member(
            id=row["id"],
            full_name=row["full_name"],
            phone=row["phone"],
            start_date=row["start_date"],
            duration_months=row["duration_months"],
            end_date=row["end_date"],
            notes=row["notes"] or "",
            status=status,
            days_left=days_left,
        )

    def add_member(
        self,
        full_name: str,
        phone: str,
        start_date: str,
        duration_months: int = 1,
        notes: str = "",
        amount_paid: float = 0.0,
    ) -> int:
        """Insert a new member and return the generated ID."""
        end_date = self.calculate_end_date(start_date, duration_months)
        cursor = self.conn.execute(
            """
            INSERT INTO members (full_name, phone, start_date, duration_months, end_date, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (full_name.strip(), phone.strip(), start_date, duration_months, end_date, notes.strip()),
        )
        member_id = int(cursor.lastrowid)
        self._record_payment(member_id, amount_paid, payment_type="new", paid_at=start_date, note="new subscription")
        self.conn.commit()
        return member_id

    def update_member(
        self,
        member_id: int,
        full_name: str,
        phone: str,
        start_date: str,
        duration_months: int,
        notes: str = "",
    ) -> None:
        """Update member data and recalculate end date."""
        end_date = self.calculate_end_date(start_date, duration_months)
        self.conn.execute(
            """
            UPDATE members
            SET full_name = ?, phone = ?, start_date = ?, duration_months = ?, end_date = ?, notes = ?
            WHERE id = ?
            """,
            (full_name.strip(), phone.strip(), start_date, duration_months, end_date, notes.strip(), member_id),
        )
        self.conn.commit()

    def delete_member(self, member_id: int) -> None:
        self.conn.execute("DELETE FROM members WHERE id = ?", (member_id,))
        self.conn.commit()

    def get_member(self, member_id: int) -> Member | None:
        row = self.conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
        return self._row_to_member(row) if row else None

    def get_all_members(self) -> list[Member]:
        rows = self.conn.execute("SELECT * FROM members ORDER BY id DESC").fetchall()
        return [self._row_to_member(row) for row in rows]

    def search_members(self, keyword: str) -> list[Member]:
        keyword = keyword.strip()
        if not keyword:
            return self.get_all_members()

        pattern = f"%{keyword}%"
        rows = self.conn.execute(
            """
            SELECT * FROM members
            WHERE full_name LIKE ? OR phone LIKE ?
            ORDER BY id DESC
            """,
            (pattern, pattern),
        ).fetchall()
        return [self._row_to_member(row) for row in rows]

    def get_members_by_status(self, status: str) -> list[Member]:
        members = self.get_all_members()
        return [m for m in members if m.status == status]

    def get_expired_members(self) -> list[Member]:
        return self.get_members_by_status("منتهي")

    def get_ending_soon_members(self) -> list[Member]:
        soon = self.get_members_by_status("قريب ينتهي")
        return sorted(soon, key=lambda member: member.days_left)

    def renew_subscription(self, member_id: int, months: int, amount_paid: float = 0.0) -> None:
        """Renew subscription based on end date and current status."""
        row = self.conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
        if not row:
            raise ValueError("Member not found")

        today = date.today()
        current_end = self._to_date(row["end_date"])
        status, _ = self.get_status(row["end_date"], today=today)

        if status == "منتهي":
            new_start = today
        else:
            new_start = current_end

        new_end = self.add_months(new_start, months)
        new_duration = int(row["duration_months"]) + months

        self.conn.execute(
            """
            UPDATE members
            SET duration_months = ?, end_date = ?
            WHERE id = ?
            """,
            (new_duration, new_end.strftime(DATE_FMT), member_id),
        )
        self._record_renewal(member_id, months, renewed_at=today.strftime(DATE_FMT))
        self._record_payment(member_id, amount_paid, payment_type="renewal", paid_at=today.strftime(DATE_FMT), note="renewal")
        self.conn.commit()

    def get_current_month_subscription_stats(self) -> dict[str, float]:
        """Return monthly stats for current month: new subscriptions, renewals, and revenue."""
        month_key = date.today().strftime("%Y-%m")

        new_subscriptions_query = """
        SELECT COUNT(*) AS total
        FROM members
        WHERE strftime('%Y-%m', start_date) = ?
        """
        renewals_query = """
        SELECT COUNT(*) AS total
        FROM renewals
        WHERE strftime('%Y-%m', renewed_at) = ?
        """
        revenue_query = """
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM payments
        WHERE strftime('%Y-%m', paid_at) = ?
        """

        new_subscriptions = int(self.conn.execute(new_subscriptions_query, (month_key,)).fetchone()["total"])
        renewals_count = int(self.conn.execute(renewals_query, (month_key,)).fetchone()["total"])
        total_monthly_revenue = float(self.conn.execute(revenue_query, (month_key,)).fetchone()["total"])

        return {
            "count_new_subscriptions": new_subscriptions,
            "renewals_count": renewals_count,
            "total_monthly_revenue": total_monthly_revenue,
        }

    def get_last_6_months_stats(self) -> list[dict[str, float]]:
        """Return chart-ready monthly stats for the last 6 months."""
        anchor = date.today().strftime(DATE_FMT)
        query = """
        WITH RECURSIVE months(m) AS (
            SELECT date(?, 'start of month', '-5 months')
            UNION ALL
            SELECT date(m, '+1 month')
            FROM months
            WHERE m < date(?, 'start of month')
        ),
        sub AS (
            SELECT strftime('%Y-%m', start_date) AS month_key, COUNT(*) AS subscriptions
            FROM members
            WHERE date(start_date) >= date(?, 'start of month', '-5 months')
            GROUP BY strftime('%Y-%m', start_date)
        ),
        rev AS (
            SELECT strftime('%Y-%m', paid_at) AS month_key, COALESCE(SUM(amount), 0) AS revenue
            FROM payments
            WHERE date(paid_at) >= date(?, 'start of month', '-5 months')
            GROUP BY strftime('%Y-%m', paid_at)
        )
        SELECT
            strftime('%Y-%m', months.m) AS month_key,
            strftime('%m/%Y', months.m) AS month_label,
            COALESCE(sub.subscriptions, 0) AS subscriptions,
            COALESCE(rev.revenue, 0) AS revenue
        FROM months
        LEFT JOIN sub ON sub.month_key = strftime('%Y-%m', months.m)
        LEFT JOIN rev ON rev.month_key = strftime('%Y-%m', months.m)
        ORDER BY months.m
        """
        rows = self.conn.execute(query, (anchor, anchor, anchor, anchor)).fetchall()
        return [
            {
                "month_key": row["month_key"],
                "month_label": row["month_label"],
                "subscriptions": int(row["subscriptions"]),
                "revenue": float(row["revenue"]),
            }
            for row in rows
        ]

    def get_counters(self) -> dict[str, int]:
        members = self.get_all_members()
        expired = len([m for m in members if m.status == "منتهي"])
        ending_soon = len([m for m in members if m.status == "قريب ينتهي"])
        active = len([m for m in members if m.status == "ساري"])
        return {
            "expired": expired,
            "ending_soon": ending_soon,
            "active": active,
            "total": len(members),
        }

    def export_rows(self) -> list[dict[str, Any]]:
        """Return rows in dict form for export operations."""
        return [
            {
                "ID": member.id,
                "الاسم": member.full_name,
                "الهاتف": member.phone,
                "بداية الاشتراك": member.start_date,
                "مدة الاشتراك (شهر)": member.duration_months,
                "نهاية الاشتراك": member.end_date,
                "الحالة": member.status,
                "المتبقي بالأيام": member.days_left,
                "ملاحظات": member.notes,
            }
            for member in self.get_all_members()
        ]

    def backup_database(self, backup_path: str) -> None:
        self.conn.commit()
        shutil.copy2(self.db_path, backup_path)

    def close(self) -> None:
        self.conn.close()
