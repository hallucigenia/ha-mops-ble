"""Discover or select a MOPS monitor already visible to HA Bluetooth."""
import re

from homeassistant.components import bluetooth
from homeassistant.config_entries import ConfigFlow
from homeassistant.helpers import selector
import voluptuous as vol

from .const import DISCOVERY_UUID, DOMAIN, MANUFACTURER_ID, NAME


def is_mops(info):
    return (DISCOVERY_UUID in info.service_uuids
            and MANUFACTURER_ID in info.manufacturer_data)


class MopsConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_bluetooth(self, discovery_info):
        if not is_mops(discovery_info):
            return self.async_abort(reason="not_supported")
        self._address = discovery_info.address.upper()
        await self.async_set_unique_id(self._address)
        self._abort_if_unique_id_configured()
        self.context["title_placeholders"] = {"name": NAME}
        return await self.async_step_bluetooth_confirm()

    async def async_step_bluetooth_confirm(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title=NAME, data={"address": self._address})
        return self.async_show_form(step_id="bluetooth_confirm",
                                    description_placeholders={"address": self._address})

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            address = user_input["address"].strip().upper()
            if not re.fullmatch(r"(?:[0-9A-F]{2}:){5}[0-9A-F]{2}", address):
                errors["address"] = "invalid_address"
            else:
                info = bluetooth.async_last_service_info(self.hass, address, connectable=True)
                if info is None or not is_mops(info):
                    errors["base"] = "not_found"
                else:
                    await self.async_set_unique_id(address)
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(title=NAME, data={"address": address})
        options = [selector.SelectOptionDict(value=info.address, label=f"{info.name} ({info.address})")
                   for info in bluetooth.async_discovered_service_info(self.hass, connectable=True)
                   if is_mops(info)]
        return self.async_show_form(step_id="user", errors=errors, data_schema=vol.Schema({
            vol.Required("address"): selector.SelectSelector(selector.SelectSelectorConfig(
                options=options, custom_value=True, mode=selector.SelectSelectorMode.DROPDOWN)),
        }))
