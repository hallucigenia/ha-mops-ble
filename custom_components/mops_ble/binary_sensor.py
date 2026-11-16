"""Charging status reported by the monitor."""
from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.const import EntityCategory

from .entity import MopsEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([MopsCharging(entry.runtime_data)])


class MopsCharging(MopsEntity, BinarySensorEntity):
    _attr_device_class = BinarySensorDeviceClass.BATTERY_CHARGING
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator):
        super().__init__(coordinator, "charging")

    @property
    def is_on(self):
        return self.coordinator.data.get("charging")
