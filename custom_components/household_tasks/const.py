"""Constants for the Household Tasks integration."""

DOMAIN = "household_tasks"

# Empty string = unclaimed. Any other assignee value is a member's
# stable id (see store.py) — never a name directly, and never hardcoded
# here; members are entered ad hoc through the config/options flow and
# stored only in the local config entry.
ASSIGNEE_UNCLAIMED = ""

CONF_MEMBERS = "members"  # list[{"id": str, "name": str}] in entry.options

RECURRING_UNITS = ["days", "weeks", "months"]

STORAGE_VERSION = 1

SIGNAL_UPDATE = f"{DOMAIN}_update"

SERVICE_ADD_TASK = "add_task"
SERVICE_CLAIM_TASK = "claim_task"
