"""Native entities attached to one physical MOPS monitor."""
import time

from homeassistant.helpers.device_registry import CONNECTION_BLUETOOTH, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, MODEL, NAME


class MopsEntity(CoordinatorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, key):
        super().__init__(coordinator)
        self.key = key
        self._attr_translation_key = key
        self._attr_unique_id = coordinator.address + "_" + key

    @property
    def device_info(self):
        return DeviceInfo(identifiers={(DOMAIN, self.coordinator.address)},
                          connections={(CONNECTION_BLUETOOTH, self.coordinator.address)},
                          name=NAME, manufacturer="MOPS", model=MODEL,
                          sw_version=self.coordinator.monitor.values.get("firmware"))

    @property
    def available(self):
        return super().available and self.coordinator.monitor.available(self.key, time.monotonic())
