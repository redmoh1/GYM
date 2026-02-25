"""ZKTeco K40 attendance listener (TCP/IP polling on port 4370)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

from PySide6.QtCore import QThread, Signal

from services.device_settings import DeviceSettings


@dataclass
class K40LogEvent:
    """Normalized device event emitted by the listener."""

    card_id: str
    user_id: str
    timestamp: datetime


class ZKK40Listener(QThread):
    """Read attendance logs every second and emit only new card events."""

    event_received = Signal(object)
    listener_state = Signal(bool, str)
    listener_error = Signal(str)

    def __init__(self, settings_provider: Callable[[], DeviceSettings], poll_interval_sec: int = 1) -> None:
        super().__init__()
        self._settings_provider = settings_provider
        self._poll_interval_sec = max(1, poll_interval_sec)
        self._running = False

        self._checkpoint_ts: datetime | None = None
        self._seen_at_checkpoint: set[str] = set()
        self._primed = False
        self._last_state: tuple[bool, str] | None = None
        self._last_error_message: str | None = None

    def stop(self) -> None:
        self._running = False
        self.wait(4000)

    def run(self) -> None:
        self._running = True
        connection: Any = None
        connected_fingerprint: tuple[str, int] | None = None

        while self._running:
            settings = self._settings_provider()
            desired_fingerprint = (settings.device_ip, settings.device_port)

            if not settings.enable_device_listener:
                connection = self._disconnect(connection)
                connected_fingerprint = None
                self._emit_state(False, "disabled")
                self.msleep(300)
                continue

            if not settings.device_ip:
                connection = self._disconnect(connection)
                connected_fingerprint = None
                self._emit_state(False, "missing-ip")
                self.msleep(1000)
                continue

            if connection is None or connected_fingerprint != desired_fingerprint:
                connection = self._disconnect(connection)
                connected_fingerprint = None
                connection = self._connect(settings)
                if connection is None:
                    self.msleep(1500)
                    continue
                connected_fingerprint = desired_fingerprint
                self._last_error_message = None
                self._emit_state(True, f"connected:{settings.device_ip}:{settings.device_port}")

            try:
                logs = connection.get_attendance() or []
                for event in self._extract_new_events(logs):
                    self.event_received.emit(event)
            except Exception as exc:  # noqa: BLE001
                self._emit_error(f"تعذر قراءة سجلات الجهاز: {exc}")
                connection = self._disconnect(connection)
                connected_fingerprint = None
                self._emit_state(False, "reconnecting")
                self.msleep(1500)
                continue

            total_sleep_ms = self._poll_interval_sec * 1000
            for _ in range(total_sleep_ms // 100):
                if not self._running:
                    break
                self.msleep(100)

        self._disconnect(connection)
        self._emit_state(False, "stopped")

    def _connect(self, settings: DeviceSettings) -> Any | None:
        try:
            from zk import ZK  # type: ignore
        except ImportError:
            self._emit_error("مكتبة pyzk غير مثبتة. ثبّتها عبر: pip install pyzk")
            return None

        try:
            zk = ZK(
                settings.device_ip,
                port=settings.device_port,
                timeout=3,
                force_udp=False,
                ommit_ping=False,
            )
            return zk.connect()
        except Exception as exc:  # noqa: BLE001
            self._emit_error(f"فشل الاتصال بجهاز {settings.device_name}: {exc}")
            return None

    def _disconnect(self, connection: Any) -> Any:
        if connection is None:
            return None
        try:
            connection.disconnect()
        except Exception:  # noqa: BLE001
            pass
        return None

    def _emit_state(self, connected: bool, state: str) -> None:
        next_state = (connected, state)
        if self._last_state == next_state:
            return
        self._last_state = next_state
        self.listener_state.emit(connected, state)

    def _emit_error(self, message: str) -> None:
        if self._last_error_message == message:
            return
        self._last_error_message = message
        self.listener_error.emit(message)

    def _extract_new_events(self, logs: list[Any]) -> list[K40LogEvent]:
        parsed: list[K40LogEvent] = []
        for log in logs:
            event = self._parse_log(log)
            if event is not None:
                parsed.append(event)

        if not parsed:
            return []

        parsed.sort(key=lambda event: (event.timestamp, event.card_id))

        if not self._primed:
            self._prime_checkpoint(parsed)
            self._primed = True
            return []

        fresh: list[K40LogEvent] = []
        for event in parsed:
            key = f"{event.timestamp.isoformat()}::{event.card_id}"

            if self._checkpoint_ts is None:
                self._checkpoint_ts = event.timestamp
                self._seen_at_checkpoint = {key}
                fresh.append(event)
                continue

            if event.timestamp < self._checkpoint_ts:
                continue

            if event.timestamp == self._checkpoint_ts and key in self._seen_at_checkpoint:
                continue

            if event.timestamp > self._checkpoint_ts:
                self._checkpoint_ts = event.timestamp
                self._seen_at_checkpoint = {key}
            else:
                self._seen_at_checkpoint.add(key)

            fresh.append(event)

        return fresh

    def _prime_checkpoint(self, events: list[K40LogEvent]) -> None:
        latest_ts = events[-1].timestamp
        seen = {f"{event.timestamp.isoformat()}::{event.card_id}" for event in events if event.timestamp == latest_ts}
        self._checkpoint_ts = latest_ts
        self._seen_at_checkpoint = seen

    def _parse_log(self, raw: Any) -> K40LogEvent | None:
        timestamp = self._coerce_datetime(getattr(raw, "timestamp", None))
        if timestamp is None:
            return None

        user_id = str(getattr(raw, "user_id", "") or "").strip()
        uid = str(getattr(raw, "uid", "") or "").strip()
        card = str(getattr(raw, "card", "") or "").strip()
        card_id = card or user_id or uid
        if not card_id:
            return None

        return K40LogEvent(
            card_id=card_id,
            user_id=user_id or uid or card_id,
            timestamp=timestamp,
        )

    @staticmethod
    def _coerce_datetime(value: object) -> datetime | None:
        if isinstance(value, datetime):
            return value

        if isinstance(value, str):
            candidates = [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%Y/%m/%d %H:%M:%S",
                "%Y/%m/%d %H:%M",
            ]
            for fmt in candidates:
                try:
                    return datetime.strptime(value, fmt)
                except ValueError:
                    continue
        return None
