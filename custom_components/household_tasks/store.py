"""Shared task storage for the Household Tasks integration.

Tasks are kept as plain dicts backed by Home Assistant's Store helper
(the same JSON-persistence mechanism most core integrations use for
local state). Assignee is stored as a member's stable id, not their
name — ids are generated once (see config_flow.py) and preserved across
renames, so renaming someone in Settings doesn't orphan their existing
tasks. Removing a member entirely does leave any tasks still assigned to
them: they simply stop being counted under a specific person (they fall
back to counting as unclaimed) since their id no longer matches anyone
in the current member list.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store

from .const import ASSIGNEE_UNCLAIMED, SIGNAL_UPDATE, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)


def _interval_days(recurring: dict[str, Any]) -> int:
    unit = recurring["unit"]
    n = recurring["interval"]
    if unit.startswith("month"):
        return n * 30
    if unit.startswith("week"):
        return n * 7
    return n


def _new_task(
    summary: str,
    assignee: str = ASSIGNEE_UNCLAIMED,
    recurring: dict[str, Any] | None = None,
    due: str | None = None,
) -> dict[str, Any]:
    now = datetime.now().isoformat()
    return {
        "uid": uuid.uuid4().hex,
        "summary": summary,
        "status": "needs_action",
        "due": due,
        "assignee": assignee,
        "recurring": recurring,
        "created_at": now,
        "completed_at": None,
    }


class HouseholdTasksStore:
    """In-memory task list backed by HA's Store helper."""

    def __init__(self, hass: HomeAssistant, entry_id: str, members: list[dict[str, str]]) -> None:
        self.hass = hass
        self._store: Store = Store(hass, STORAGE_VERSION, f"household_tasks_{entry_id}")
        self.tasks: list[dict[str, Any]] = []
        # [{"id": "<8 hex chars>", "name": "<whatever was entered>"}, ...]
        # any length, including zero.
        self.members: list[dict[str, str]] = members

    async def async_load(self) -> None:
        data = await self._store.async_load()
        self.tasks = data.get("tasks", []) if data else []

    async def _async_save(self) -> None:
        await self._store.async_save({"tasks": self.tasks})
        async_dispatcher_send(self.hass, SIGNAL_UPDATE)

    # -- name <-> stable id resolution ---------------------------------------

    def resolve_assignee(self, text: str) -> str:
        """Match free text (a configured member's name) to their id."""
        value = (text or "").strip().lower()
        if not value:
            return ASSIGNEE_UNCLAIMED
        for member in self.members:
            if member["name"].strip().lower() == value:
                return member["id"]
        return ASSIGNEE_UNCLAIMED

    def assignee_label(self, assignee_id: str) -> str | None:
        if not assignee_id:
            return None
        for member in self.members:
            if member["id"] == assignee_id:
                return member["name"]
        return None  # id no longer matches any current member

    # -- description text convention (for the stock to-do item dialog) -----

    def parse_description(self, description: str | None) -> tuple[str, dict[str, Any] | None]:
        """Parse 'Assigned:'/'Recurring:' lines out of a free-text description.

        Kept for compatibility with tasks created or edited through the
        stock to-do item dialog, so typing "Assigned: <name>" there keeps
        working exactly like the previous helper-based setup.
        """
        assignee = ASSIGNEE_UNCLAIMED
        recurring: dict[str, Any] | None = None
        if not description:
            return assignee, recurring
        for raw_line in description.splitlines():
            line = raw_line.strip()
            lowered = line.lower()
            if lowered.startswith("assigned:"):
                assignee = self.resolve_assignee(line.split(":", 1)[1])
            elif lowered.startswith("recurring:"):
                value = line.split(":", 1)[1].strip()
                parts = value.split()
                if len(parts) >= 2 and parts[0].isdigit():
                    recurring = {"interval": int(parts[0]), "unit": parts[1].lower()}
        return assignee, recurring

    def build_description(self, assignee: str, recurring: dict[str, Any] | None) -> str:
        """Build the human-readable description shown in the stock to-do card."""
        lines: list[str] = []
        label = self.assignee_label(assignee)
        if label:
            lines.append(f"Assigned: {label}")
        if recurring:
            lines.append(f"Recurring: {recurring['interval']} {recurring['unit']}")
        return "\n".join(lines)

    # -- task CRUD -----------------------------------------------------------

    def get_task(self, uid: str) -> dict[str, Any] | None:
        return next((t for t in self.tasks if t["uid"] == uid), None)

    def find_open_by_summary(self, summary: str) -> dict[str, Any] | None:
        needle = summary.strip().lower()
        matches = [
            t
            for t in self.tasks
            if t["status"] == "needs_action" and t["summary"].strip().lower() == needle
        ]
        return matches[0] if matches else None

    def counts(self) -> dict[str, int]:
        """Open-task counts keyed by 'unclaimed', 'recurring', and each
        current member's id. A task whose stored assignee id doesn't match
        any current member (e.g. that member was since removed) counts as
        unclaimed rather than disappearing silently."""
        open_tasks = [t for t in self.tasks if t["status"] == "needs_action"]
        member_ids = {m["id"] for m in self.members}
        result: dict[str, int] = {"unclaimed": 0, "recurring": 0}
        for member in self.members:
            result[member["id"]] = 0
        for task in open_tasks:
            if task.get("recurring"):
                result["recurring"] += 1
            assignee = task["assignee"]
            if assignee and assignee in member_ids:
                result[assignee] += 1
            else:
                result["unclaimed"] += 1
        return result

    async def async_add_task(
        self,
        summary: str,
        assignee: str = ASSIGNEE_UNCLAIMED,
        recurring: dict[str, Any] | None = None,
        due: str | None = None,
    ) -> dict[str, Any]:
        task = _new_task(summary, assignee, recurring, due)
        self.tasks.append(task)
        await self._async_save()
        return task

    async def async_add_from_item(
        self, summary: str, description: str | None, due: str | None
    ) -> dict[str, Any]:
        """Add a task created via the stock to-do item dialog."""
        assignee, recurring = self.parse_description(description)
        task = _new_task(summary, assignee, recurring, due)
        self.tasks.append(task)
        await self._async_save()
        return task

    async def async_update_task(
        self,
        uid: str,
        summary: str | None = None,
        status: str | None = None,
        description: str | None = None,
        description_given: bool = False,
        due: str | None = None,
    ) -> None:
        task = self.get_task(uid)
        if task is None:
            _LOGGER.warning("Tried to update unknown task uid=%s", uid)
            return

        if summary is not None:
            task["summary"] = summary
        if due is not None:
            task["due"] = due
        if description_given:
            assignee, recurring = self.parse_description(description)
            task["assignee"] = assignee
            task["recurring"] = recurring

        if status is not None and status != task["status"]:
            task["status"] = status
            if status == "completed":
                task["completed_at"] = datetime.now().isoformat()
                if task.get("recurring"):
                    self._renew(task)
            else:
                task["completed_at"] = None

        await self._async_save()

    def _renew(self, completed_task: dict[str, Any]) -> None:
        """Append the next occurrence of a completed recurring task.

        The completed instance is left in place (status=completed) as
        history rather than deleted — the stock to-do card already has a
        toggle to show/hide completed items, so this gives a free
        completion log instead of throwing that information away.
        """
        recurring = completed_task["recurring"]
        next_due = (date.today() + timedelta(days=_interval_days(recurring))).isoformat()
        self.tasks.append(
            _new_task(
                summary=completed_task["summary"],
                assignee=ASSIGNEE_UNCLAIMED,
                recurring=recurring,
                due=next_due,
            )
        )

    async def async_claim_task(self, uid: str, assignee: str) -> None:
        task = self.get_task(uid)
        if task is None:
            return
        task["assignee"] = assignee
        await self._async_save()

    async def async_delete_tasks(self, uids: list[str]) -> None:
        uid_set = set(uids)
        self.tasks = [t for t in self.tasks if t["uid"] not in uid_set]
        await self._async_save()
