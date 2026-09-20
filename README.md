# ha-household-tasks

A minimal Home Assistant integration for a household task list: one-time
and recurring tasks, assignable to any number of household members or
left unclaimed. Built to replace a text-parsing helper/automation setup
with real structured data, without pulling in features a small household
doesn't need (no meal planning, no external provider sync, no AI images).

Nothing about who's in the household is stored in this repo. During
setup (and any time after, via Settings) you enter a comma-separated
list of names — add, rename, or remove people whenever, no fixed count —
and that list is saved only in your own Home Assistant configuration.

## What it gives you

- `todo.household_tasks` — a normal to-do list entity, so every existing
  to-do card, Assist voice command, and automation trigger that works
  with `todo.*` entities works here too.
- One `sensor.household_tasks_*` per configured member, plus
  `sensor.household_tasks_unclaimed` and `_recurring` — live open-task
  counts, updated instantly whenever a task changes (no polling). The
  set of member sensors matches your current member list automatically.
- Two services: `household_tasks.add_task` (name, assignee, recurring,
  interval, unit) and `household_tasks.claim_task` (name, assignee) —
  structured input instead of typing `Assigned: <name>` into a text
  field, though that still works too for anyone editing a task directly
  in the stock to-do item dialog.
- Recurring tasks regenerate **immediately** on completion, unclaimed,
  with the next due date — no periodic polling automation involved.
- A custom Lovelace card (`custom:household-tasks-card`) with real
  per-task chips — a colored assignee badge and a recurring badge on
  each row, not just in a separate summary — plus an inline add-task
  row. Registers itself automatically (no manual "add resource" step);
  just add a card with `type: custom:household-tasks-card` and
  `entity: todo.household_tasks` to any dashboard. The stock `todo-list`
  card still works too if you'd rather use that instead.

## Install

1. HACS → ⋮ → Custom repositories → add this repo's URL, category
   "Integration"
2. Install "Household Tasks" through HACS
3. Restart Home Assistant
4. Settings → Devices & Services → Add Integration → "Household Tasks"
   — enter household members' names here, comma-separated (or leave
   blank and add them later)
5. Change the member list any time via Settings → Devices & Services →
   Household Tasks → **Configure** — no restart needed, and renaming
   someone keeps their existing tasks and sensor rather than starting
   fresh

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
