"""Sensor platform for the Household Tasks integration.

Exposes one live open-task-count sensor per current household member,
plus "unclaimed" and "recurring" — the number of member sensors is
whatever's currently configured (zero, two, five, however many), not a
fixed count. Adding/renaming/removing a member reloads the config entry
(see __init__.py's update listener), which tears down and recreates
these sensors to match, so this file never hardcodes who's in the
household.
"""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL_UPDATE
from .store import HouseholdTasksStore


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the Household Tasks count sensors."""
    store: HouseholdTasksStore = hass.data[DOMAIN][entry.entry_id]

    entities = [
        HouseholdTasksCountSensor(
            store, entry, "unclaimed", "Household Tasks Unclaimed", "mdi:help-circle-outline"
        ),
        HouseholdTasksCountSensor(
            store, entry, "recurring", "Household Tasks Recurring", "mdi:repeat"
        ),
    ]
    for member in store.members:
        entities.append(
            HouseholdTasksCountSensor(
                store, entry, member["id"], f"Household Tasks {member['name']}", "mdi:account"
            )
        )
    async_add_entities(entities)


class HouseholdTasksCountSensor(SensorEntity):
    """A live count of open tasks matching one bucket (member/unclaimed/recurring)."""

    _attr_native_unit_of_measurement = "tasks"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(
        self, store: HouseholdTasksStore, entry: ConfigEntry, key: str, name: str, icon: str
    ) -> None:
        self._store = store
        self._key = key
        self._attr_name = name
        self._attr_icon = icon
        # Keyed by member id (stable across renames), or the literal
        # "unclaimed"/"recurring" — never a name, so entity_id doesn't
        # change if someone's renamed later.
        self._attr_unique_id = f"{entry.entry_id}_count_{key}"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self._refresh()
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATE, self._handle_update)
        )

    @callback
    def _handle_update(self) -> None:
        self._refresh()
        self.async_write_ha_state()

    def _refresh(self) -> None:
        self._attr_native_value = self._store.counts().get(self._key, 0)
