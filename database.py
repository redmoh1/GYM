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
DATETIME_FMT = "%Y-%m-%d %H:%M:%S"

STATUS_ACTIVE = "ساري"
STATUS_EXPIRING = "قريب ينتهي"
STATUS_EXPIRED = "منتهي"


@dataclass
class Member:
    """Represents one gym member row returned from the database."""

    id: int
    full_name: str
    phone: str
    start_date: str
    duration_months: int
    end_date: str
    subscription_type: str
    sessions_total: int | None
    sessions_remaining: int | None
    sessions_expiry_date: str
    notes: str
    card_id: str
    photo_path: str
    status: str
    days_left: int


@dataclass
class CheckinRecord:
    """Represents one check-in event row returned from the database."""

    id: int
    member_id: int | None
    card_id: str
    device_name: str
    checked_at: str
    result: str
    reason: str
    consumed_sessions: int
    member_name: str
    member_phone: str
    member_end_date: str
    member_subscription_type: str
    member_sessions_total: int | None
    member_sessions_remaining: int | None
    member_sessions_expiry_date: str
    days_left: int | None
    photo_path: str


class GymDatabase:
    """Encapsulates all SQLite operations and subscription business logic."""

    def __init__(self, db_path: str = "gym.db") -> None:
        self.db_path = Path(db_path)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self) -> None:
        members_query = """
        CREATE TABLE IF NOT EXISTS members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            start_date TEXT NOT NULL,
            duration_months INTEGER NOT NULL DEFAULT 1,
            end_date TEXT NOT NULL,
            subscription_type TEXT NOT NULL DEFAULT 'MONTHLY',
            sessions_total INTEGER,
            sessions_remaining INTEGER,
            sessions_expiry_date TEXT,
            notes TEXT DEFAULT '',
            card_id TEXT DEFAULT ''
        )
        """
        self.conn.execute(members_query)
        self._ensure_column("members", "card_id", "TEXT DEFAULT ''")
        self._ensure_column("members", "subscription_type", "TEXT NOT NULL DEFAULT 'MONTHLY'")
        self._ensure_column("members", "sessions_total", "INTEGER")
        self._ensure_column("members", "sessions_remaining", "INTEGER")
        self._ensure_column("members", "sessions_expiry_date", "TEXT")

        checkins_query = """
        CREATE TABLE IF NOT EXISTS checkins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER,
            card_id TEXT NOT NULL,
            device_name TEXT NOT NULL,
            checked_at TEXT NOT NULL,
            result TEXT NOT NULL,
            reason TEXT NOT NULL,
            consumed_sessions INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
        )
        """
        self.conn.execute(checkins_query)
        self._ensure_column("checkins", "member_id", "INTEGER")
        self._ensure_column("checkins", "card_id", "TEXT NOT NULL DEFAULT ''")
        self._ensure_column("checkins", "device_name", "TEXT NOT NULL DEFAULT 'ZKTeco K40'")
        self._ensure_column("checkins", "checked_at", "TEXT NOT NULL DEFAULT ''")
        self._ensure_column("checkins", "result", "TEXT NOT NULL DEFAULT 'UNKNOWN'")
        self._ensure_column("checkins", "reason", "TEXT NOT NULL DEFAULT ''")
        self._ensure_column("checkins", "consumed_sessions", "INTEGER NOT NULL DEFAULT 0")

        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_members_start_date ON members(start_date)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_members_card_id ON members(card_id)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_checkins_checked_at ON checkins(checked_at)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_checkins_member_id ON checkins(member_id)")

        self.conn.execute("DROP TABLE IF EXISTS payments")
        self.conn.execute("DROP TABLE IF EXISTS renewals")
        self.conn.commit()

    def _ensure_column(self, table: str, column: str, definition: str) -> None:
        info = self.conn.execute(f"PRAGMA table_info({table})").fetchall()
        if any(row["name"] == column for row in info):
            return
        self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    @staticmethod
    def _to_date(value: str) -> date:
        return datetime.strptime(value, DATE_FMT).date()

    @staticmethod
    def _to_optional_date(value: str | None) -> date | None:
        if not value:
            return None
        try:
            return datetime.strptime(value, DATE_FMT).date()
        except ValueError:
            return None

    @staticmethod
    def _safe_int(value: Any) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def add_months(start: date, months: int) -> date:
        month_index = start.month - 1 + months
        year = start.year + month_index // 12
        month = month_index % 12 + 1
        day = min(start.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)

    @classmethod
    def calculate_end_date(cls, start_date: str, duration_months: int) -> str:
        start = cls._to_date(start_date)
        end = cls.add_months(start, duration_months)
        return end.strftime(DATE_FMT)

    @staticmethod
    def get_status(end_date: str, today: date | None = None) -> tuple[str, int]:
        current = today or date.today()
        end = datetime.strptime(end_date, DATE_FMT).date()
        days_left = (end - current).days

        if days_left < 0:
            return STATUS_EXPIRED, days_left
        if days_left <= 7:
            return STATUS_EXPIRING, days_left
        return STATUS_ACTIVE, days_left

    def _row_to_member(self, row: sqlite3.Row) -> Member:
        row_keys = set(row.keys())
        subscription_type = ((row["subscription_type"] or "MONTHLY") if "subscription_type" in row_keys else "MONTHLY").upper()
        sessions_total = self._safe_int(row["sessions_total"]) if "sessions_total" in row_keys else None
        sessions_remaining = self._safe_int(row["sessions_remaining"]) if "sessions_remaining" in row_keys else None
        sessions_expiry_date = (row["sessions_expiry_date"] or "") if "sessions_expiry_date" in row_keys else ""
        status, days_left = self._resolve_member_status(
            subscription_type=subscription_type,
            end_date=row["end_date"],
            sessions_remaining=sessions_remaining,
            sessions_expiry_date=sessions_expiry_date,
        )
        return Member(
            id=row["id"],
            full_name=row["full_name"],
            phone=row["phone"],
            start_date=row["start_date"],
            duration_months=row["duration_months"],
            end_date=row["end_date"],
            subscription_type=subscription_type,
            sessions_total=sessions_total,
            sessions_remaining=sessions_remaining,
            sessions_expiry_date=sessions_expiry_date,
            notes=row["notes"] or "",
            card_id=(row["card_id"] or "") if "card_id" in row_keys else "",
            photo_path=(row["photo_path"] or "") if "photo_path" in row_keys else "",
            status=status,
            days_left=days_left,
        )

    def _row_to_checkin(self, row: sqlite3.Row) -> CheckinRecord:
        end_date = row["member_end_date"] or ""
        subscription_type = (row["member_subscription_type"] or "MONTHLY").upper()
        sessions_total = self._safe_int(row["member_sessions_total"])
        sessions_remaining = self._safe_int(row["member_sessions_remaining"])
        sessions_expiry_date = row["member_sessions_expiry_date"] or ""
        days_left: int | None = None
        if subscription_type == "SESSIONS":
            _, days_left = self._resolve_member_status(
                subscription_type=subscription_type,
                end_date=end_date,
                sessions_remaining=sessions_remaining,
                sessions_expiry_date=sessions_expiry_date,
            )
        elif end_date:
            _, days_left = self.get_status(end_date)

        row_keys = set(row.keys())
        return CheckinRecord(
            id=row["id"],
            member_id=row["member_id"],
            card_id=row["card_id"] or "",
            device_name=row["device_name"] or "",
            checked_at=row["checked_at"] or "",
            result=row["result"] or "UNKNOWN",
            reason=row["reason"] or "",
            consumed_sessions=self._safe_int(row["consumed_sessions"]) or 0,
            member_name=row["member_name"] or "",
            member_phone=row["member_phone"] or "",
            member_end_date=end_date,
            member_subscription_type=subscription_type,
            member_sessions_total=sessions_total,
            member_sessions_remaining=sessions_remaining,
            member_sessions_expiry_date=sessions_expiry_date,
            days_left=days_left,
            photo_path=(row["photo_path"] or "") if "photo_path" in row_keys else "",
        )

    def _resolve_member_status(
        self,
        subscription_type: str,
        end_date: str,
        sessions_remaining: int | None,
        sessions_expiry_date: str,
    ) -> tuple[str, int]:
        normalized = (subscription_type or "MONTHLY").upper()
        if normalized != "SESSIONS":
            return self.get_status(end_date)

        remaining = max(0, sessions_remaining or 0)
        expiry = self._to_optional_date(sessions_expiry_date)
        today = date.today()

        if expiry is not None:
            days_left = (expiry - today).days
            if today > expiry:
                return STATUS_EXPIRED, days_left
        else:
            days_left = 9999

        if remaining <= 0:
            return STATUS_EXPIRED, -1
        if expiry is not None and days_left <= 7:
            return STATUS_EXPIRING, days_left
        return STATUS_ACTIVE, days_left

    def add_member(
        self,
        full_name: str,
        phone: str,
        start_date: str,
        duration_months: int = 1,
        notes: str = "",
        subscription_type: str = "MONTHLY",
        sessions_total: int | None = None,
        sessions_remaining: int | None = None,
        sessions_expiry_date: str | None = None,
    ) -> int:
        normalized_type = (subscription_type or "MONTHLY").upper()
        normalized_type = normalized_type if normalized_type in {"MONTHLY", "SESSIONS"} else "MONTHLY"
        base_start = (start_date or date.today().strftime(DATE_FMT)).strip()
        base_duration = max(0, int(duration_months))
        base_end = self.calculate_end_date(base_start, max(1, base_duration or 1))

        sessions_total_value: int | None = None
        sessions_remaining_value: int | None = None
        sessions_expiry_value: str | None = None

        if normalized_type == "SESSIONS":
            sessions_total_value = max(0, int(sessions_total or 0))
            sessions_remaining_value = (
                sessions_total_value if sessions_remaining is None else max(0, int(sessions_remaining))
            )
            sessions_expiry_value = (sessions_expiry_date or "").strip() or None
            base_duration = 0
            base_end = sessions_expiry_value or base_start

        cursor = self.conn.execute(
            """
            INSERT INTO members (
                full_name,
                phone,
                start_date,
                duration_months,
                end_date,
                subscription_type,
                sessions_total,
                sessions_remaining,
                sessions_expiry_date,
                notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                full_name.strip(),
                phone.strip(),
                base_start,
                base_duration,
                base_end,
                normalized_type,
                sessions_total_value,
                sessions_remaining_value,
                sessions_expiry_value,
                notes.strip(),
            ),
        )
        self.conn.commit()
        return int(cursor.lastrowid)

    def update_member(
        self,
        member_id: int,
        full_name: str,
        phone: str,
        start_date: str,
        duration_months: int,
        notes: str = "",
        subscription_type: str = "MONTHLY",
        sessions_total: int | None = None,
        sessions_remaining: int | None = None,
        sessions_expiry_date: str | None = None,
    ) -> None:
        normalized_type = (subscription_type or "MONTHLY").upper()
        normalized_type = normalized_type if normalized_type in {"MONTHLY", "SESSIONS"} else "MONTHLY"
        base_start = (start_date or date.today().strftime(DATE_FMT)).strip()
        base_duration = max(0, int(duration_months))
        base_end = self.calculate_end_date(base_start, max(1, base_duration or 1))

        sessions_total_value: int | None = None
        sessions_remaining_value: int | None = None
        sessions_expiry_value: str | None = None
        if normalized_type == "SESSIONS":
            sessions_total_value = max(0, int(sessions_total or 0))
            sessions_remaining_value = max(0, int(sessions_remaining or 0))
            sessions_expiry_value = (sessions_expiry_date or "").strip() or None
            base_duration = 0
            base_end = sessions_expiry_value or base_start

        self.conn.execute(
            """
            UPDATE members
            SET
                full_name = ?,
                phone = ?,
                start_date = ?,
                duration_months = ?,
                end_date = ?,
                subscription_type = ?,
                sessions_total = ?,
                sessions_remaining = ?,
                sessions_expiry_date = ?,
                notes = ?
            WHERE id = ?
            """,
            (
                full_name.strip(),
                phone.strip(),
                base_start,
                base_duration,
                base_end,
                normalized_type,
                sessions_total_value,
                sessions_remaining_value,
                sessions_expiry_value,
                notes.strip(),
                member_id,
            ),
        )
        self.conn.commit()

    def delete_member(self, member_id: int) -> None:
        self.conn.execute("DELETE FROM members WHERE id = ?", (member_id,))
        self.conn.commit()

    def get_member(self, member_id: int) -> Member | None:
        row = self.conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
        return self._row_to_member(row) if row else None

    def get_member_by_card_id(self, card_id: str) -> Member | None:
        normalized = card_id.strip()
        if not normalized:
            return None
        row = self.conn.execute("SELECT * FROM members WHERE card_id = ? LIMIT 1", (normalized,)).fetchone()
        return self._row_to_member(row) if row else None

    def link_card_to_member(self, member_id: int, card_id: str) -> None:
        normalized = card_id.strip()
        if not normalized:
            raise ValueError("card_id cannot be empty")
        self.conn.execute("UPDATE members SET card_id = '' WHERE card_id = ? AND id <> ?", (normalized, member_id))
        self.conn.execute("UPDATE members SET card_id = ? WHERE id = ?", (normalized, member_id))
        self.conn.commit()

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
            WHERE full_name LIKE ? OR phone LIKE ? OR card_id LIKE ?
            ORDER BY id DESC
            """,
            (pattern, pattern, pattern),
        ).fetchall()
        return [self._row_to_member(row) for row in rows]

    def get_members_by_status(self, status: str) -> list[Member]:
        return [m for m in self.get_all_members() if m.status == status]

    def get_expired_members(self) -> list[Member]:
        return self.get_members_by_status(STATUS_EXPIRED)

    def get_ending_soon_members(self) -> list[Member]:
        soon = self.get_members_by_status(STATUS_EXPIRING)
        return sorted(soon, key=lambda member: member.days_left)

    def renew_subscription(self, member_id: int, months: int) -> str:
        """Renew and return the new end date (YYYY-MM-DD)."""
        row = self.conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
        if not row:
            raise ValueError("Member not found")
        if ((row["subscription_type"] or "MONTHLY").upper() == "SESSIONS"):
            raise ValueError("Session packs cannot be renewed monthly")

        today = date.today()
        current_end = self._to_date(row["end_date"])
        status, _ = self.get_status(row["end_date"], today=today)

        if status == STATUS_EXPIRED:
            new_start = today
            new_duration = months
        else:
            new_start = current_end
            new_duration = int(row["duration_months"]) + months

        new_end = self.add_months(new_start, months).strftime(DATE_FMT)

        if status == STATUS_EXPIRED:
            self.conn.execute(
                """
                UPDATE members
                SET start_date = ?, duration_months = ?, end_date = ?
                WHERE id = ?
                """,
                (today.strftime(DATE_FMT), new_duration, new_end, member_id),
            )
        else:
            self.conn.execute(
                """
                UPDATE members
                SET duration_months = ?, end_date = ?
                WHERE id = ?
                """,
                (new_duration, new_end, member_id),
            )

        self.conn.commit()
        return new_end

    def record_checkin(
        self,
        member_id: int | None,
        card_id: str,
        device_name: str,
        result: str,
        reason: str,
        consumed_sessions: int = 0,
        checked_at: datetime | None = None,
    ) -> int:
        check_time = (checked_at or datetime.now()).strftime(DATETIME_FMT)
        cursor = self.conn.execute(
            """
            INSERT INTO checkins (member_id, card_id, device_name, checked_at, result, reason, consumed_sessions)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                member_id,
                card_id.strip(),
                device_name.strip(),
                check_time,
                result.strip().upper(),
                reason.strip(),
                max(0, int(consumed_sessions)),
            ),
        )
        self.conn.commit()
        return int(cursor.lastrowid)

    def process_session_checkin(
        self,
        member_id: int,
        card_id: str,
        device_name: str,
        checked_at: datetime | None = None,
    ) -> tuple[str, str, int]:
        check_time = (checked_at or datetime.now()).strftime(DATETIME_FMT)
        consumed_sessions = 0
        new_remaining = 0
        result = "DENY"
        reason = "رصيد الحصص = 0"

        try:
            self.conn.execute("BEGIN IMMEDIATE")
            row = self.conn.execute(
                """
                SELECT subscription_type, sessions_remaining, sessions_expiry_date
                FROM members
                WHERE id = ?
                """,
                (member_id,),
            ).fetchone()

            if not row:
                raise ValueError("Member not found")
            if (row["subscription_type"] or "MONTHLY").upper() != "SESSIONS":
                raise ValueError("Member is not a session pack subscriber")

            remaining = max(0, int(row["sessions_remaining"] or 0))
            expiry = self._to_optional_date(row["sessions_expiry_date"])
            today = date.today()

            if expiry is not None and today > expiry:
                result = "DENY"
                reason = "انتهت صلاحية باقة الحصص"
                new_remaining = remaining
            elif remaining > 0:
                update_cursor = self.conn.execute(
                    """
                    UPDATE members
                    SET sessions_remaining = sessions_remaining - 1
                    WHERE id = ? AND sessions_remaining > 0
                    """,
                    (member_id,),
                )
                if update_cursor.rowcount > 0:
                    consumed_sessions = 1
                    result = "ALLOW"
                    reason = "تم خصم حصة"
                    updated_row = self.conn.execute(
                        "SELECT sessions_remaining FROM members WHERE id = ?",
                        (member_id,),
                    ).fetchone()
                    new_remaining = max(0, int(updated_row["sessions_remaining"] or 0)) if updated_row else 0
                else:
                    result = "DENY"
                    reason = "رصيد الحصص = 0"
                    new_remaining = 0
            else:
                result = "DENY"
                reason = "رصيد الحصص = 0"
                new_remaining = 0

            self.conn.execute(
                """
                INSERT INTO checkins (member_id, card_id, device_name, checked_at, result, reason, consumed_sessions)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    member_id,
                    card_id.strip(),
                    device_name.strip(),
                    check_time,
                    result,
                    reason,
                    consumed_sessions,
                ),
            )
            self.conn.commit()
            return result, reason, new_remaining
        except Exception:
            self.conn.rollback()
            raise

    def get_recent_checkins(self, limit: int = 10) -> list[CheckinRecord]:
        rows = self.conn.execute(
            """
            SELECT
                c.id,
                c.member_id,
                c.card_id,
                c.device_name,
                c.checked_at,
                c.result,
                c.reason,
                c.consumed_sessions,
                m.full_name AS member_name,
                m.phone AS member_phone,
                m.end_date AS member_end_date,
                m.subscription_type AS member_subscription_type,
                m.sessions_total AS member_sessions_total,
                m.sessions_remaining AS member_sessions_remaining,
                m.sessions_expiry_date AS member_sessions_expiry_date
            FROM checkins c
            LEFT JOIN members m ON m.id = c.member_id
            ORDER BY c.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [self._row_to_checkin(row) for row in rows]

    def get_counters(self) -> dict[str, int]:
        members = self.get_all_members()
        expired = len([m for m in members if m.status == STATUS_EXPIRED])
        ending_soon = len([m for m in members if m.status == STATUS_EXPIRING])
        active = len([m for m in members if m.status == STATUS_ACTIVE])
        return {
            "expired": expired,
            "ending_soon": ending_soon,
            "active": active,
            "total": len(members),
        }

    def export_rows(self) -> list[dict[str, Any]]:
        return [
            {
                "ID": member.id,
                "الاسم": member.full_name,
                "الهاتف": member.phone,
                "رقم البطاقة": member.card_id or "-",
                "بداية الاشتراك": member.start_date,
                "مدة الاشتراك (شهر)": member.duration_months,
                "نهاية الاشتراك": member.end_date,
                "نوع الاشتراك": "حصص" if member.subscription_type == "SESSIONS" else "شهري",
                "إجمالي الحصص": member.sessions_total if member.subscription_type == "SESSIONS" else "-",
                "الحصص المتبقية": member.sessions_remaining if member.subscription_type == "SESSIONS" else "-",
                "انتهاء باقة الحصص": member.sessions_expiry_date or "-" if member.subscription_type == "SESSIONS" else "-",
                "الحالة": member.status,
                "المتبقي بالأيام": member.days_left,
                "ملاحظات": member.notes,
            }
            for member in self.get_all_members()
        ]

    def top_up_sessions(self, member_id: int, sessions_to_add: int, increase_total: bool = True) -> int:
        row = self.conn.execute(
            "SELECT subscription_type, sessions_total, sessions_remaining FROM members WHERE id = ?",
            (member_id,),
        ).fetchone()
        if not row:
            raise ValueError("Member not found")
        if (row["subscription_type"] or "MONTHLY").upper() != "SESSIONS":
            raise ValueError("Top-up is only available for session packs")

        amount = int(sessions_to_add)
        if amount <= 0:
            raise ValueError("sessions_to_add must be greater than zero")

        current_total = max(0, int(row["sessions_total"] or 0))
        current_remaining = max(0, int(row["sessions_remaining"] or 0))
        new_total = current_total + amount if increase_total else current_total
        new_remaining = current_remaining + amount

        self.conn.execute(
            """
            UPDATE members
            SET sessions_total = ?, sessions_remaining = ?
            WHERE id = ?
            """,
            (new_total, new_remaining, member_id),
        )
        self.conn.commit()
        return new_remaining

    def backup_database(self, backup_path: str) -> None:
        self.conn.commit()
        shutil.copy2(self.db_path, backup_path)

    def close(self) -> None:
        self.conn.close()
