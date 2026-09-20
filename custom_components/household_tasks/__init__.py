"""The Household Tasks integration."""
from __future__ import annotations

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import (
    ASSIGNEE_UNCLAIMED,
    ASSIGNEES,
    DOMAIN,
    RECURRING_UNITS,
    SERVICE_ADD_TASK,
    SERVICE_CLAIM_TASK,
)
from .store import HouseholdTasksStore

PLATFORMS = ["todo", "sensor"]

ADD_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Optional("assignee", default=ASSIGNEE_UNCLAIMED): vol.In(ASSIGNEES),
        vol.Optional("recurring", default=False): cv.boolean,
        vol.Optional("interval", default=1): vol.Coerce(int),
        vol.Optional("unit", default="days"): vol.In(RECURRING_UNITS),
    }
)

CLAIM_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Required("assignee"): vol.In(ASSIGNEES),
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Household Tasks from a config entry."""
    store = HouseholdTasksStore(hass, entry.entry_id)
    await store.async_load()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = store

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def _handle_add_task(call: ServiceCall) -> None:
        recurring = None
        if call.data["recurring"]:
            recurring = {"interval": call.data["interval"], "unit": call.data["unit"]}
        await store.async_add_task(
            summary=call.data["name"],
            assignee=call.data["assignee"],
            recurring=recurring,
        )

    async def _handle_claim_task(call: ServiceCall) -> None:
        task = store.find_open_by_summary(call.data["name"])
        if task is None:
            return
        await store.async_claim_task(task["uid"], call.data["assignee"])

    hass.services.async_register(
        DOMAIN, SERVICE_ADD_TASK, _handle_add_task, schema=ADD_TASK_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_CLAIM_TASK, _handle_claim_task, schema=CLAIM_TASK_SCHEMA
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        hass.services.async_remove(DOMAIN, SERVICE_ADD_TASK)
        hass.services.async_remove(DOMAIN, SERVICE_CLAIM_TASK)
    return unload_ok
