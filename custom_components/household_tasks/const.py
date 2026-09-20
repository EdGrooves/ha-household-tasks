"""Constants for the Household Tasks integration."""

DOMAIN = "household_tasks"

ASSIGNEE_UNCLAIMED = "unclaimed"
ASSIGNEE_CHRISTINE = "christine"
ASSIGNEE_EDUARD = "eduard"
ASSIGNEES = [ASSIGNEE_UNCLAIMED, ASSIGNEE_CHRISTINE, ASSIGNEE_EDUARD]

ASSIGNEE_DESCRIPTION_LABELS = {
    ASSIGNEE_CHRISTINE: "Christine",
    ASSIGNEE_EDUARD: "Eduard",
}

RECURRING_UNITS = ["days", "weeks", "months"]

STORAGE_VERSION = 1

SIGNAL_UPDATE = f"{DOMAIN}_update"

SERVICE_ADD_TASK = "add_task"
SERVICE_CLAIM_TASK = "claim_task"
