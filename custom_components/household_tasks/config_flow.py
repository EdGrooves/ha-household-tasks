"""Config flow for the Household Tasks integration.

Deliberately asks for the two household members' names here, at setup
time, rather than hardcoding them anywhere in source — the names are
stored only in this config entry's local options (never committed to
the repo this integration ships from). An options flow lets them be
renamed later without reinstalling.
"""
from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    CONF_MEMBER1_NAME,
    CONF_MEMBER2_NAME,
    DEFAULT_MEMBER1_NAME,
    DEFAULT_MEMBER2_NAME,
    DOMAIN,
)


def _names_schema(defaults: dict) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(
                CONF_MEMBER1_NAME,
                default=defaults.get(CONF_MEMBER1_NAME, DEFAULT_MEMBER1_NAME),
            ): str,
            vol.Required(
                CONF_MEMBER2_NAME,
                default=defaults.get(CONF_MEMBER2_NAME, DEFAULT_MEMBER2_NAME),
            ): str,
        }
    )


class HouseholdTasksConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Household Tasks. Single instance."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title="Household Tasks", data={}, options=user_input)

        return self.async_show_form(step_id="user", data_schema=_names_schema({}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return HouseholdTasksOptionsFlow()


class HouseholdTasksOptionsFlow(config_entries.OptionsFlow):
    """Rename the two household members later without reinstalling."""

    async def async_step_init(self, user_input: dict | None = None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init", data_schema=_names_schema(dict(self.config_entry.options))
        )
