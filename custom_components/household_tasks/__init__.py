"""The Household Tasks integration."""
from __future__ import annotations

import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import (
    CONF_MEMBERS,
    DOMAIN,
    RECURRING_UNITS,
    SERVICE_ADD_TASK,
    SERVICE_CLAIM_TASK,
)
from .store import HouseholdTasksStore

PLATFORMS = ["todo", "sensor"]

CARD_URL_PATH = "/household_tasks_static/household-tasks-card.js"

ADD_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Optional("assignee", default=""): cv.string,
        vol.Optional("recurring", default=False): cv.boolean,
        vol.Optional("interval", default=1): vol.Coerce(int),
        vol.Optional("unit", default="days"): vol.In(RECURRING_UNITS),
    }
)

CLAIM_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Required("assignee"): cv.string,
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Household Tasks from a config entry."""
    members = entry.options.get(CONF_MEMBERS, [])
    store = HouseholdTasksStore(hass, entry.entry_id, members)
    await store.async_load()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = store

    # Serve the custom card's JS and auto-inject it into every dashboard
    # load, so it's usable without the user manually adding a Lovelace
    # resource. add_extra_js_url is idempotent per URL, so re-running
    # this on entry reload (e.g. after a member rename) is harmless.
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                CARD_URL_PATH,
                hass.config.path(
                    "custom_components/household_tasks/www/household-tasks-card.js"
                ),
                cache_headers=False,
            )
        ]
    )
    add_extra_js_url(hass, CARD_URL_PATH)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Adding/renaming/removing members (via the options flow) reloads the
    # entry, which re-reads entry.options and rebuilds the sensors/store
    # to match — no restart needed to change the member list.
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    async def _handle_add_task(call: ServiceCall) -> None:
        recurring = None
        if call.data["recurring"]:
            recurring = {"interval": call.data["interval"], "unit": call.data["unit"]}
        await store.async_add_task(
            summary=call.data["name"],
            assignee=store.resolve_assignee(call.data["assignee"]),
            recurring=recurring,
        )

    async def _handle_claim_task(call: ServiceCall) -> None:
        task = store.find_open_by_summary(call.data["name"])
        if task is None:
            return
        await store.async_claim_task(task["uid"], store.resolve_assignee(call.data["assignee"]))

    hass.services.async_register(
        DOMAIN, SERVICE_ADD_TASK, _handle_add_task, schema=ADD_TASK_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_CLAIM_TASK, _handle_claim_task, schema=CLAIM_TASK_SCHEMA
    )

    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        hass.services.async_remove(DOMAIN, SERVICE_ADD_TASK)
        hass.services.async_remove(DOMAIN, SERVICE_CLAIM_TASK)
    return unload_ok
