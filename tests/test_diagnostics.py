"""Prevent personal telemetry or identifiers from entering integration diagnostics."""

import importlib.util
from pathlib import Path
import types
import unittest

PATH = Path(__file__).resolve().parents[1] / "custom_components/mops_ble/diagnostics.py"
SPEC = importlib.util.spec_from_file_location("mops_diagnostics_test", PATH)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class DiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_explicit_status_fields_are_exported(self):
        status = {"firmware": "1.12", "interval": 10, "periodic": True,
                  "battery": 73, "charging": False}
        values = dict(status, pm25=42, record_time=946684800, device_time=946684858,
                      address="AA:BB:CC:DD:EE:FF", future_private_field="synthetic")
        coordinator = types.SimpleNamespace(
            monitor=types.SimpleNamespace(values=values, last_packet_at=None), _client=None)
        entry = types.SimpleNamespace(runtime_data=coordinator, data={"address": "AA:BB:CC:DD:EE:FF"})
        result = await module.async_get_config_entry_diagnostics(None, entry)
        self.assertEqual(result, {"status": status, "connected": False, "last_packet_age": None})
        result["status"]["interval"] = 15
        self.assertEqual(values["interval"], 10)
