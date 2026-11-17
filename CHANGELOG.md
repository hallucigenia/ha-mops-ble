# Changelog

## 1.0.1b2

Adds an optional, manually installed MOPS Air dashboard card: original device
illustration, concentration-based breathing, recorded 6/24-hour sample history,
battery/charging status and confirmed native settings. All six entities, the
name and optional location are configurable; English and Simplified Chinese
follow HA or an explicit override. Rebinding discards the previous monitor's
history and late responses. The standalone bundle contains its illustration
and has no external runtime dependencies.

Adds independent frontend builds, synthetic previews, browser regression tests,
and checks of image provenance metadata including embedded PNGs. Example images
and animations use invented data. Integration runtime behavior is unchanged.

## 1.0.1b1

First public beta of the native HA Bluetooth integration: six entities, verified
settings, reconnect and freshness handling, synthetic offline regression tests,
English/Simplified Chinese setup, and privacy-focused diagnostics.

Tested with AD520-P001 firmware 1.12 and HA Core 2026.11.1 over an active ESPHome
Bluetooth proxy. Other combinations require compatibility feedback.
