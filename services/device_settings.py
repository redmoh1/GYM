"""Persistent device settings for the ZKTeco K40 listener."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class DeviceSettings:
    device_ip: str = ""
    device_port: int = 4370
    device_name: str = "ZKTeco K40"
    enable_device_listener: bool = True


class DeviceSettingsStore:
    """Load/save listener settings in a small JSON config file."""

    def __init__(self, config_path: str | Path = "config/device_settings.json") -> None:
        self.config_path = Path(config_path)
        self._settings = self.load()

    @staticmethod
    def _sanitize(raw: dict[str, object]) -> DeviceSettings:
        port = raw.get("device_port", 4370)
        enabled = raw.get("enable_device_listener", True)

        try:
            port_value = int(port) if port is not None else 4370
        except (TypeError, ValueError):
            port_value = 4370

        return DeviceSettings(
            device_ip=str(raw.get("device_ip", "") or "").strip(),
            device_port=max(1, min(port_value, 65535)),
            device_name=str(raw.get("device_name", "ZKTeco K40") or "ZKTeco K40").strip() or "ZKTeco K40",
            enable_device_listener=bool(enabled),
        )

    def load(self) -> DeviceSettings:
        if not self.config_path.exists():
            return DeviceSettings()

        try:
            content = self.config_path.read_text(encoding="utf-8")
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return self._sanitize(parsed)
        except (OSError, json.JSONDecodeError):
            pass

        return DeviceSettings()

    def save(self, settings: DeviceSettings) -> DeviceSettings:
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        normalized = self._sanitize(asdict(settings))
        self.config_path.write_text(
            json.dumps(asdict(normalized), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self._settings = normalized
        return normalized

    def update(self, **kwargs: object) -> DeviceSettings:
        merged = asdict(self._settings)
        merged.update(kwargs)
        return self.save(self._sanitize(merged))

    @property
    def settings(self) -> DeviceSettings:
        return self._settings

