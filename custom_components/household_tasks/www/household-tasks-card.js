/**
 * Household Tasks card — plain vanilla JS custom element, no framework
 * or CDN dependency. Reads the full structured task list straight off
 * the entity's extra_state_attributes (tasks/members) rather than the
 * plain-text description the stock to-do card is limited to, so it can
 * render a real per-task recurring badge and a real per-task assignee
 * chip instead of a separate summary strip.
 *
 * Every write action (complete/claim/add/delete) goes through Home
 * Assistant's native todo.* services with the description built
 * client-side using the same "Assigned: <name>" / "Recurring: <n>
 * <unit>" convention the backend (store.py) already parses — so every
 * action here is uid-precise and needs no custom backend API.
 */
class HouseholdTasksCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("household-tasks-card: you must set 'entity' (e.g. todo.household_tasks)");
    }
    this._config = config;
    this._draft = { name: "", recurring: false, interval: 7, unit: "days", assignee: "" };

    if (!this._built) {
      this.innerHTML = `
        <ha-card>
          <style>
            .ht-wrap { padding: 12px 16px 16px; }
            .ht-summary { font-size: 0.85em; opacity: 0.7; margin-bottom: 10px; }
            .ht-empty { opacity: 0.6; padding: 8px 0; font-style: italic; }
            .ht-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
            .ht-row:last-child { border-bottom: none; }
            .ht-summary-text { flex: 1; }
            .ht-chip { border-radius: 12px; padding: 2px 9px; font-size: 0.78em; white-space: nowrap; cursor: default; }
            .ht-chip-recurring { background: var(--label-badge-blue, #e1ecff); color: var(--primary-text-color); }
            .ht-chip-assigned { background: var(--label-badge-green, #dff3e3); color: var(--primary-text-color); cursor: pointer; }
            .ht-chip-unclaimed { background: var(--label-badge-grey, #eee); color: var(--secondary-text-color); cursor: pointer; }
            .ht-delete { cursor: pointer; opacity: 0.5; padding: 0 4px; }
            .ht-delete:hover { opacity: 1; }
            .ht-add-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; align-items: center; }
            .ht-add-name { flex: 1 1 140px; min-width: 100px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color); color: var(--primary-text-color); }
            .ht-add-row select, .ht-add-row input[type="number"] { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color); color: var(--primary-text-color); }
            .ht-add-row input[type="number"] { width: 60px; }
            .ht-add-recurring { display: flex; align-items: center; gap: 4px; font-size: 0.85em; }
            .ht-add-submit { padding: 6px 14px; border-radius: 6px; border: none; background: var(--primary-color); color: var(--text-primary-color, #fff); cursor: pointer; }
          </style>
          <div class="card-content ht-wrap"></div>
        </ha-card>
      `;
      this._content = this.querySelector(".ht-wrap");
      this._built = true;
    }
    this._render();
  }

  set hass(hass) {
    // hass is re-set on every dashboard update cycle, for every card,
    // regardless of whether *this* entity changed — re-rendering
    // unconditionally would blow away whatever's being typed into the
    // add-task name field (innerHTML replacement drops focus/cursor).
    // Only actually re-render when our entity's state object reference
    // has changed, which HA guarantees stays the same when that entity
    // is untouched by a given update.
    const oldState = this._hass && this._config ? this._hass.states[this._config.entity] : undefined;
    this._hass = hass;
    const newState = this._config ? hass.states[this._config.entity] : undefined;
    if (newState !== oldState) {
      this._render();
    }
  }

  getCardSize() {
    return 4;
  }

  static getStubConfig() {
    return { entity: "todo.household_tasks" };
  }

  _entityState() {
    if (!this._hass || !this._config) return undefined;
    return this._hass.states[this._config.entity];
  }

  _escape(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  _buildDescription(assigneeName, recurring) {
    const lines = [];
    if (assigneeName) lines.push(`Assigned: ${assigneeName}`);
    if (recurring) lines.push(`Recurring: ${recurring.interval} ${recurring.unit}`);
    return lines.join("\n");
  }

  _callService(domain, service, data) {
    this._hass.callService(domain, service, data);
  }

  _completeTask(uid) {
    this._callService("todo", "update_item", {
      entity_id: this._config.entity,
      item: uid,
      status: "completed",
    });
  }

  _deleteTask(uid) {
    this._callService("todo", "remove_item", {
      entity_id: this._config.entity,
      item: uid,
    });
  }

  _cycleAssignee(task, members) {
    const ids = ["", ...members.map((m) => m.id)];
    const namesById = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const currentIndex = ids.indexOf(task.assignee || "");
    const nextId = ids[(currentIndex + 1) % ids.length];
    const description = this._buildDescription(nextId ? namesById[nextId] : "", task.recurring);
    this._callService("todo", "update_item", {
      entity_id: this._config.entity,
      item: task.uid,
      description,
    });
  }

  _submitAdd() {
    const name = (this._draft.name || "").trim();
    if (!name) return;
    const recurring = this._draft.recurring
      ? { interval: this._draft.interval, unit: this._draft.unit }
      : null;
    const description = this._buildDescription(this._draft.assignee, recurring);
    this._callService("todo", "add_item", {
      entity_id: this._config.entity,
      item: name,
      description,
    });
    this._draft = {
      name: "",
      recurring: false,
      interval: this._draft.interval,
      unit: this._draft.unit,
      assignee: "",
    };
    this._render();
  }

  _render() {
    if (!this._content) return;
    const state = this._entityState();
    if (!state) {
      this._content.innerHTML = `<div class="ht-empty">Entity not found: ${this._escape(
        this._config.entity
      )}</div>`;
      return;
    }

    const allTasks = state.attributes.tasks || [];
    const members = state.attributes.members || [];
    const namesById = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const openTasks = allTasks.filter((t) => t.status !== "completed");

    const counts = { unclaimed: 0, recurring: 0 };
    members.forEach((m) => (counts[m.id] = 0));
    openTasks.forEach((t) => {
      if (t.recurring) counts.recurring += 1;
      if (t.assignee && Object.prototype.hasOwnProperty.call(counts, t.assignee)) {
        counts[t.assignee] += 1;
      } else {
        counts.unclaimed += 1;
      }
    });
    const summaryParts = [`${counts.unclaimed} unclaimed`];
    members.forEach((m) => summaryParts.push(`${this._escape(m.name)}: ${counts[m.id]}`));
    summaryParts.push(`${counts.recurring} recurring`);

    const rowsHtml = openTasks.length
      ? openTasks
          .map((t) => {
            const label = t.assignee && namesById[t.assignee] ? namesById[t.assignee] : "Unclaimed";
            const chipClass = t.assignee ? "ht-chip ht-chip-assigned" : "ht-chip ht-chip-unclaimed";
            const recurringChip = t.recurring
              ? `<span class="ht-chip ht-chip-recurring">🔁 ${t.recurring.interval}${this._escape(
                  t.recurring.unit[0]
                )}</span>`
              : "";
            return `
              <div class="ht-row">
                <input type="checkbox" class="ht-check" data-uid="${this._escape(t.uid)}">
                <span class="ht-summary-text">${this._escape(t.summary)}</span>
                ${recurringChip}
                <span class="${chipClass}" data-uid="${this._escape(t.uid)}" data-action="cycle">${this._escape(
              label
            )}</span>
                <span class="ht-delete" data-uid="${this._escape(t.uid)}" data-action="delete">✕</span>
              </div>
            `;
          })
          .join("")
      : `<div class="ht-empty">No open tasks</div>`;

    const assigneeOptions =
      `<option value="" ${this._draft.assignee === "" ? "selected" : ""}>Unclaimed</option>` +
      members
        .map(
          (m) =>
            `<option value="${this._escape(m.name)}" ${
              this._draft.assignee === m.name ? "selected" : ""
            }>${this._escape(m.name)}</option>`
        )
        .join("");

    const unitOptions = ["days", "weeks", "months"]
      .map((u) => `<option value="${u}" ${this._draft.unit === u ? "selected" : ""}>${u}</option>`)
      .join("");

    this._content.innerHTML = `
      <div class="ht-summary">${summaryParts.join(" · ")}</div>
      <div class="ht-list">${rowsHtml}</div>
      <div class="ht-add-row">
        <input type="text" class="ht-add-name" placeholder="New task" value="${this._escape(
          this._draft.name
        )}">
        <label class="ht-add-recurring">
          <input type="checkbox" class="ht-add-recurring-check" ${this._draft.recurring ? "checked" : ""}>
          Recurring
        </label>
        <input type="number" class="ht-add-interval" min="1" value="${this._draft.interval}"
          style="${this._draft.recurring ? "" : "display:none"}">
        <select class="ht-add-unit" style="${this._draft.recurring ? "" : "display:none"}">${unitOptions}</select>
        <select class="ht-add-assignee">${assigneeOptions}</select>
        <button class="ht-add-submit">Add</button>
      </div>
    `;

    this._wireEvents(openTasks, members);
  }

  _wireEvents(openTasks, members) {
    this._content.querySelectorAll(".ht-check").forEach((el) => {
      el.addEventListener("change", (e) => this._completeTask(e.currentTarget.getAttribute("data-uid")));
    });

    this._content.querySelectorAll('[data-action="cycle"]').forEach((el) => {
      el.addEventListener("click", (e) => {
        const uid = e.currentTarget.getAttribute("data-uid");
        const task = openTasks.find((t) => t.uid === uid);
        if (task) this._cycleAssignee(task, members);
      });
    });

    this._content.querySelectorAll('[data-action="delete"]').forEach((el) => {
      el.addEventListener("click", (e) => this._deleteTask(e.currentTarget.getAttribute("data-uid")));
    });

    const nameInput = this._content.querySelector(".ht-add-name");
    if (nameInput) {
      nameInput.addEventListener("input", (e) => {
        this._draft.name = e.target.value;
      });
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this._submitAdd();
      });
    }

    const recurringCheck = this._content.querySelector(".ht-add-recurring-check");
    if (recurringCheck) {
      recurringCheck.addEventListener("change", (e) => {
        this._draft.recurring = e.target.checked;
        this._render();
      });
    }

    const intervalInput = this._content.querySelector(".ht-add-interval");
    if (intervalInput) {
      intervalInput.addEventListener("input", (e) => {
        this._draft.interval = parseInt(e.target.value, 10) || 1;
      });
    }

    const unitSelect = this._content.querySelector(".ht-add-unit");
    if (unitSelect) {
      unitSelect.addEventListener("change", (e) => {
        this._draft.unit = e.target.value;
      });
    }

    const assigneeSelect = this._content.querySelector(".ht-add-assignee");
    if (assigneeSelect) {
      assigneeSelect.addEventListener("change", (e) => {
        this._draft.assignee = e.target.value;
      });
    }

    const submitBtn = this._content.querySelector(".ht-add-submit");
    if (submitBtn) {
      submitBtn.addEventListener("click", () => this._submitAdd());
    }
  }
}

customElements.define("household-tasks-card", HouseholdTasksCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "household-tasks-card",
  name: "Household Tasks",
  description: "Task list with real per-item assignee and recurring chips.",
});
