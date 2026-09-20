# 2905 Renovation Dashboard — Build Plan: Editable & Saveable

Your working game plan for turning the dashboard from a read-only viewer into a
tool you can **edit in the page** and **save**. Drop this in your repo as `PLAN.md`
and work through it phase by phase. Each phase is one Antigravity prompt and is
independently testable, so you never need to hold the whole thing in your head.

---

## 0. Where things stand

- Floor plan is real and rendering (Sweet Home 3D SVG inlined, wall PNG optimized to 69 KB).
- `data/data.js` holds real IDs, names, and square footages. `window.HOUSE = { meta, rooms[], circuits[] }`.
- Clicking a room opens a **read-only** panel. Nothing in the page can change data yet.
- "Editable" so far only meant *edit `data.js` by hand in the editor*. This plan adds real in-page editing.

### ⚠️ Fix this FIRST — you have a duplicate folder

The agent ran a `Copy-Item` that created a **nested copy**:
`C:\Users\aosla\Dev\house-dashboard\house-dashboard\`

That's the two-copy drift trap. Edits made in one copy silently don't show up in the other.

- **Canonical folder = the OUTER one:** `C:\Users\aosla\Dev\house-dashboard\` (has `index.html` at its root next to `css/ js/ data/ assets/`).
- **Delete the inner** `house-dashboard\house-dashboard\`.
- Whatever folder you open in Antigravity and in the browser must be the one with `index.html` directly inside it.

---

## 1. The one decision that shapes everything: how you save

A static page can't write to `data.js` on its own. Three ways to persist, and you're picking **B**:

| | Where data lives | Syncs across devices? | In git history? | Cost |
|---|---|---|---|---|
| A — localStorage only | that one browser | ❌ | ❌ | none, but data is trapped |
| **B — localStorage + Export (CHOSEN)** | browser now, `data.js` on export | ✅ via repo | ✅ | one paste+commit to persist |
| C — real backend | database | ✅ | ❌ (unless you log it) | server/auth/hosting; no longer static |

**Why B:** you keep git as the source of truth and Pages-simple hosting, and you still
get instant in-page editing that survives a refresh. The only manual step is exporting
`data.js` and committing it when you want the change permanent in the repo.

**The mental model:**
- *Local edits* → saved to `localStorage` the instant you type. Survive refresh. Live only in this browser.
- *Committed* → you click **Export data.js**, drop the file in the repo, `git commit`. Now it's permanent and syncs.
- A **sync pill** in the UI always tells you which state you're in: `● Local edits not exported` vs `✓ In sync with data.js`.

---

## 2. What becomes editable (the design contract)

**Editable in the panel** (you said "all editable" — this is all the *content*):
- `status` (dropdown: not-started / in-progress / blocked / complete)
- `percent` (0–100 slider)
- `budget`, `spent` (numbers)
- `notes` (textarea)
- `name` (display label), `type` (dropdown), `phase` (existing/proposed)
- `countsAsFinished` (checkbox) ← you need this to fix the hall2 bug, see §6
- `tasks` (add / rename / check off / delete)

**Locked by default — structural, keep read-only:**
- `id` — keyed to the SVG shape. Free-typing this desyncs the plan from the data. Renaming an id is a deliberate cross-file operation, not a casual edit.
- `area` — comes from your measured Sweet Home 3D plan. Hand-editing invites drift from reality.
- `floor` — controls which level renders.

Put these three behind an **"Advanced"** disclosure that unlocks them with a warning, so nothing is *impossible* to change, but you can't fumble them by accident.

**Circuits** (`HOUSE.circuits[]`: breaker, panel, amps, description, rooms[]) get their own editable table — that's Phase 4, different UI from the room panel.

---

## 3. Build phases — hand these to Antigravity one at a time

Do them in order. Test each before starting the next. Prompts to copy are in §5.

- **Phase 1 — Editable panel (in-memory).** Turn the read-only panel into form controls for the editable fields. Edits mutate the in-memory model and live-update the plan, list, charts, and KPIs. No saving yet — just prove editing works and the dashboard reflects it instantly.
- **Phase 2 — Persistence.** On load, overlay `localStorage` onto `data.js`. On every edit, write the overlay (debounced). Add a **Reset to file** button. Now edits survive refresh.
- **Phase 3 — Export round-trip.** Add **Export data.js** (regenerates the file, downloads it) and the **sync pill**. This closes the loop: browser → file → repo.
- **Phase 4 — Tasks + circuits editing.** Full task CRUD in the panel; a separate circuits editor table.
- **Phase 5 — Data audit & polish.** Fix the known correctness items in §6.

---

## 4. Technical spec (so the agent builds it right)

**Data flow**
```
data.js  ──sets──▶  window.HOUSE            (baseline / source of truth, in git)
                         │
  on load:  model = localStorage[KEY] ? JSON.parse(...) : structuredClone(window.HOUSE)
                         │
  every edit ──▶ mutate model ──▶ re-run the SAME render path used on first load
                         │         (aggregates, paintPlan, room list, charts, KPIs)
                         └──▶ debounced write: localStorage[KEY] = JSON.stringify(model)
