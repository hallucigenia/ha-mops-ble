"""Synthetic leak regressions for the publishing check; no real credentials."""

import importlib.util
import base64
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / "scripts/privacy_check.py"
SPEC = importlib.util.spec_from_file_location("mops_privacy_test", PATH)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class PrivacyTests(unittest.TestCase):
    def categories(self, value):
        return {category for _, category in module.text_findings(value)}

    def test_detects_private_addresses_and_home_paths(self):
        cases = [
            ("192.168." + "7.8", "private IPv4"),
            ("fd12:" + ":1234", "private IPv6"),
            ("12:34:56:" + "78:9A:BC", "device address"),
            ("/Users/" + "synthetic/project", "local user path"),
            ("synthetic." + "local", "private hostname"),
            ("synthetic@" + "example.com", "personal email"),
        ]
        for value, category in cases:
            with self.subTest(category=category):
                self.assertIn(category, self.categories(value))

    def test_detects_tokens_and_credential_values(self):
        cases = [
            ("ghp_" + "x" * 30, "access token"),
            ("Bearer " + "x" * 30, "authorization value"),
            ("password=" + repr("synthetic-password-value"), "credential assignment"),
            ("-----BEGIN " + "PRIVATE KEY-----", "private key"),
        ]
        for value, category in cases:
            with self.subTest(category=category):
                self.assertIn(category, self.categories(value))

    def test_allows_public_identifiers_and_placeholders(self):
        for value in ("AA:BB:CC:DD:EE:FF", "00007676-0000-1000-8000-00805f9b34fb",
                      "203.0.113.10", "12226544+hallucigenia@users.noreply.github.com",
                      "noreply@github.com"):
            with self.subTest(value=value):
                self.assertEqual(module.text_findings(value), [])

    def test_rejects_captures_and_household_files(self):
        for name in ("runs/capture.txt", ".storage/config_entries", "device.apk", "secrets.yaml"):
            with self.subTest(name=name):
                self.assertIn((0, "excluded path"), module.file_findings(name, b"synthetic"))

    def test_rejects_unreviewed_binaries_and_png_metadata(self):
        self.assertIn((0, "unreviewed binary"), module.file_findings("capture.dat", b"\xff\x00"))
        self.assertIn((0, "invalid PNG"), module.file_findings("icon.png", b"synthetic"))
        data = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x00tEXt" + b"\x00" * 4
        self.assertIn((0, "PNG metadata requires review"), module.file_findings("icon.png", data))

    def test_reviews_embedded_images_instead_of_only_scanning_base64_as_text(self):
        data = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x00tEXt" + b"\x00" * 4
        text = 'const image="data:image/png;base64,' + base64.b64encode(data).decode() + '";'
        self.assertIn((0, "embedded image: PNG metadata requires review"), module.file_findings("card.js", text.encode()))

    def test_only_exact_reviewed_artwork_keeps_its_provenance_metadata(self):
        image = PATH.parent.parent / "frontend/assets/mops-shell.png"
        data = image.read_bytes()
        self.assertEqual(module.file_findings("illustration.png", data), [])
        changed = data[:-1] + bytes([data[-1] ^ 1])
        self.assertIn((0, "PNG metadata requires review"), module.file_findings("illustration.png", changed))

    def test_gif_comments_and_trailing_data_require_review(self):
        header = b"GIF89a" + b"\x01\x00\x01\x00\x00\x00\x00"
        self.assertEqual(module.gif_findings(header + b";"), [])
        self.assertIn((0, "GIF metadata requires review"), module.gif_findings(header + b"!\xfe\x03abc\x00;"))
        self.assertIn((0, "GIF trailing data"), module.gif_findings(header + b";text"))
        extra = b"!\xff\x0bNETSCAPE2.0\x08metadata\x00;"
        self.assertIn((0, "GIF metadata requires review"), module.gif_findings(header + extra))
