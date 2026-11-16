"""Decode the MOPS UART protocol without Home Assistant or network imports.

The pinned public references and their MIT notices are recorded in UPSTREAM.json.
Command acknowledgments and stored history remain distinct from live telemetry.
"""

from dataclasses import dataclass

INTERVALS = (10, 15, 30, 60, 90, 120)


@dataclass(frozen=True)
class Packet:
    kind: str
    values: dict


def _check(data: bytes, sizes: tuple[int, ...]) -> None:
    if len(data) not in sizes:
        raise ValueError(f"Unexpected MOPS packet length: {len(data)}")


def _boolean(value: int) -> bool:
    if value not in (0, 1):
        raise ValueError("Invalid MOPS boolean")
    return bool(value)


def decode_packet(data: bytes) -> Packet:
    """Validate each notification before exposing its typed values."""
    if len(data) < 3 or data[0] != 0xAA:
        raise ValueError("Invalid MOPS header")
    if sum(data[:-1]) & 0xFF != data[-1]:
        raise ValueError("Invalid MOPS checksum")
    message = data[1]
    if message == 0x50:
        if len(data) < 4:
            raise ValueError("Truncated MOPS update")
        subtype = data[2]
        if subtype == 0x04:
            _check(data, (20,))
            if data[3] > 100:
                raise ValueError("Invalid MOPS battery percentage")
            return Packet("battery", {"battery": data[3], "charging": _boolean(data[6])})
        if subtype == 0x05:
            _check(data, (18,))
            return Packet("runtime", {
                "runtime": int.from_bytes(data[3:7], "big"),
                "boot_time": int.from_bytes(data[7:11], "big"),
            })
        if subtype == 0x06:
            _check(data, (17,))
            return Packet("measurement", {
                "pm25": int.from_bytes(data[3:5], "big"),
                "record_time": int.from_bytes(data[7:11], "big"),
                "device_time": int.from_bytes(data[12:16], "big"),
            })
        if subtype == 0x07:
            _check(data, (7,))
            return Packet("setup", {
                "interval": int.from_bytes(data[3:5], "big"),
                "periodic": _boolean(data[5]),
            })
        raise ValueError(f"Unknown MOPS update subtype: {subtype}")
    if message == 0x08:
        _check(data, (7,))
        return Packet("interval_ack", {"interval": int.from_bytes(data[2:6], "big")})
    if message == 0x09:
        _check(data, (7,))
        return Packet("clock_ack", {"clock": int.from_bytes(data[2:6], "big")})
    if message == 0x16:
        _check(data, (4,))
        return Packet("periodic_ack", {"periodic": _boolean(data[2])})
    if message == 0x54:
        _check(data, (9,))
        minor = int.from_bytes(data[2:4], "big")
        major = int.from_bytes(data[4:6], "big")
        return Packet("version", {"firmware": f"{major}.{minor}"})
    if message == 0x0B:
        _check(data, (11,))
        return Packet("history", {})
    if message == 0x0A:
        _check(data, (4,))
        return Packet("history_end", {})
    if message == 0x01:
        _check(data, (3,))
        return Packet("shutdown", {})
    raise ValueError(f"Unknown MOPS message: {message}")


def _command(message: int, payload: bytes) -> bytes:
    data = bytes((0xAA, message)) + payload
    return data + bytes((sum(data) & 0xFF,))


def set_clock(timestamp: int) -> bytes:
    if type(timestamp) is not int or not 0 <= timestamp <= 0xFFFFFFFF:
        raise ValueError("Invalid MOPS timestamp")
    return _command(0x09, timestamp.to_bytes(4, "big"))


def set_interval(minutes: int) -> bytes:
    # Firmware 1.12 rejects the reference client's five-minute preset and
    # reports the unchanged interval. Do not offer it as a usable setting.
    if type(minutes) is not int or minutes not in INTERVALS:
        raise ValueError("Invalid MOPS measurement interval")
    return _command(0x08, minutes.to_bytes(2, "big"))


def set_periodic(enabled: bool) -> bytes:
    if type(enabled) is not bool:
        raise ValueError("MOPS periodic mode must be boolean")
    return _command(0x16, bytes((int(enabled),)))


class MonitorState:
    """Track actual sample age separately from repeated Bluetooth reports."""

    def __init__(self):
        self.values = {}
        self.seen = {}
        self.last_packet_at = None
        self.sample_at = None

    def apply(self, packet: Packet, now: float) -> bool:
        """Return whether entity data changed; ACKs never fabricate telemetry."""
        if packet.kind not in {"battery", "setup", "measurement", "runtime", "version"}:
            return False
        updates = {}
        if packet.kind in {"battery", "setup", "version"}:
            updates = packet.values
        elif packet.kind == "measurement":
            record = packet.values["record_time"]
            age = packet.values["device_time"] - record
            if age < -2:
                raise ValueError("MOPS sample is ahead of the device clock")
            previous = self.values.get("record_time")
            if record and (previous is None or record > previous):
                updates = {"pm25": packet.values["pm25"], "record_time": record}
                self.sample_at = now - max(0, age)
            elif record and record == previous:
                # Repeats contain a ticking device clock; they are not new
                # measurements and must never extend the existing sample age.
                self.sample_at = min(self.sample_at, now - max(0, age))
        self.last_packet_at = now
        for key in updates:
            self.seen[key] = now
        changed = any(self.values.get(k) != v for k, v in updates.items())
        self.values.update(updates)
        return changed

    def available(self, key: str, now: float) -> bool:
        if key not in self.values or self.last_packet_at is None or now - self.last_packet_at > 90:
            return False
        if key in {"pm25", "record_time"}:
            interval = self.values.get("interval", 1) if self.values.get("periodic") else 1
            return self.sample_at is not None and now - self.sample_at <= max(180, interval * 60 + 90)
        return now - self.seen[key] <= 90