```

- **localStorage key:** `house-dashboard:model:v1`
- **Overlay = the whole edited model** (not a diff). Simpler and robust at this scale.
- **Sync pill:** compare `JSON.stringify(model)` to `JSON.stringify(window.HOUSE)`. Equal → `✓ In sync`. Different → `● Local edits not exported`. (After you commit an export and reload, they match again automatically — no extra bookkeeping.)
- **Reset to file:** `localStorage.removeItem(KEY); location.reload();`
- **Export data.js:** build the file text as
  ```js
  const HEADER = `/* 2905 Renovation Dashboard — data (exported from the app) */\n`;
  const text = HEADER + "window.HOUSE = " + JSON.stringify(model, null, 2) + ";\n";
  // download as a Blob named data.js
  ```
  Valid JS, clean, re-loadable. (Optional: preserve the original comment header if you want the schema notes to survive.)

**Non-negotiables**
- Every edit must re-trigger the aggregate + render path, or the KPIs and charts will lie.
- Editing a field must never touch a room's `id` or the matching SVG `<g id>` — that link stays intact.
- Keep it driven from `HOUSE.rooms` / `HOUSE.circuits`. No hardcoded room ids anywhere.

---

## 5. Copy-paste prompts

### Phase 1 — Editable panel
```
Make the room detail panel editable (in-memory only; no persistence yet).

- Replace the read-only fields with form controls for: status (dropdown:
  not-started/in-progress/blocked/complete), percent (0–100 slider), budget (number),
  spent (number), notes (textarea), name (text), type (dropdown of existing types),
  phase (existing/proposed). Add a checkbox for countsAsFinished.
- Keep id, area, and floor READ-ONLY, shown under an "Advanced" disclosure that unlocks
  them with a warning. Never let an edit change a room's id or its SVG <g id>.
- On any edit, mutate the in-memory model and immediately re-run the SAME aggregate +
  render path used on initial load, so the floor plan, room list, charts, and KPIs update live.
- Everything stays driven from HOUSE.rooms — no hardcoded room ids.
- Do NOT add localStorage or export yet. This phase only proves editing + live re-render work.
```

### Phase 2 — Persistence (localStorage)
```
Add persistence via localStorage (Option B — file stays source of truth).

- Key: "house-dashboard:model:v1".
- On load: if the key exists, JSON.parse it as the working model; else structuredClone(window.HOUSE).
  Keep window.HOUSE untouched as the baseline for comparison.
- On every edit: debounced write of JSON.stringify(model) to that key.
- Add a "Reset to file" button that does localStorage.removeItem(key) then reloads —
  reverting to whatever data.js currently says.
- Verify: edit a room, refresh the page, the edit persists. Click Reset to file, it reverts.
```

### Phase 3 — Export round-trip + sync pill
```
Add an "Export data.js" button and a sync-status indicator.

- Export builds the file text: a short header comment, then
  "window.HOUSE = " + JSON.stringify(model, null, 2) + ";" and downloads it as data.js (Blob).
  The output must be valid JS that reloads cleanly to the same state.
- Sync pill in the header: compare JSON.stringify(model) to JSON.stringify(window.HOUSE).
  Equal -> "✓ In sync with data.js". Different -> "● Local edits not exported".
- Workflow the pill supports: edit (pill goes yellow) -> Export data.js -> replace
  data/data.js in the repo with the download -> reload -> pill goes green.
```

### Phase 4 — Tasks + circuits
```
Add full task editing and a circuits editor.

- In the room panel: add task (text -> new {label, done:false}), toggle done, rename, delete.
- Separate "Circuits" view/table editing HOUSE.circuits[]: breaker, panel, amps, description,
  and rooms[] (multi-select from existing room ids only, so no dangling references get created).
