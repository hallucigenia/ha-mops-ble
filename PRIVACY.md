# Privacy and safe feedback

The integration uses Home Assistant's local Bluetooth manager. It has no analytics,
manufacturer account, or application cloud endpoint. Installation and dependency
downloads still use the normal HA/HACS package services.

HA stores the selected monitor's Bluetooth address in its config entry and device
registry. HA may record environmental measurements and sample times in its local
recorder. Bluetooth adapters and proxies are configured by HA; this integration
does not store proxy API credentials or implement a separate scanner.

The integration-specific diagnostics include only firmware, measurement settings,
battery/charging status, connection status, and relative packet age. They omit
addresses, device identifiers, absolute timestamps, raw packets, and PM2.5 history.
HA's surrounding diagnostics and general logs can contain additional metadata:
review the complete file before sharing it.

## What to share

Share model, firmware, HA/integration versions, whether you use a direct adapter
or active proxy, reproduction steps, and a brief redacted error excerpt. Replace
device addresses and identifiers with `<redacted>` consistently. Use invented
timestamps and measurements in protocol examples, then recalculate the checksum.

## What to remove

- Access tokens, cookies, authorization headers, Wi-Fi/ESPHome credentials and keys.
- Bluetooth MACs, serials, config-entry/device/entity IDs tied to a household.
- Internal/public home IPs, hostnames, HA URLs, account email, precise location,
  room names, and screenshots identifying a household.
- Real measurement history, absolute sample times, full logs, backups, `.storage`,
  APKs, firmware, and personal packet captures.

Run `python3 scripts/privacy_check.py --history` before publishing a branch. It is
a heuristic check of Git-visible files and reachable history, not proof that all
personal information has been removed. Review prose, images, binary attachments,
and Git author metadata as well. Use your preferred public attribution and a
GitHub no-reply commit email. The check rejects other email addresses and permits
GitHub's generic no-reply address for platform-generated commits.

For a suspected credential leak, revoke or rotate it first. If GitHub private
vulnerability reporting is enabled for this repository, use that channel for the
technical report. Otherwise open a minimal issue asking for a private reporting
channel, without posting credentials or exploit details.
