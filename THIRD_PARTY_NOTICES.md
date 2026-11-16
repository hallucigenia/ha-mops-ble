# Protocol references and third-party notices

This is a new Python Home Assistant integration. Protocol research used existing
public work and real-device observations. It must not be described as an entirely
independent protocol discovery or a clean-room implementation.

| Reference | Fixed revision | Use |
| --- | --- | --- |
| [CursedHardware/mops-vida-pm-watchdog](https://github.com/CursedHardware/mops-vida-pm-watchdog/tree/0a18b63f85f61ec785e92e6f41fc0cef65c72fce) | `0a18b63f85f61ec785e92e6f41fc0cef65c72fce` | Packet layout, command identifiers, service identifiers, interval controls |
| [iseki0/pm25](https://github.com/iseki0/pm25/tree/89af28eede00d045ee9bc3ce082c0aa7d725f58a) | `89af28eede00d045ee9bc3ce082c0aa7d725f58a` | Additional Android protocol/client reference |

MIT notices for these references are retained in the installable component:
[watchdog](custom_components/mops_ble/licenses/watchdog-MIT.txt) and
[Android reference](custom_components/mops_ble/licenses/android-MIT.txt).
Their terms are not replaced by the project's noncommercial license. No upstream
JavaScript or Android runtime, stock application, or firmware is bundled here.

The Python transport, validation, freshness handling, command confirmation and HA
entities are maintained in this project. The machine-readable reference record is
[UPSTREAM.json](custom_components/mops_ble/UPSTREAM.json).

Home Assistant, bleak-retry-connector and their dependencies are installed
separately and remain subject to their respective licenses. The neutral particle
icon shipped here is project artwork, not an official manufacturer or HA logo.