- All edits flow through the same model + persistence + export path from phases 1–3.
```

---

## 6. Data audit (Phase 5) — known items to fix

These are correctness issues I already spotted; fix them once editing is live (or as a data pass):

1. **`hall2` (55.88) — set `countsAsFinished: true`.** My scaffold had it as an exterior porch; your model shows it's an *interior hallway*, which IS finished space. This currently understates your finished sq ft.
2. **`entryporch` (25.20)** is the real exterior porch — `countsAsFinished: false` is correct for it.
3. **Audit placeholder tasks/budgets.** Some scaffold entries were illustrative filler that may have ridden onto renamed rooms. Real: garage Senville mini-split. Placeholder: e.g. the great-room "carpet torn out / subfloor" tasks and round-number budgets. Eyeball each room's tasks and $ and delete anything fictional.
4. **Photos** — `assets/photos/` is empty. Add files, list paths in each room's `photos[]`.
5. **Circuits** — only ~5 placeholder circuits exist. Walk the house with your breaker identifier and fill in `HOUSE.circuits[]`.

---

## 7. Verification snippets

**Wiring check** — run in the browser console with `index.html` open, any time after a change:
```js
(() => {
  const rooms = window.HOUSE?.rooms ?? [];
  const roomIds  = new Set(rooms.map(r => r.id));
  const shapeIds = new Set([...document.querySelectorAll('g.room[id]')].map(g => g.id));
  const notClickable = rooms.filter(r => !shapeIds.has(r.id)).map(r => r.id);
  const orphanShapes = [...shapeIds].filter(id => !roomIds.has(id));
  const danglingCircuits = (window.HOUSE?.circuits ?? [])
    .flatMap(c => (c.rooms ?? []).map(r => ({ circuit: c.id, room: r })))
    .filter(x => !roomIds.has(x.room));
  console.group('%cFloor-plan wiring check', 'font-weight:bold');
  console.log(`data rooms: ${roomIds.size}   tagged shapes: ${shapeIds.size}`);
  console.log('Rooms with NO shape (not clickable):', notClickable);
  console.log('Shapes with NO room (orphan ids):', orphanShapes);
  console.log('Circuit refs to missing rooms:', danglingCircuits);
  console.groupEnd();
})();
```
Three empty arrays = clean.

**Persistence smoke test** (after Phase 2): edit a room → note the value → refresh → value persists → click Reset to file → value reverts. If a refresh loses edits, the load-merge isn't reading localStorage.

**Export test** (after Phase 3): export, diff the downloaded `data.js` against the current one — the only changes should be the edits you made. Replace, reload, confirm the sync pill goes green.

---

## 8. Gotchas that will bite you

- **`file://` vs `http://localhost` are different origins → different localStorage.** If you double-click `index.html` sometimes and run `python -m http.server` other times, your saved edits will seem to vanish (they're stored under the other origin). **Pick one way to open it and stick with it.** Recommend the local server on a fixed port for consistency.
- **The nested-folder duplicate** (§0). Kill it before you start or you'll edit the wrong copy.
- **Export must stay valid JS.** If a round-trip ever produces a file that won't load, the exporter is emitting something `JSON.stringify` didn't (functions, undefined). The model should be plain data only.
- **Forgetting to re-render on edit** makes the dashboard silently lie — charts/KPIs stale while the panel shows new values. Every mutation goes through the render path.
- **Don't unlock `id`/`area` casually.** That's the one move that desyncs plan from data.

---

## 9. Suggested commit points

Commit after each green phase so you can roll back cleanly:
- `feat: editable room panel (in-memory)`
- `feat: localStorage persistence + reset`
- `feat: export data.js round-trip + sync pill`
- `feat: task + circuit editing`
- `chore: data audit — hall2 finished flag, strip placeholder tasks`

---

---

## Phase 6 — Make it real (triage + verify the spine)

The 3D work raced ahead of the data. "Real" now means *trustworthy underneath* and
*maintainable*, not more features. The more architectural it looks, the more it invites
you to trust numbers that were never verified — closing that gap is the whole job here.

**Keep / Freeze / Cut** (grade against the real purpose: a reno record you maintain for years)
- **Keep (core):** 2D plan, budget/status/tasks, localStorage + export/reset, per-room photos, panel/circuit visualizer, PWA offline (basement = no signal; aligned with real use).
- **Freeze (cosmetic — done enough, stop investing):** vinyl siding, brass knobs, '65 Mustang, carriage lanterns, golden-hour lighting, first-person walkthrough. Don't delete, don't touch.
- **Verify (the dangerous middle):** the 3D conduit/duct/PEX layers — see step 7.

