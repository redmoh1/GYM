"""Dashboard data service (presentation-focused, no DB schema changes)."""

from __future__ import annotations

from dataclasses import dataclass

from database import GymDatabase, Member


@dataclass
class DashboardData:
    active: int
    ending_soon: int
    expired: int
    nearest_members: list[Member]
    alert_count: int


class DashboardService:
    """Prepare dashboard stats and nearest-expiring members."""

    def __init__(self, db: GymDatabase) -> None:
        self.db = db

    def _nearest_expiring(self, limit: int = 10) -> list[Member]:
        members = [m for m in self.db.get_all_members() if m.days_left >= 0]
        members.sort(key=lambda m: m.days_left)
        return members[:limit]

    def build(self) -> DashboardData:
        counters = self.db.get_counters()
        all_members = self.db.get_all_members()
        nearest = self._nearest_expiring(limit=10)
        alert_count = len([m for m in all_members if 0 <= m.days_left <= 7])
        return DashboardData(
            active=counters["active"],
            ending_soon=counters["ending_soon"],
            expired=counters["expired"],
            nearest_members=nearest,
            alert_count=alert_count,
        )
