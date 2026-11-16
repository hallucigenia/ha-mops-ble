"""Check the distributable integration without importing HA or connecting to it."""

import ast
import json
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components/mops_ble"


def keys(value, prefix=""):
    if isinstance(value, dict):
        return {key for name, item in value.items() for key in keys(item, prefix + "/" + name)}
    return {prefix}


def main():
    assert sorted(path.name for path in (ROOT / "custom_components").iterdir() if path.is_dir()) == ["mops_ble"]
    manifest = json.loads((COMPONENT / "manifest.json").read_text())
    assert manifest["domain"] == "mops_ble"
    assert manifest["codeowners"] == ["@hallucigenia"]
    assert manifest["config_flow"] is True
    assert re.fullmatch(r"\d+\.\d+\.\d+(?:b\d+)?", manifest["version"])
    assert manifest["documentation"] == "https://github.com/hallucigenia/ha-mops-ble"
    assert manifest["issue_tracker"] == manifest["documentation"] + "/issues"
    # HA manages this shared dependency; follow its version instead of pinning it.
    assert manifest["requirements"] == ["bleak-retry-connector>=4.7.1"]
    assert json.loads((ROOT / "hacs.json").read_text())["homeassistant"] == "2026.11.1"
    assert (ROOT / "LICENSE").read_bytes() == (COMPONENT / "LICENSE").read_bytes()
    for name in ("LICENSE", "NOTICE"):
        assert "Required Notice: Copyright (c) 2026 hallucigenia" in (COMPONENT / name).read_text()
    for name in ("watchdog-MIT.txt", "android-MIT.txt"):
        assert "Permission is hereby granted, free of charge" in (COMPONENT / "licenses" / name).read_text()
    original = json.loads((COMPONENT / "strings.json").read_text())
    for name in ("en.json", "zh-Hans.json"):
        translation = json.loads((COMPONENT / "translations" / name).read_text())
        assert keys(original) == keys(translation), f"Translation keys differ: {name}"
    for path in ROOT.rglob("*.json"):
        if ".git" not in path.parts:
            json.loads(path.read_text())
    for path in ROOT.rglob("*.py"):
        if ".git" not in path.parts:
            ast.parse(path.read_text(), filename=str(path.relative_to(ROOT)))
    for path in ROOT.rglob("*.md"):
        if ".git" in path.parts:
            continue
        for target in re.findall(r"\]\(([^)]+)\)", path.read_text()):
            if not re.match(r"[a-z]+:|#", target):
                assert (path.parent / target.split("#")[0]).exists(), f"Missing link in {path.relative_to(ROOT)}"
    icon = (COMPONENT / "brand/icon.png").read_bytes()
    assert icon[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", icon[16:24]) == (256, 256)
    print("PASS: package layout, metadata, notices, translations, syntax, links and icon")


if __name__ == "__main__":
    main()
