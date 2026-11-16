"""Enable or disable the device's periodic measurement schedule."""
from homeassistant.components.switch import SwitchEntity
from homeassistant.const import EntityCategory

from .entity import MopsEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([MopsPeriodic(entry.runtime_data)])


class MopsPeriodic(MopsEntity, SwitchEntity):
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:timer-sync-outline"

    def __init__(self, coordinator):
        super().__init__(coordinator, "periodic")

    @property
    def is_on(self):
        return self.coordinator.data.get("periodic")

    async def async_turn_on(self, **kwargs):
        await self.coordinator.async_set_periodic(True)

    async def async_turn_off(self, **kwargs):
        await self.coordinator.async_set_periodic(False)
