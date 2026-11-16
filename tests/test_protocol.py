"""Synthetic protocol vectors and freshness regressions; no network access."""
import importlib.util
from pathlib import Path
import sys
import unittest

PATH = Path(__file__).resolve().parents[1] / "custom_components/mops_ble/protocol.py"
SPEC = importlib.util.spec_from_file_location("mops_protocol_test", PATH)
protocol = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = protocol
SPEC.loader.exec_module(protocol)

# Invented values; sample clock is 2000-01-01 UTC, not a device capture.
BATTERY = bytes.fromhex("aa50044900000000000000000000000000000047")
SAMPLE = bytes.fromhex("aa5006002a0000386d438000386d43ba34")
SETUP = bytes.fromhex("aa5007000a010c")
VERSION = bytes.fromhex("aa54000c000100010c")
RUNTIME = bytes.fromhex("aa50050000025800000078000000000000d1")


def frame(payload):
    return payload + bytes((sum(payload) & 255,))


class ProtocolTests(unittest.TestCase):
    def test_synthetic_values_and_byte_order(self):
        self.assertEqual(protocol.decode_packet(BATTERY).values, {"battery": 73, "charging": False})
        self.assertEqual(protocol.decode_packet(SAMPLE).values, {
            "pm25": 42, "record_time": 946684800, "device_time": 946684858})
        self.assertEqual(protocol.decode_packet(SETUP).values, {"interval": 10, "periodic": True})
        self.assertEqual(protocol.decode_packet(VERSION).values, {"firmware": "1.12"})
        self.assertEqual(protocol.decode_packet(RUNTIME).values, {"runtime": 600, "boot_time": 120})

    def test_reject_corrupt_truncated_and_trailing_data(self):
        for vector in (BATTERY, SAMPLE, SETUP, VERSION, RUNTIME):
            for packet in (vector[:-1], vector + b"\x00", b"\xab" + vector[1:], vector[:-1] + bytes((vector[-1] ^ 1,))):
                with self.subTest(packet=packet.hex()), self.assertRaises(ValueError):
                    protocol.decode_packet(packet)
            with self.assertRaises(ValueError):
                protocol.decode_packet(frame(vector[:-2]))

    def test_reject_invalid_battery_and_boolean(self):
        data = bytearray(BATTERY[:-1])
        data[3] = 101
        with self.assertRaises(ValueError):
            protocol.decode_packet(frame(data))
        data[3], data[6] = 90, 2
        with self.assertRaises(ValueError):
            protocol.decode_packet(frame(data))
        with self.assertRaises(ValueError):
            protocol.decode_packet(frame(bytes.fromhex("aa5007000a02")))

    def test_repeats_do_not_publish_new_measurements(self):
        state = protocol.MonitorState()
        state.apply(protocol.decode_packet(SETUP), 100)
        self.assertTrue(state.apply(protocol.decode_packet(SAMPLE), 100))
        self.assertFalse(state.apply(protocol.decode_packet(SAMPLE), 110))
        self.assertEqual(state.sample_at, 42)
        # Even a stream of battery/status messages cannot keep a 10-minute
        # sample available beyond its actual age plus the grace period.
        state.apply(protocol.decode_packet(BATTERY), 733)
        self.assertTrue(state.available("battery", 733))
        self.assertFalse(state.available("pm25", 733))

    def test_history_and_ack_never_replace_live_values(self):
        state = protocol.MonitorState()
        state.apply(protocol.decode_packet(SAMPLE), 100)
        values = dict(state.values)
        for packet in (frame(bytes.fromhex("aa0b00070000386d431c")),
                       bytes.fromhex("aa080000000abc"), bytes.fromhex("aa1601c1")):
            self.assertFalse(state.apply(protocol.decode_packet(packet), 101))
        self.assertEqual(state.values, values)
        self.assertEqual(state.last_packet_at, 100)

    def test_old_sample_cannot_roll_back_new_measurement(self):
        state = protocol.MonitorState()
        state.apply(protocol.decode_packet(SAMPLE), 100)
        packet = protocol.Packet("measurement", {"pm25": 5, "record_time": 946684780, "device_time": 946684859})
        self.assertFalse(state.apply(packet, 101))
        self.assertEqual(state.values["pm25"], 42)

    def test_bad_or_uninitialized_clock_does_not_create_a_sample(self):
        state = protocol.MonitorState()
        packet = protocol.Packet("measurement", {"pm25": 0, "record_time": 0, "device_time": 0})
        self.assertFalse(state.apply(packet, 100))
        self.assertFalse(state.available("pm25", 100))
        with self.assertRaises(ValueError):
            state.apply(protocol.Packet("measurement", {"pm25": 42, "record_time": 100, "device_time": 50}), 101)

    def test_connection_and_individual_field_staleness(self):
        state = protocol.MonitorState()
        state.apply(protocol.decode_packet(BATTERY), 100)
        self.assertFalse(state.available("pm25", 100))
        state.apply(protocol.decode_packet(SAMPLE), 180)
        self.assertTrue(state.available("battery", 180))
        self.assertFalse(state.available("battery", 191))
        self.assertFalse(state.available("pm25", 271))

    def test_command_bounds_and_synthetic_control(self):
        self.assertEqual(protocol.set_interval(10), bytes.fromhex("aa08000abc"))
        self.assertEqual(protocol.set_periodic(False), bytes.fromhex("aa1600c0"))
        self.assertEqual(protocol.set_periodic(True), bytes.fromhex("aa1601c1"))
        for value in (True, 0, 5, -1, 121, 65536, 5.5):
            with self.assertRaises(ValueError):
                protocol.set_interval(value)
        for value in (0, 1, "true"):
            with self.assertRaises(ValueError):
                protocol.set_periodic(value)
        with self.assertRaises(ValueError):
            protocol.set_clock(-1)


if __name__ == "__main__":
    unittest.main()
