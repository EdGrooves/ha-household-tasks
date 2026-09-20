# Household Tasks

A minimal Home Assistant integration for a two-person household task list:
one-time and recurring tasks, assignable to either person or left
unclaimed. Built to replace a text-parsing helper/automation setup with
real structured data, without pulling in features a small household
doesn't need (no meal planning, no external provider sync, no AI images).

Nothing about who lives in the household is stored in this repo — during
setup you're asked for the two members' names, which are saved only in
your own Home Assistant configuration.

## What it gives you

- `todo.household_tasks` — a normal to-do list entity, so every existing
  to-do card, Assist voice command, and automation trigger that works
  with `todo.*` entities works here too.
- `sensor.household_tasks_unclaimed` / `_member1` / `_member2` /
  `_recurring` — live open-task counts, updated instantly whenever a task
  changes (no polling). The two person sensors are labeled with whatever
  names you entered during setup.
- Two services: `household_tasks.add_task` (name, assignee, recurring,
  interval, unit) and `household_tasks.claim_task` (name, assignee) —
  structured input instead of typing `Assigned: <name>` into a text
  field, though that still works too for anyone editing a task directly
  in the stock to-do item dialog.
- Recurring tasks regenerate **immediately** on completion, unclaimed,
  with the next due date — no periodic polling automation involved.

## Install

1. HACS → ⋮ → Custom repositories → add this repo's URL, category
   "Integration"
2. Install "Household Tasks" through HACS
3. Restart Home Assistant
4. Settings → Devices & Services → Add Integration → "Household Tasks"
   — you'll be asked for the two household members' names here
5. Names can be changed later any time via Settings → Devices &
   Services → Household Tasks → Configure, no restart needed

## Task conventions

Assignment and recurrence are stored as real fields internally, but for
compatibility with the stock to-do item editor they're also shown/parsed
as plain text in the item's description, using whichever name you
configured for that person, e.g.:

```
Assigned: Alex
Recurring: 90 days
```

`Recurring:` accepts `days`, `weeks`, or `months` as the unit. Omit the
`Assigned:` line to leave a task unclaimed; omit `Recurring:` for a
one-time task.
