"""Glue service between ZKTeco listener, database, and UI consumers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from PySide6.QtCore import QObject, Signal, Slot

from database import CheckinRecord, GymDatabase, Member
from services.device_settings import DeviceSettings, DeviceSettingsStore
from services.zk_k40_listener import K40LogEvent, ZKK40Listener


@dataclass
class CheckinEvent:
    member_id: int | None
    member_name: str
    member_phone: str
    member_end_date: str
    days_left: int | None
    photo_path: str
    card_id: str
    device_name: str
    checked_at: str
    result: str
    reason: str


class K40AccessService(QObject):
    """Processes card events into ALLOW/DENY/UNKNOWN check-ins."""

    raw_event = Signal(object)
    checkin_processed = Signal(object)
    recent_checkins_changed = Signal(object)
    listener_state_changed = Signal(bool, str)
    listener_error = Signal(str)

    def __init__(self, db: GymDatabase, settings_store: DeviceSettingsStore, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.db = db
        self.settings_store = settings_store
        self._listener = ZKK40Listener(settings_provider=self.get_settings)
        self._listener.event_received.connect(self._on_raw_event)
        self._listener.listener_state.connect(self.listener_state_changed.emit)
        self._listener.listener_error.connect(self.listener_error.emit)

    def start(self) -> None:
        if not self._listener.isRunning():
            self._listener.start()
        self.recent_checkins_changed.emit(self.get_recent_checkins(10))

    def stop(self) -> None:
        if self._listener.isRunning():
            self._listener.stop()

    def get_settings(self) -> DeviceSettings:
        return self.settings_store.settings

    def update_settings(self, settings: DeviceSettings) -> DeviceSettings:
        saved = self.settings_store.save(settings)
        return saved

    def get_recent_checkins(self, limit: int = 10) -> list[CheckinRecord]:
        return self.db.get_recent_checkins(limit=limit)

    @Slot(object)
    def _on_raw_event(self, event: K40LogEvent) -> None:
        self.raw_event.emit(event)
        member = self.db.get_member_by_card_id(event.card_id)
        checkin = self._resolve_checkin(event, member)
        self.db.record_checkin(
            member_id=checkin.member_id,
            card_id=checkin.card_id,
            device_name=checkin.device_name,
            result=checkin.result,
            reason=checkin.reason,
            checked_at=event.timestamp,
        )
        self.checkin_processed.emit(checkin)
        self.recent_checkins_changed.emit(self.get_recent_checkins(10))

    def _resolve_checkin(self, event: K40LogEvent, member: Member | None) -> CheckinEvent:
        settings = self.get_settings()

        member_id: int | None = None
        member_name = ""
        member_phone = ""
        member_end_date = ""
        days_left: int | None = None
        photo_path = ""
        result = "UNKNOWN"
        reason = "البطاقة غير مسجلة"

        if member is not None:
            member_id = member.id
            member_name = member.full_name
            member_phone = member.phone
            member_end_date = member.end_date
            days_left = member.days_left
            photo_path = member.photo_path

            if self._is_subscription_active(member.end_date):
                result = "ALLOW"
                reason = "اشتراك ساري"
            else:
                result = "DENY"
                reason = "اشتراك منتهي"

        return CheckinEvent(
            member_id=member_id,
            member_name=member_name,
            member_phone=member_phone,
            member_end_date=member_end_date,
            days_left=days_left,
            photo_path=photo_path,
            card_id=event.card_id,
            device_name=settings.device_name,
            checked_at=event.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            result=result,
            reason=reason,
        )

    @staticmethod
    def _is_subscription_active(end_date: str) -> bool:
        try:
            return datetime.strptime(end_date, "%Y-%m-%d").date() >= date.today()
        except ValueError:
            return False

