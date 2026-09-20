"""Config flow for the Household Tasks integration.

Household members are entered as a plain comma-separated list — add or
remove as many as you like, any time, via Settings -> Devices &
Services -> Household Tasks -> Configure. Nothing about who's in the
household is hardcoded anywhere in this integration's source; names
live only in this config entry's local options.

Each member gets a short stable id the first time they're seen. Editing
the list later reconciles by name (case-insensitively) against the
previous list, so renaming "Alex" to "Alexandra" keeps the same id (and
therefore keeps their existing task assignments and sensor entity)
rather than creating a brand new person.
"""
from __future__ import annotations

import uuid

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import CONF_MEMBERS, DOMAIN


def _parse_members(text: str, existing: list[dict[str, str]]) -> list[dict[str, str]]:
    existing_ids_by_name = {m["name"].strip().lower(): m["id"] for m in existing}
    seen: set[str] = set()
    members: list[dict[str, str]] = []
    for raw_name in text.split(","):
        name = raw_name.strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        member_id = existing_ids_by_name.get(key, uuid.uuid4().hex[:8])
        members.append({"id": member_id, "name": name})
    return members


def _members_schema(existing: list[dict[str, str]]) -> vol.Schema:
    default_text = ", ".join(m["name"] for m in existing)
    return vol.Schema({vol.Optional(CONF_MEMBERS, default=default_text): str})


class HouseholdTasksConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Household Tasks. Single instance."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            members = _parse_members(user_input[CONF_MEMBERS], [])
            return self.async_create_entry(
                title="Household Tasks", data={}, options={CONF_MEMBERS: members}
            )

        return self.async_show_form(step_id="user", data_schema=_members_schema([]))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return HouseholdTasksOptionsFlow()


class HouseholdTasksOptionsFlow(config_entries.OptionsFlow):
    """Add, rename, or remove household members later, any time."""

    async def async_step_init(self, user_input: dict | None = None):
        existing = self.config_entry.options.get(CONF_MEMBERS, [])

        if user_input is not None:
            members = _parse_members(user_input[CONF_MEMBERS], existing)
            return self.async_create_entry(title="", data={CONF_MEMBERS: members})

        return self.async_show_form(step_id="init", data_schema=_members_schema(existing))
