/**
 * Household Tasks card — plain vanilla JS custom element, no framework
 * or CDN dependency. Kanban-style board: one column per household
 * member (plus Unclaimed and Done), each holding cards for that
 * person's tasks. Reads the full structured task list straight off the
 * entity's extra_state_attributes (tasks/members) rather than the
 * plain-text description the stock to-do card is limited to.
 *
 * Moving a card between columns (tap the ⇄ icon and pick a target, or
 * drag it on desktop) re-assigns the task; dropping/moving into Done
 * completes it, moving out of Done reopens it. Every write goes through
 * Home Assistant's native todo.* services with the description built
 * client-side using the same "Assigned: <name>" / "Recurring: <n>
 * <unit>" convention the backend (store.py) already parses — so every
 * action is uid-precise and needs no custom backend API.
 *
 * Tap-to-move is the primary interaction (works on touch, which most
 * dashboard usage is), with native HTML5 drag-and-drop layered on top
 * as a bonus for desktop/mouse — since drag-and-drop can't be tested
 * from this environment, it must not be the only way to move a card.
 */

const HT_PALETTE = [
  "#5b8def", "#e2653c", "#3cb17d", "#c05bd0",
  "#e0507a", "#2bb5c9", "#c9973c", "#6a6fd6",
];

function htColorForId(id) {
  let hash = 0;
  const str = String(id || "");
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return HT_PALETTE[hash % HT_PALETTE.length];
}

function htRelativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return `${Math.round(diffDay / 30)}mo ago`;
}

const HT_STYLE = `
  .ht-wrap { padding: 10px 14px 16px; }
  .ht-board { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
  .ht-column {
    flex: 1 1 190px; min-width: 180px; max-width: 260px;
    background: var(--secondary-background-color, rgba(127,127,127,0.07));
    border-radius: 12px; padding: 9px; display: flex; flex-direction: column;
    transition: outline 0.1s ease;
  }
  .ht-column.ht-drop-hover { outline: 2px dashed var(--primary-color); outline-offset: -3px; }
  .ht-column-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-weight: 600; font-size: 0.86em; padding: 0 2px; }
  .ht-column-count {
    margin-left: auto; font-size: 0.76em; font-weight: 500; color: var(--secondary-text-color);
    background: var(--card-background-color); border-radius: 999px; padding: 1px 8px;
  }
  .ht-column-body { display: flex; flex-direction: column; gap: 7px; min-height: 34px; }
  .ht-avatar {
    width: 17px; height: 17px; border-radius: 50%; display: inline-flex; flex-shrink: 0;
    align-items: center; justify-content: center; font-size: 0.68em; font-weight: 700; color: #fff;
  }
  .ht-empty-col { opacity: 0.5; font-size: 0.8em; font-style: italic; padding: 4px 2px; }
  .ht-card {
    background: var(--card-background-color); border-radius: 10px; padding: 8px 9px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.09); cursor: grab;
  }
  .ht-card.ht-dragging { opacity: 0.35; }
  .ht-card-top { display: flex; align-items: flex-start; gap: 6px; }
  .ht-check { width: 18px; height: 18px; accent-color: var(--primary-color); cursor: pointer; flex-shrink: 0; margin-top: 1px; }
  .ht-card-title { flex: 1; font-size: 0.91em; line-height: 1.32; word-break: break-word; }
  .ht-card-done .ht-card-title { text-decoration: line-through; opacity: 0.6; }
  .ht-card-actions { display: flex; gap: 1px; flex-shrink: 0; }
  .ht-icon-btn {
    cursor: pointer; opacity: 0.4; font-size: 0.82em; padding: 2px 4px; border-radius: 5px; flex-shrink: 0;
  }
  .ht-icon-btn:hover { opacity: 1; background: var(--secondary-background-color); }
  .ht-card-meta { display: flex; gap: 7px; margin-top: 5px; padding-left: 24px; flex-wrap: wrap; font-size: 0.74em; color: var(--secondary-text-color); }
  .ht-move-menu { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; padding-top: 7px; border-top: 1px dashed var(--divider-color, rgba(127,127,127,0.25)); }
  .ht-move-target {
    font-size: 0.72em; padding: 3px 9px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--divider-color, #ccc); background: var(--secondary-background-color, transparent);
    display: inline-flex; align-items: center; gap: 4px;
  }
  .ht-move-target:hover { filter: brightness(0.95); border-color: var(--primary-color); }

  .ht-add { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--divider-color, rgba(127,127,127,0.16)); }
  .ht-add-main { display: flex; gap: 8px; align-items: center; }
  .ht-add-name {
    flex: 1; min-width: 0; padding: 8px 12px; border-radius: 999px;
    border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color);
    color: var(--primary-text-color); font-size: 0.94em;
  }
  .ht-add-name:focus { outline: none; border-color: var(--primary-color); }
  .ht-add-submit {
    width: 34px; height: 34px; border-radius: 50%; border: none; flex-shrink: 0;
    background: var(--primary-color); color: var(--text-primary-color, #fff);
    font-size: 1.1em; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .ht-add-submit:hover { filter: brightness(1.08); }
  .ht-add-options { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 8px; font-size: 0.85em; color: var(--secondary-text-color); }
  .ht-add-recurring { display: flex; align-items: center; gap: 5px; cursor: pointer; }
  .ht-add-recurring input { accent-color: var(--primary-color); cursor: pointer; }
  .ht-add-options select, .ht-add-options input[type="number"] {
    padding: 4px 8px; border-radius: 6px; border: 1px solid var(--divider-color, #ccc);
    background: var(--card-background-color); color: var(--primary-text-color); font-size: 0.95em;
  }
  .ht-add-options input[type="number"] { width: 52px; }
`;

class HouseholdTasksCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("household-tasks-card: you must set 'entity' (e.g. todo.household_tasks)");
    }
    this._config = config;
    this._draft = { name: "", recurring: false, interval: 7, unit: "days", assignee: "" };
    this._openMoveMenuUid = null;

    if (!this._built) {
      this.innerHTML = `
        <ha-card>
          <style>${HT_STYLE}</style>
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
    const oldState = this._hass && this._config ? this._hass.states[this._config.entity] : undefined;
    this._hass = hass;
    const newState = this._config ? hass.states[this._config.entity] : undefined;
    if (newState !== oldState) {
      this._render();
    }
  }

  getCardSize() {
    return 6;
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

  _reopenTask(task, members) {
    const namesById = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const description = this._buildDescription(
      task.assignee ? namesById[task.assignee] : "",
      task.recurring
    );
    this._callService("todo", "update_item", {
      entity_id: this._config.entity,
      item: task.uid,
      status: "needs_action",
      description,
    });
  }

  _deleteTask(uid) {
    this._callService("todo", "remove_item", {
      entity_id: this._config.entity,
      item: uid,
    });
  }

  /** Move a task to a different column: "" = Unclaimed, a member id, or "__done__". */
  _moveTask(task, targetKey, members) {
    if (targetKey === "__done__") {
      this._completeTask(task.uid);
      return;
    }
    const namesById = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const description = this._buildDescription(targetKey ? namesById[targetKey] : "", task.recurring);
    const data = { entity_id: this._config.entity, item: task.uid, description };
    if (task.status === "completed") data.status = "needs_action";
    this._callService("todo", "update_item", data);
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

  _moveMenuHtml(task, currentColKey) {
    const targets = this._columns.filter((c) => c.key !== currentColKey);
    return `
      <div class="ht-move-menu">
        ${targets
          .map(
            (c) => `
          <span class="ht-move-target" data-action="move" data-uid="${this._escape(
            task.uid
          )}" data-target="${this._escape(c.key)}">${c.icon ? c.icon : ""} ${this._escape(c.name)}</span>
        `
          )
          .join("")}
      </div>
    `;
  }

  _cardHtml(task, col) {
    const done = task.status === "completed";
    const actionControl = done
      ? `<span class="ht-icon-btn" data-action="reopen" data-uid="${this._escape(task.uid)}" title="Reopen">↺</span>`
      : `<input type="checkbox" class="ht-check" data-uid="${this._escape(task.uid)}">`;
    const recurringBadge = task.recurring
      ? `<span>🔁 ${task.recurring.interval}${this._escape(task.recurring.unit[0])}</span>`
      : "";
    const timeBadge = done ? `<span>${this._escape(htRelativeTime(task.completed_at))}</span>` : "";
    const metaHtml =
      recurringBadge || timeBadge ? `<div class="ht-card-meta">${recurringBadge}${timeBadge}</div>` : "";
    const menuHtml = this._openMoveMenuUid === task.uid ? this._moveMenuHtml(task, col.key) : "";

    return `
      <div class="ht-card ${done ? "ht-card-done" : ""}" draggable="true" data-uid="${this._escape(task.uid)}">
        <div class="ht-card-top">
          ${actionControl}
          <span class="ht-card-title">${this._escape(task.summary)}</span>
          <span class="ht-card-actions">
            <span class="ht-icon-btn" data-action="toggle-move" data-uid="${this._escape(task.uid)}" title="Move">⇄</span>
            <span class="ht-icon-btn" data-action="delete" data-uid="${this._escape(task.uid)}" title="Delete">✕</span>
          </span>
        </div>
        ${metaHtml}
        ${menuHtml}
      </div>
    `;
  }

  _render() {
    if (!this._content) return;
    const state = this._entityState();
    if (!state) {
      this._content.innerHTML = `<div class="ht-empty-col">Entity not found: ${this._escape(
        this._config.entity
      )}</div>`;
      return;
    }

    const allTasks = state.attributes.tasks || [];
    const members = state.attributes.members || [];
    const openTasks = allTasks.filter((t) => t.status !== "completed");
    const doneTasks = allTasks
      .filter((t) => t.status === "completed")
      .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));

    this._tasksByUid = Object.fromEntries(allTasks.map((t) => [t.uid, t]));

    const columns = [
      { key: "", name: "Unclaimed", color: "var(--secondary-text-color)", icon: "❔" },
      ...members.map((m) => ({ key: m.id, name: m.name, color: htColorForId(m.id), icon: null })),
      { key: "__done__", name: "Done", color: "var(--success-color, #3cb17d)", icon: "✅", isDone: true },
    ];
    const memberIds = new Set(members.map((m) => m.id));
    columns.forEach((col) => {
      if (col.isDone) {
        col.tasks = doneTasks;
      } else if (col.key === "") {
        // Unclaimed also catches orphaned assignee ids (e.g. a member
        // removed after being assigned a task) instead of letting those
        // tasks silently vanish from every column.
        col.tasks = openTasks.filter((t) => !t.assignee || !memberIds.has(t.assignee));
      } else {
        col.tasks = openTasks.filter((t) => t.assignee === col.key);
      }
    });
    this._columns = columns;

    const columnsHtml = columns
      .map(
        (col) => `
      <div class="ht-column" data-colkey="${this._escape(col.key)}">
        <div class="ht-column-header">
          ${
            col.icon
              ? `<span>${col.icon}</span>`
              : `<span class="ht-avatar" style="background:${col.color}">${this._escape(
                  (col.name[0] || "?").toUpperCase()
                )}</span>`
          }
          <span>${this._escape(col.name)}</span>
          <span class="ht-column-count">${col.tasks.length}</span>
        </div>
        <div class="ht-column-body" data-colkey="${this._escape(col.key)}">
          ${
            col.tasks.length
              ? col.tasks.map((t) => this._cardHtml(t, col)).join("")
              : `<div class="ht-empty-col">No tasks</div>`
          }
        </div>
      </div>
    `
      )
      .join("");

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
      <div class="ht-board">${columnsHtml}</div>
      <div class="ht-add">
        <div class="ht-add-main">
          <input type="text" class="ht-add-name" placeholder="Add a task…" value="${this._escape(
            this._draft.name
          )}">
          <button class="ht-add-submit" title="Add task">＋</button>
        </div>
        <div class="ht-add-options">
          <label class="ht-add-recurring">
            <input type="checkbox" class="ht-add-recurring-check" ${this._draft.recurring ? "checked" : ""}>
            Recurring
          </label>
          <input type="number" class="ht-add-interval" min="1" value="${this._draft.interval}"
            style="${this._draft.recurring ? "" : "display:none"}">
          <select class="ht-add-unit" style="${this._draft.recurring ? "" : "display:none"}">${unitOptions}</select>
          <select class="ht-add-assignee">${assigneeOptions}</select>
        </div>
      </div>
    `;

    this._wireEvents(members);
  }

  _wireEvents(members) {
    this._content.querySelectorAll(".ht-check").forEach((el) => {
      el.addEventListener("change", (e) => this._completeTask(e.currentTarget.getAttribute("data-uid")));
    });

    this._content.querySelectorAll('[data-action="reopen"]').forEach((el) => {
      el.addEventListener("click", (e) => {
        const task = this._tasksByUid[e.currentTarget.getAttribute("data-uid")];
        if (task) this._reopenTask(task, members);
      });
    });

    this._content.querySelectorAll('[data-action="delete"]').forEach((el) => {
      el.addEventListener("click", (e) => this._deleteTask(e.currentTarget.getAttribute("data-uid")));
    });

    this._content.querySelectorAll('[data-action="toggle-move"]').forEach((el) => {
      el.addEventListener("click", (e) => {
        const uid = e.currentTarget.getAttribute("data-uid");
        this._openMoveMenuUid = this._openMoveMenuUid === uid ? null : uid;
        this._render();
      });
    });

    this._content.querySelectorAll('[data-action="move"]').forEach((el) => {
      el.addEventListener("click", (e) => {
        const uid = e.currentTarget.getAttribute("data-uid");
        const target = e.currentTarget.getAttribute("data-target");
        const task = this._tasksByUid[uid];
        this._openMoveMenuUid = null;
        if (task) this._moveTask(task, target, members);
      });
    });

    // Desktop/mouse drag-and-drop as a bonus on top of tap-to-move (which
    // is what touch users get — this can't be tested from this sandbox,
    // so it must never be the *only* way to move a card).
    this._content.querySelectorAll(".ht-card").forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", el.getAttribute("data-uid"));
        el.classList.add("ht-dragging");
      });
      el.addEventListener("dragend", () => el.classList.remove("ht-dragging"));
    });

    this._content.querySelectorAll(".ht-column-body").forEach((el) => {
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.closest(".ht-column").classList.add("ht-drop-hover");
      });
      el.addEventListener("dragleave", () => {
        el.closest(".ht-column").classList.remove("ht-drop-hover");
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.closest(".ht-column").classList.remove("ht-drop-hover");
        const uid = e.dataTransfer.getData("text/plain");
        const task = this._tasksByUid[uid];
        const targetKey = el.getAttribute("data-colkey");
        if (task) this._moveTask(task, targetKey, members);
      });
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
  description: "Kanban-style board with a column per person plus Unclaimed/Done.",
});