**To-do, in order (3–7 are the actual distance to "real"):**
1. **Delete the duplicate folder** (§0) if not already done.
2. **Freeze cosmetic 3D** — a decision, not a task. Stop investing there.
3. **Fix `hall2` → `countsAsFinished: true`** (§6.1). Corrects finished sq ft.
4. **Strip placeholder tasks/budgets** (§6.3). Delete anything fictional that rode in from the scaffold.
5. **Stamp area accuracy** — add `meta.areaAccuracyNote` recording that areas are approximate (from a "somewhat accurate" model), so they don't get over-trusted.
6. **Settle circuits** — mark the placeholders (`placeholder: true`) or empty `HOUSE.circuits[]`. No fiction dressed as fact. Trace the real ones with your breaker tool.
7. **Make the infra layers honest** — open the code: are conduit/duct/PEX driven from `circuits[]` / real data, or hardcoded decoration? Data-driven → keep. Decorative → label "illustrative" in the UI so it can't be read as as-built.
8. **Decouple tracker from model** — two views, one `data.js`. Editing a room must not be able to break the 3D, or vice versa.
9. **Version the PWA cache** — bump a cache version on the service worker on every deploy, or it serves stale code and you edit without seeing changes (the app lies to you).
10. **Lock the net** — export→commit is the real save (localStorage is one cache-clear from gone). Run the §7 wiring + persistence checks after every agent session; commit per phase.

---

*Order of operations: delete the duplicate folder → Phase 1 → test → Phase 2 → test →
Phase 3 → test → then 4 and 5 whenever. You can stop after Phase 3 and already have a
fully editable, saveable dashboard. Phase 6 is the verify-the-spine pass that makes it
trustworthy, not just impressive — do steps 3–7 whenever you're ready to trust the numbers.*

---

## Phase 7 — 3D schematic infrastructure routing (data-driven, not as-built)

**Governing principle:** you can only route as accurately as your data, and your data is *connectivity, not geometry*. So every layer here is **schematic** — topologically true (what feeds what), never a claim about where a wire or pipe physically bends. Each layer carries a persistent UI badge: **"Schematic — shows what connects to what, not where it runs. Not as-built."** No wall gets drilled on the strength of these lines.

**"Editable" means edit the data, regenerate the 3D** — never hand-draw paths in space. A dragged spline through studs is the as-built fiction we're refusing. The 3D is a *projection* of the tables, exactly like the 2D plan is.

### Shared foundation (build once, all three layers use it)
- **`roomAnchor(roomId, z)`** — a utility returning a 3D point from the room's existing SVG polygon centroid at a given height. This is the default anchor for every node, so electrical needs almost no new data. Each layer's data can optionally override with an explicit `anchor: {x,y,z}`.
- **Orthogonal (right-angle) routing** — draw runs as axis-aligned polylines, not curves. Reads as "wiring diagram," reinforces that it's schematic, and is trivial to generate.
- **One generator pattern per layer:** read the layer's data from the working model → resolve anchors (explicit or centroid) → emit orthogonal tubes/lines source→node → group under one toggleable `Object3D` tagged with the layer name.
- **Flows through existing plumbing:** new data arrays live on `HOUSE`, so `JSON.stringify(model)` already exports them. Every edit mutates the model, triggers `refreshAll()`, and writes the localStorage overlay — same as tasks and circuits. The sync pill and Export just work.

### Shared Phase 7 Additions: Honesty & Field Capture

**SHARED — "% verified" indicator (all infra layers):**
- Standardize a `verified: bool` field across `circuits[]`, `fixtures[]`, `registers[]` (for circuits, `verified == !placeholder`). Default false on new nodes.
- Near the schematic badge, each active layer shows "N/M verified (X%)".
- The badge covers ROUTING honesty ("not where it runs"); this covers EXISTENCE honesty ("how much of this map is confirmed vs guessed"). Both must be visible.

