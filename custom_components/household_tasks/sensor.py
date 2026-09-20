"""Sensor platform for the Household Tasks integration.

Exposes 4 live open-task-count sensors (unclaimed / per-person /
recurring). The two person sensors' display names come from whatever
names were entered in the config flow (never hardcoded here) — if that
options is later changed, the integration reloads and these are
recreated with the new label automatically.
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
    specs = [
        ("unclaimed", "Household Tasks Unclaimed", "mdi:help-circle-outline"),
        ("member1", f"Household Tasks {store.member_names['member1']}", "mdi:account"),
        ("member2", f"Household Tasks {store.member_names['member2']}", "mdi:account"),
        ("recurring", "Household Tasks Recurring", "mdi:repeat"),
    ]
    async_add_entities(
        HouseholdTasksCountSensor(store, entry, key, name, icon) for key, name, icon in specs
    )


class HouseholdTasksCountSensor(SensorEntity):
    """A live count of open tasks matching one bucket (assignee/recurring)."""

    _attr_native_unit_of_measurement = "tasks"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(
        self, store: HouseholdTasksStore, entry: ConfigEntry, key: str, name: str, icon: str
    ) -> None:
        self._store = store
        self._key = key
        self._attr_name = name
        self._attr_icon = icon
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
        self._attr_native_value = self._store.counts()[self._key]
