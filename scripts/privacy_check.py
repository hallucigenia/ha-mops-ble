"""Check Git-visible files, reachable history, or a release ZIP for common leaks.

This heuristic complements manual review. Findings contain paths and categories,
never the matching secret. Only a neutral PNG icon is accepted as binary content.
"""

import argparse
import ipaddress
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PLACEHOLDER_MACS = {"AA:BB:CC:DD:EE:FF", "00:00:00:00:00:00"}
FORBIDDEN_PARTS = {".local", ".storage", "runs", "node_modules", ".venv", "__pycache__", ".git"}
FORBIDDEN_SUFFIXES = {".apk", ".bin", ".pcap", ".pcapng", ".db", ".sqlite", ".sqlite3", ".log", ".zip", ".pem", ".key", ".pyc"}
PATTERNS = {
    "local user path": re.compile(r"/(?:Users|home)/[^\s/\"'<>]+"),
    "private hostname": re.compile(r"\b[\w-]+(?:\.[\w-]+)*\.(?:local|lan|internal|duckdns\.org|ui\.nabu\.casa)\b", re.I),
    "private IPv6": re.compile(r"(?<![\w:])(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):[0-9a-f:]+", re.I),
    "private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "access token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})\b"),
    "authorization value": re.compile(r"\bBearer\s+[A-Za-z0-9._~-]{16,}", re.I),
    "credential assignment": re.compile(r"\b(?:password|passwd|api_key|access_token|refresh_token|encryption_key)\s*[=:]\s*[\"'][^\"'\s<>{}]{8,}[\"']", re.I),
}
MAC = re.compile(r"(?<![\w:])(?:[0-9a-f]{2}:){5}[0-9a-f]{2}(?![\w:])", re.I)
IPV4 = re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])")
EMAIL = re.compile(r"[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def text_findings(value):
    """Return line/category pairs without exposing matching values."""
    findings = set()
    for number, line in enumerate(value.splitlines(), 1):
        for category, pattern in PATTERNS.items():
            if pattern.search(line):
                findings.add((number, category))
        if any(match.group().upper() not in PLACEHOLDER_MACS for match in MAC.finditer(line)):
            findings.add((number, "device address"))
        for match in IPV4.finditer(line):
            try:
                address = ipaddress.ip_address(match.group())
            except ValueError:
                continue
            first, second, _, _ = address.packed
            if (first == 10 or (first == 172 and 16 <= second <= 31)
                    or (first, second) in {(192, 168), (169, 254)}):
                findings.add((number, "private IPv4"))
        for match in EMAIL.finditer(line):
            address = match.group().lower()
            if address != "noreply@github.com" and not address.endswith("@users.noreply.github.com"):
                findings.add((number, "personal email"))
    return sorted(findings)


def file_findings(name, data):
    path = PurePosixPath(name)
    findings = []
    if (path.is_absolute() or ".." in path.parts or set(path.parts) & FORBIDDEN_PARTS
            or path.suffix.lower() in FORBIDDEN_SUFFIXES
            or path.name in {"secrets.yaml", "configuration.yaml", ".env"}
            or path.name.startswith(".env.")):
        findings.append((0, "excluded path"))
    findings.extend(text_findings(name))
    if path.suffix.lower() == ".png":
        # Text/EXIF/time chunks can leak metadata. Project icons need none.
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            return findings + [(0, "invalid PNG")]
        offset, chunks = 8, []
        while offset + 12 <= len(data):
            size = struct.unpack(">I", data[offset:offset + 4])[0]
            chunks.append(data[offset + 4:offset + 8])
            offset += 12 + size
        if offset != len(data) or not chunks or chunks[-1] != b"IEND":
            findings.append((0, "invalid PNG structure"))
        if set(chunks) - {b"IHDR", b"IDAT", b"IEND"}:
            findings.append((0, "PNG metadata requires review"))
        return findings
    try:
        value = data.decode("utf-8")
    except UnicodeDecodeError:
        return findings + [(0, "unreviewed binary")]
    if "\x00" in value:
        findings.append((0, "unreviewed binary"))
    return findings + text_findings(value)


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true", help="also scan every reachable commit and its metadata")
    parser.add_argument("--archive", type=Path, help="scan a release ZIP instead of the worktree")
    args = parser.parse_args()
    issues, count = [], 0

    def inspect(name, data, label=None):
        nonlocal count
        count += 1
        for line, category in file_findings(name, data):
            issues.append(f"{label or name}:{line}: {category}")

    if args.archive:
        with zipfile.ZipFile(args.archive) as archive:
            for item in archive.infolist():
                if not item.is_dir():
                    inspect(item.filename, archive.read(item))
                if item.comment or item.extra:
                    # git archive uses an extended timestamp field; inspect it separately.
                    if item.comment or (item.extra and item.extra[:2] != b"UT"):
                        issues.append(f"{item.filename}:0: archive metadata requires review")
            if archive.comment and not re.fullmatch(rb"[0-9a-f]{40}", archive.comment):
                issues.append("archive:0: archive comment requires review")
    else:
        names = git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0")
        for name in sorted(set(names) - {""}):
            path = ROOT / name
            if path.is_symlink():
                issues.append(f"{name}:0: symlink requires review")
            elif path.is_file():
                inspect(name, path.read_bytes())
            else:
                issues.append(f"{name}:0: missing Git-visible file")
        if args.history:
            seen = set()
            for commit in git("rev-list", "--all").decode().splitlines():
                metadata = git("show", "-s", "--format=%an%n%ae%n%cn%n%ce%n%B", commit).decode()
                for line, category in text_findings(metadata):
                    issues.append(f"commit {commit[:12]}:{line}: {category}")
                for record in git("ls-tree", "-rz", commit).split(b"\0"):
                    if not record:
                        continue
                    meta, raw_name = record.split(b"\t", 1)
                    mode, kind, oid = meta.split()
                    name = raw_name.decode()
                    if mode not in (b"100644", b"100755") or kind != b"blob":
                        issues.append(f"{name}:0: non-regular Git object")
                        continue
                    key = (name, oid)
                    if key not in seen:
                        inspect(name, git("cat-file", "blob", oid.decode()), f"{commit[:12]}/{name}")
                        seen.add(key)
    if issues:
        print("\n".join(sorted(set(issues))))
        print(f"FAIL: {len(set(issues))} privacy findings; matching values omitted.")
        return 1
    print(f"PASS: checked {count} file versions; no heuristic privacy findings. Manual review still required.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