**SHARED — Click-to-place nodes (place what you can see; generate what you can't):**
- A "Place [vent/fixture]" mode toggle. In that mode, a 3D click raycasts onto the current level's floor, creates a node with anchor `{x,y,z}` at the hit point.
- Auto-assign `room` by point-in-polygon against room points; respect main vs basement level.
- New node defaults `verified: false`; edit its attributes in the layer's table (or a popover).
- Click an existing node to select/delete; drag-to-reposition is a nice-to-have, not required.
- Paths are NEVER hand-drawn — only node ENDPOINTS are placed; runs stay generated/orthogonal.

### 7a — Electrical (do first: data already exists, proves the pattern cheaply)
Source = panel anchor (basement mech). Nodes = the rooms in each `circuits[].rooms[]`, at junction height. Generate one path per circuit, colored by panel/amps, toggled per circuit through the circuit table you already built. New data is minimal: a `meta.panelAnchor {x,y,z}` and an optional per-circuit color.

### 7b — Plumbing (new `fixtures[]` layer)
```
fixtures: [
  { id, room, type: "sink|toilet|shower|tub|washer|hosebib|waterheater|softener",
    hot: bool, cold: bool, drain: bool, anchor: {x,y,z}|null }  // null → room centroid
]
```
Source = water-heater/softener manifold. Generate cold (blue) to every fixture, hot (red) where `hot:true`, drain (grey) to a stack. You populate it by walking the house — you know where your fixtures are.

### 7c — HVAC (new `registers[]` layer)
```
registers: [
  { id, room, kind: "supply|return", size: "4x10"|…, cfm: number|null, anchor: {x,y,z}|null, verified: bool }
]
```
Source = furnace/air handler. Generate a main trunk → branches to each supply register → return trunk from returns. Schematic trunk-and-branch, not modeled duct.

**Sequence:** 7a → 7b → 7c. Electrical rides on data you have and validates the anchor+generator utility before you invest in populating the two new layers.

### Copy-paste prompts

**Phase 7a — Electrical routing**
```
Build a shared schematic-routing foundation, then the electrical layer.

FOUNDATION (used by all infra layers):
- roomAnchor(roomId, z): returns a 3D point from the room's SVG polygon centroid at height z.
  Every node defaults to this; data may override with an explicit anchor {x,y,z}.
- Route paths as orthogonal (axis-aligned) polylines, not curves — schematic, not as-built.
- Each layer is one toggleable Object3D group tagged by layer name.
- A persistent UI badge on every infra layer: "Schematic — what connects to what, not where it
  runs. Not as-built." Non-dismissable.

ELECTRICAL:
- Add meta.panelAnchor {x,y,z} (basement mechanical). Optional per-circuit color.
- For each circuit, draw orthogonal paths from panelAnchor to each room in circuits[].rooms[],
  at junction height, colored by panel/amps. Toggle per circuit via the existing circuit table.
- No new geometry data beyond panelAnchor — use roomAnchor for room nodes.
- Regenerate on edit; flows through the existing model/persistence/export path. Do NOT add drag editing.
```

**Phase 7b — Plumbing routing**
```
Add a plumbing layer, same schematic pattern as electrical.

- New HOUSE.fixtures[]: { id, room, type (sink|toilet|shower|tub|washer|hosebib|waterheater|
  softener), hot:bool, cold:bool, drain:bool, anchor:{x,y,z}|null }.
- Table editor like the circuits table: room dropdown (valid ids only), type dropdown,
  hot/cold/drain checkboxes, delete. Edits flow through model/persistence/export.
- Generator: source = the waterheater/softener fixture (or meta.manifoldAnchor). Cold (blue) to
  every fixture, hot (red) where hot:true, drain (grey) to a stack. Orthogonal. Toggleable group.
  Reuse roomAnchor for defaults. Keep the schematic badge.
```

**Phase 7c — HVAC registers (with shared Phase-7 additions)**
```
Phase 7c — HVAC registers, with the two shared Phase-7 additions.

FIRST, shared pieces (used by all infra layers):
1. Add `verified:bool` to circuits[]/fixtures[]/registers[] (circuits: verified == !placeholder),
   default false. Show "N/M verified (X%)" next to the schematic badge for each active layer.
2. Click-to-place: a "Place vent" mode; a 3D click raycasts onto the current level's floor and
   creates a register at that point. Auto-set room by point-in-polygon; respect main/basement level.
   Click a placed node to select/delete. Do NOT let paths be hand-drawn — only endpoints are placed.

THEN HVAC:
- HOUSE.registers[]: { id, room, kind (supply|return), size, cfm:number|null,
  anchor:{x,y,z}|null, verified:bool }. anchor null -> room centroid.
- Table editor like circuits: room dropdown (valid ids only), kind, size, cfm, verified, delete.
- Generator: furnace/air-handler anchor (meta.furnaceAnchor) -> main trunk -> branch to each
  supply register -> return trunk from returns. Orthogonal, schematic, toggleable group, schematic badge.
- Set meta.panelAnchor to the basement-mech room centroid (the panel sits mid-mechanical-room);
  if that room has no 2D footprint, leave the current value and note it's a manual placeholder.
```
