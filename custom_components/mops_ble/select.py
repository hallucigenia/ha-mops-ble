"""Minute-based periodic measurement presets used by the stock client."""
from homeassistant.components.select import SelectEntity
from homeassistant.const import EntityCategory

from .entity import MopsEntity
from .protocol import INTERVALS


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([MopsInterval(entry.runtime_data)])


class MopsInterval(MopsEntity, SelectEntity):
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:timer-outline"
    _attr_options = [f"{minutes} min" for minutes in INTERVALS]

    def __init__(self, coordinator):
        super().__init__(coordinator, "interval")

    @property
    def current_option(self):
        minutes = self.coordinator.data.get("interval")
        return f"{minutes} min" if minutes is not None else None

    async def async_select_option(self, option):
        await self.coordinator.async_set_interval(int(option.split()[0]))
