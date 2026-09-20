# 2905 Renovation Dashboard

An interactive, clickable floor-plan progress tracker for the Columbia City house.
Click a room → see status, % complete, budget vs spent, tasks, photos, and the
circuits that feed it. Toggle between the **current** house and **proposed**
(drawn-but-not-built) changes. Charts summarize the whole project.

Static site — no backend, no build step. Vanilla HTML/CSS/JS + Chart.js.

---

## Run it

**Fastest:** double-click `index.html`. It works straight off the file system —
data and the plan are loaded as plain scripts, so there's no CORS/server issue.

**With a dev server** (nicer for editing; Antigravity gives you one):
```
cd house-dashboard
python3 -m http.server 8000     # then open http://localhost:8000
```

---

## File map

```
house-dashboard/
├─ index.html          shell + the floor-plan SVG is inlined here
├─ css/style.css       styling (architect's-drawing theme, light + dark)
├─ data/data.js        ← YOU LIVE HERE. rooms, circuits, config.
├─ js/app.js           aggregates, selection, phase toggle, panel
├─ js/charts.js        the three charts
├─ assets/photos/      drop room photos here
└─ README.md
```

**The only file you need to touch for day-to-day updates is `data/data.js`.**
Change a room's `status`, `percent`, `spent`, `tasks`, or `photos` and reload.

---

## Swap in your real floor plan

The plan currently shown is a **placeholder grid** with your real room IDs. To use
your actual layout:

1. In Sweet Home 3D: **Plan → Export to SVG format**.
2. Open the exported `.svg` in a text editor. Copy the whole `<svg>…</svg>`.
3. In `index.html`, replace the placeholder `<svg id="floorplan">…</svg>` block
   with yours. Keep the `id="floorplan"` on the root `<svg>`.

### The one manual bridge step (be aware of this)
The dashboard finds each room by the **`id` on its shape** — e.g. a room `<path>`
or `<polygon>` with `id="great-room"`. **Sweet Home 3D's SVG export does *not*
add those ids** (it exports room *names* as separate text, not as shape ids). So
after pasting your SVG you'll need to add `id="…"` to each room shape, matching
the ids in `data.js` (`great-room`, `br1`, `kitchen`, …).

That's the ~20-shape tagging pass I flagged. Two ways to do it:
- By hand: find each room polygon in the SVG and add the id. Tedious but simple.
- Hand the exported SVG + the id list from `data.js` to your Antigravity agent and
  have it add the ids by matching each polygon to its nearest name label. Faster.

Any room in `data.js` **without** a matching shape still shows up in the room list
and charts — it just won't be clickable on the plan. So nothing breaks if you
tag them gradually.

---

## Editing the data

Each room in `data/data.js`:
```
status:   "not-started" | "in-progress" | "blocked" | "complete"
percent:  0–100
budget / spent:  dollars
tasks:    [ { label: "Replace subfloor", done: false } ]
photos:   [ "assets/photos/great-room-1.jpg" ]
phase:    "existing"  (built)  |  "proposed"  (drawn, not built)
countsAsFinished:  false for garage / porch / unfinished basement
```

**Overall % weighting** — this was the open question. It's a knob at the top of
`data.js`:
```
meta.progressWeighting: "area"    // big rooms count more (uses sq ft)  ← default
                        "budget"  // weight by $ (best effort proxy)
                        "equal"   // every room the same (simple, misleading)
```

**Photos:** drop image files in `assets/photos/`, then list their paths in the
room's `photos` array.

**Circuits:** the electrical layer lives in `data.js` under `circuits` — each has a
breaker number, panel, amps, description, and the room ids it feeds. Walk the house
with your breaker identifier and fill it in; the detail panel shows each room's
circuits automatically.

---

## Host it (for showing your dad a link)

Either is free:

- **GitHub Pages:** push this folder to a repo → Settings → Pages → deploy from
  `main` / root. Live at `https://<you>.github.io/<repo>/`.
- **Netlify:** drag the folder onto the Netlify dashboard. Instant URL.

No config needed — it's all static.

---

## Starter prompt for Antigravity

> This is a static floor-plan renovation dashboard (vanilla JS + Chart.js).
> All data is in `data/data.js` (rooms + circuits). `index.html` inlines the
> floor-plan SVG; rooms are `<g class="room" id="…">`. `app.js` handles
> selection, the phase toggle, and aggregates; `charts.js` the charts.
> Next: [e.g. "add id attributes to my exported SVG in index.html to match the
> room ids in data.js" / "add a 'add task' UI that writes to localStorage" /
> "add a basement floor plan as a second SVG and a floor switcher"].
