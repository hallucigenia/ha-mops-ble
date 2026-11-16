"""Transport lifecycle and command confirmation without HA or real Bluetooth."""
import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import AsyncMock, patch


class UpdateFailed(Exception):
    pass


class HomeAssistantError(Exception):
    pass


class FakeCoordinator:
    def __init__(self, hass, logger, **kwargs):
        self.hass = hass
        self.data = None
        self.last_update_success = True
        self.published = []
        self.shutdown = False

    def async_set_updated_data(self, data):
        self.data = data
        self.last_update_success = True
        self.published.append(data)

    def async_set_update_error(self, error):
        self.last_update_success = False

    async def async_shutdown(self):
        self.shutdown = True


ROOT = Path(__file__).resolve().parents[1] / "custom_components/mops_ble"
package = types.ModuleType("mops_coordinator_test_component")
package.__path__ = [str(ROOT)]
sys.modules[package.__name__] = package
bluetooth = types.SimpleNamespace(async_ble_device_from_address=lambda *args, **kwargs: object())
stubs = {
    "bleak_retry_connector": types.SimpleNamespace(BleakClientWithServiceCache=object, establish_connection=AsyncMock()),
    "homeassistant": types.ModuleType("homeassistant"),
    "homeassistant.components": types.SimpleNamespace(bluetooth=bluetooth),
    "homeassistant.exceptions": types.SimpleNamespace(HomeAssistantError=HomeAssistantError),
    "homeassistant.helpers": types.ModuleType("homeassistant.helpers"),
    "homeassistant.helpers.update_coordinator": types.SimpleNamespace(DataUpdateCoordinator=FakeCoordinator, UpdateFailed=UpdateFailed),
}
with patch.dict(sys.modules, stubs):
    spec = importlib.util.spec_from_file_location(package.__name__ + ".coordinator", ROOT / "coordinator.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

# Invented values; sample clock is 2000-01-01 UTC, not a device capture.
BATTERY = bytes.fromhex("aa50044900000000000000000000000000000047")
SETUP = bytes.fromhex("aa5007000a010c")
SAMPLE = bytes.fromhex("aa5006002a0000386d438000386d43ba34")
VERSION = bytes.fromhex("aa54000c000100010c")


class FakeClient:
    def __init__(self, initial=True):
        self.is_connected = True
        self.initial = initial
        self.notify = None
        self.writes = []
        self.on_write = None
        self.services = types.SimpleNamespace(get_service=lambda _: object(), get_characteristic=lambda _: object())

    async def start_notify(self, uuid, callback):
        self.notify = callback
        if self.initial:
            for packet in (BATTERY, SAMPLE, SETUP, VERSION):
                callback(None, bytearray(packet))

    async def write_gatt_char(self, uuid, data, response):
        self.writes.append(bytes(data))
        if self.on_write:
            self.on_write(data)

    async def disconnect(self):
        self.is_connected = False


class CoordinatorTests(unittest.IsolatedAsyncioTestCase):
    def make_coordinator(self):
        return module.MopsCoordinator(types.SimpleNamespace(), types.SimpleNamespace(data={"address": "AA:BB:CC:DD:EE:FF"}))

    async def test_setup_uses_existing_manager_and_preserves_sampling_settings(self):
        coordinator = self.make_coordinator()
        client = FakeClient()
        with patch.object(module, "establish_connection", AsyncMock(return_value=client)) as connect:
            data = await coordinator._async_update_data()
        self.assertTrue(callable(connect.call_args.kwargs["ble_device_callback"]))
        self.assertEqual(data["interval"], 10)
        self.assertEqual(data["periodic"], True)
        self.assertEqual([p[1] for p in client.writes], [0x09])
        await coordinator.async_close()
        self.assertFalse(client.is_connected)
        self.assertTrue(coordinator.shutdown)

    async def test_gatt_response_or_wrong_ack_does_not_fabricate_a_setting(self):
        coordinator = self.make_coordinator()
        client = FakeClient()
        with patch.object(module, "establish_connection", AsyncMock(return_value=client)):
            await coordinator._async_update_data()
        def respond(_):
            client.notify(None, bytearray(bytes.fromhex("aa080000000abc")))
            client.notify(None, bytearray(SETUP))
        client.on_write = respond
        with patch.object(module, "COMMAND_TIMEOUT", 0.02), self.assertRaises(HomeAssistantError):
            await coordinator.async_set_interval(15)
        self.assertEqual(len([p for p in client.writes if p[1] == 0x08]), 1)
        self.assertTrue(all(data.get("interval") != 15 for data in coordinator.published))
        self.assertFalse(client.is_connected)
        self.assertFalse(coordinator.last_update_success)

    async def test_full_report_can_confirm_before_the_gatt_write_finishes(self):
        coordinator = self.make_coordinator()
        client = FakeClient()
        with patch.object(module, "establish_connection", AsyncMock(return_value=client)):
            await coordinator._async_update_data()
        client.on_write = lambda _: client.notify(None, bytearray(bytes.fromhex("aa5007000f0111")))
        await coordinator.async_set_interval(15)
        self.assertEqual(coordinator.data["interval"], 15)

    async def test_duplicate_reports_do_not_publish_every_device_clock_tick(self):
        coordinator = self.make_coordinator()
        for packet in (BATTERY, SAMPLE, SETUP):
            coordinator._notification(0, packet)
        count = len(coordinator.published)
        for _ in range(100):
            for packet in (BATTERY, SAMPLE, SETUP):
                coordinator._notification(0, packet)
        self.assertEqual(len(coordinator.published), count)

    async def test_old_notifications_and_disconnect_callbacks_are_ignored(self):
        coordinator = self.make_coordinator()
        client = FakeClient()
        coordinator._client = client
        await coordinator._close_locked()
        coordinator._notification(0, BATTERY)
        coordinator._disconnected(client)
        self.assertFalse(coordinator.published)
        self.assertTrue(coordinator.last_update_success)

    async def test_cancelled_setup_disconnects_and_invalidates_callbacks(self):
        coordinator = self.make_coordinator()
        client = FakeClient(initial=False)
        with patch.object(module, "establish_connection", AsyncMock(return_value=client)):
            task = asyncio.create_task(coordinator._async_update_data())
            await asyncio.sleep(0)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertFalse(client.is_connected)
        client.notify(None, bytearray(BATTERY))
        self.assertFalse(coordinator.published)

    async def test_unload_does_not_allow_a_new_connection(self):
        coordinator = self.make_coordinator()
        await coordinator.async_close()
        with patch.object(module, "establish_connection", AsyncMock()) as connect:
            with self.assertRaises(UpdateFailed):
                await coordinator._async_update_data()
        connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
