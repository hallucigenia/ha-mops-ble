"""One persistent UART subscription; no cloud, proxy credentials or own scanner."""
import asyncio
from contextlib import suppress
from datetime import timedelta
import logging
import time

from bleak_retry_connector import BleakClientWithServiceCache, establish_connection
from homeassistant.components import bluetooth
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import NAME, NOTIFY_UUID, UART_UUID, WRITE_UUID
from .protocol import MonitorState, decode_packet, set_clock, set_interval, set_periodic

LOGGER = logging.getLogger(__name__)
COMMAND_TIMEOUT = 10


class MopsCoordinator(DataUpdateCoordinator):
    def __init__(self, hass, entry):
        super().__init__(hass, LOGGER, config_entry=entry, name=NAME,
                         update_interval=timedelta(seconds=30))
        self.address = entry.data["address"]
        self.monitor = MonitorState()
        self._lock = asyncio.Lock()
        self._changed = asyncio.Event()
        self._client = None
        self._generation = 0
        self._setup_revision = 0
        self._stopping = False

    def _notification(self, generation, data):
        if generation != self._generation or self._stopping:
            return
        try:
            packet = decode_packet(bytes(data))
            changed = self.monitor.apply(packet, time.monotonic())
        except ValueError as exc:
            LOGGER.debug("Ignoring invalid MOPS notification: %s", exc)
            return
        if packet.kind == "setup":
            self._setup_revision += 1
        self._changed.set()
        # The device repeats its last sample several times a second. Only
        # meaningful telemetry changes reset the coordinator's refresh timer.
        if changed:
            self.async_set_updated_data(dict(self.monitor.values))

    def _disconnected(self, client):
        if client is self._client and not self._stopping:
            self.async_set_update_error(UpdateFailed("MOPS Bluetooth connection lost"))
            self._changed.set()

    async def _close_locked(self):
        self._generation += 1
        client, self._client = self._client, None
        self.monitor = MonitorState()
        self._changed.set()
        if client is not None:
            with suppress(Exception):
                async with asyncio.timeout(8):
                    await client.disconnect()

    async def _wait_telemetry(self):
        async with asyncio.timeout(12):
            while not {"battery", "interval", "periodic", "firmware"}.issubset(self.monitor.values):
                self._changed.clear()
                if self._client is None or not self._client.is_connected:
                    raise UpdateFailed("MOPS disconnected before sending telemetry")
                await self._changed.wait()

    async def _connect_locked(self):
        if self._stopping:
            raise UpdateFailed("MOPS is unloading")
        if self._client is not None and self._client.is_connected:
            return
        await self._close_locked()
        device = bluetooth.async_ble_device_from_address(self.hass, self.address, connectable=True)
        if device is None:
            raise UpdateFailed("MOPS is not visible to a connectable Bluetooth adapter")
        generation = self._generation
        try:
            client = await establish_connection(
                BleakClientWithServiceCache, device, NAME,
                disconnected_callback=self._disconnected, max_attempts=2, timeout=15,
                ble_device_callback=lambda: bluetooth.async_ble_device_from_address(
                    self.hass, self.address, connectable=True) or device)
            self._client = client
            if (client.services.get_service(UART_UUID) is None
                    or client.services.get_characteristic(NOTIFY_UUID) is None
                    or client.services.get_characteristic(WRITE_UUID) is None):
                raise UpdateFailed("Device does not provide the MOPS UART service")
            # Bleak also writes the CCC descriptor; local notify registration
            # alone is insufficient on an ESPHome proxy.
            await client.start_notify(NOTIFY_UUID, lambda _, data: self._notification(generation, data))
            await self._wait_telemetry()
            # The stock client synchronizes this clock, which timestamps the
            # stored measurement. Do not change sampling mode during setup.
            await client.write_gatt_char(WRITE_UUID, set_clock(int(time.time())), response=True)
        except BaseException:
            await asyncio.shield(asyncio.create_task(self._close_locked()))
            raise

    async def _async_update_data(self):
        async with self._lock:
            try:
                await self._connect_locked()
                last = self.monitor.last_packet_at
                if last is None or time.monotonic() - last > 90:
                    raise UpdateFailed("MOPS has stopped sending telemetry")
                return dict(self.monitor.values)
            except Exception as exc:
                await self._close_locked()
                raise UpdateFailed("Unable to read MOPS Bluetooth state: " + str(exc)) from exc

    async def _command(self, data, key, value):
        async with self._lock:
            try:
                await self._connect_locked()
                revision = self._setup_revision
                async with asyncio.timeout(COMMAND_TIMEOUT):
                    # A GATT write response only acknowledges transport. Wait
                    # for a newer full setup report containing the actual value.
                    await self._client.write_gatt_char(WRITE_UUID, data, response=True)
                    while self._setup_revision <= revision or self.monitor.values.get(key) != value:
                        self._changed.clear()
                        if not self._client.is_connected:
                            raise UpdateFailed("MOPS disconnected during the command")
                        await self._changed.wait()
            except Exception as exc:
                await self._close_locked()
                self.async_set_update_error(UpdateFailed(str(exc)))
                raise HomeAssistantError("MOPS did not confirm the setting: " + str(exc)) from exc

    async def async_set_interval(self, minutes):
        await self._command(set_interval(minutes), "interval", minutes)

    async def async_set_periodic(self, enabled):
        await self._command(set_periodic(enabled), "periodic", enabled)

    async def async_stop(self, _event):
        await self.async_close()

    async def async_close(self):
        self._stopping = True
        await self.async_shutdown()
        async with self._lock:
            await self._close_locked()
