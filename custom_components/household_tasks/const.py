"""Constants for the Household Tasks integration."""

DOMAIN = "household_tasks"

# Stable internal identifiers — never real names. The actual names are
# entered by the user during setup and stored only in their own HA
# config entry (never in this repo).
ASSIGNEE_UNCLAIMED = "unclaimed"
ASSIGNEE_MEMBER1 = "member1"
ASSIGNEE_MEMBER2 = "member2"

CONF_MEMBER1_NAME = "member1_name"
CONF_MEMBER2_NAME = "member2_name"
DEFAULT_MEMBER1_NAME = "Person 1"
DEFAULT_MEMBER2_NAME = "Person 2"

RECURRING_UNITS = ["days", "weeks", "months"]

STORAGE_VERSION = 1

SIGNAL_UPDATE = f"{DOMAIN}_update"

SERVICE_ADD_TASK = "add_task"
SERVICE_CLAIM_TASK = "claim_task"
