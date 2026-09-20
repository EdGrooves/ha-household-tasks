"""Todo platform for the Household Tasks integration."""
from __future__ import annotations

from datetime import date

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL_UPDATE
from .store import HouseholdTasksStore


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the Household Tasks todo entity."""
    store: HouseholdTasksStore = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([HouseholdTasksTodoListEntity(store, entry)])


class HouseholdTasksTodoListEntity(TodoListEntity):
    """A to-do list backed by HouseholdTasksStore.

    Entity id lands on `todo.household_tasks` (same id the previous
    Local To-do based setup used) so existing dashboard cards keep
    working without any changes. The description shown in the stock
    to-do item dialog is synthesized from the structured assignee/
    recurring fields on read, and re-parsed from the same convention on
    write, so tapping an item and typing "Assigned: <name>" keeps
    working exactly like before.
    """

    _attr_name = "Household Tasks"
    _attr_icon = "mdi:clipboard-check"
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )
    # The 'tasks'/'members' attributes change on every task edit and are
    # only meant for the custom card to read live — not worth recording
    # a full history snapshot of on every write.
    _unrecorded_attributes = frozenset({"tasks", "members"})

    def __init__(self, store: HouseholdTasksStore, entry: ConfigEntry) -> None:
        self._store = store
        self._attr_unique_id = f"{entry.entry_id}_household_tasks"

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
        items = []
        for task in self._store.tasks:
            due = date.fromisoformat(task["due"]) if task.get("due") else None
            items.append(
                TodoItem(
                    uid=task["uid"],
                    summary=task["summary"],
                    status=(
                        TodoItemStatus.COMPLETED
                        if task["status"] == "completed"
                        else TodoItemStatus.NEEDS_ACTION
                    ),
                    due=due,
                    description=self._store.build_description(
                        task["assignee"], task.get("recurring")
                    ),
                )
            )
        self._attr_todo_items = items

    async def async_create_todo_item(self, item: TodoItem) -> None:
        due = item.due.isoformat() if item.due else None
        await self._store.async_add_from_item(
            summary=item.summary or "", description=item.description, due=due
        )
        self._refresh()
        self.async_write_ha_state()

    async def async_update_todo_item(self, item: TodoItem) -> None:
        due = item.due.isoformat() if item.due else None
        # item.status is usually a TodoItemStatus (a str subclass), but at
        # least one HA version's internal update path passes a plain str
        # here instead — str() is safe for both since TodoItemStatus's
        # string value is what we want either way.
        status = str(item.status) if item.status is not None else None
        await self._store.async_update_task(
            uid=item.uid,
            summary=item.summary,
            status=status,
            description=item.description,
            description_given=item.description is not None,
            due=due,
        )
        self._refresh()
        self.async_write_ha_state()

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        await self._store.async_delete_tasks(uids)
        self._refresh()
        self.async_write_ha_state()

    @property
    def extra_state_attributes(self) -> dict:
        """Full structured task data for the custom card.

        The stock to-do card only ever sees the synthesized description
        text (via _refresh/todo_items above); this attribute is the real
        per-field data — assignee id/name, recurring interval/unit — that
        household-tasks-card.js reads directly from hass.states instead.
        """
        return {
            "tasks": [
                {
                    "uid": task["uid"],
                    "summary": task["summary"],
                    "status": task["status"],
                    "due": task.get("due"),
                    "assignee": task["assignee"],
                    "assignee_name": self._store.assignee_label(task["assignee"]),
                    "recurring": task.get("recurring"),
                    "completed_at": task.get("completed_at"),
                }
                for task in self._store.tasks
            ],
            "members": self._store.members,
        }
