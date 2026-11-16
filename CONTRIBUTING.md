# Contributing

Bug reports, PRs, and device/firmware compatibility feedback are welcome. There is
no promised response time. Be respectful and keep reports reproducible.

## Reports

Use the bug or compatibility template. Include software versions and transport
type, then the smallest steps that reproduce the problem. State whether you
tested read-only telemetry, settings, reconnect, and unload separately.

Read [PRIVACY.md](PRIVACY.md) before attaching anything. Full HA logs, backups,
firmware dumps, APKs, and personal device captures do not belong in a report.
Convert a useful protocol case into a synthetic fixture with a valid checksum.

## Pull requests

1. Keep changes focused and describe the user-visible effect.
2. Add a meaningful regression test for protocol, lifecycle, or privacy behavior.
3. Run the three development checks in the README. Do not connect CI to a live HA
   instance or supply household credentials.
4. Keep dependencies and references explicit. Preserve their licenses and notices.
5. Describe real hardware testing separately from stub-based tests.

By submitting a contribution for inclusion, you offer your contribution under the
project's PolyForm Noncommercial 1.0.0 license. You retain your copyright; no
copyright transfer is requested. Preserve `Required Notice: Copyright (c) 2026
hallucigenia`, existing third-party notices, and any applicable contributor notices.
Do not submit code you cannot license on these terms. Discuss incompatible
third-party code or a proposed license change before submitting it.
