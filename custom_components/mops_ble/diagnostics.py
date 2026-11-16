"""Export only status fields needed for troubleshooting."""
import time

STATUS_FIELDS = ("firmware", "interval", "periodic", "battery", "charging")


async def async_get_config_entry_diagnostics(hass, entry):
    coordinator = entry.runtime_data
    last = coordinator.monitor.last_packet_at
    return {
        "status": {key: coordinator.monitor.values[key] for key in STATUS_FIELDS
                   if key in coordinator.monitor.values},
        "connected": bool(coordinator._client and coordinator._client.is_connected),
        "last_packet_age": None if last is None else time.monotonic() - last,
    }
