"""PM2.5, battery and the actual measurement timestamp."""
from datetime import datetime, timezone

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import PERCENTAGE, EntityCategory, UnitOfDensity

from .entity import MopsEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([MopsSensor(entry.runtime_data, key) for key in ("pm25", "battery", "record_time")])


class MopsSensor(MopsEntity, SensorEntity):
    def __init__(self, coordinator, key):
        super().__init__(coordinator, key)
        if key == "pm25":
            self._attr_device_class = SensorDeviceClass.PM25
            self._attr_native_unit_of_measurement = UnitOfDensity.MICROGRAMS_PER_CUBIC_METER
            self._attr_state_class = SensorStateClass.MEASUREMENT
        elif key == "battery":
            self._attr_device_class = SensorDeviceClass.BATTERY
            self._attr_native_unit_of_measurement = PERCENTAGE
            self._attr_state_class = SensorStateClass.MEASUREMENT
            self._attr_entity_category = EntityCategory.DIAGNOSTIC
        else:
            self._attr_device_class = SensorDeviceClass.TIMESTAMP
            self._attr_entity_category = EntityCategory.DIAGNOSTIC

    @property
    def native_value(self):
        value = self.coordinator.data.get(self.key)
        if self.key == "record_time" and value is not None:
            return datetime.fromtimestamp(value, timezone.utc)
        return value
